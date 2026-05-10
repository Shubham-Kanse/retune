/**
 * SSE stream client with reconnection and Last-Event-ID resume.
 *
 * Connects to /api/generate/[id]/stream, parses typed events, and
 * dispatches them to subscribers. Handles reconnection with exponential
 * backoff and resumes from the last-seen sequence number.
 *
 * The cognitive backend sends NAMED SSE events (event: trace, event: done,
 * event: error, event: narrative_paragraph, event: ping). EventSource.onmessage
 * only fires for UNNAMED events — so we use addEventListener for every named
 * event type we care about.
 */

import type { PipelineEvent, PipelineEventType } from "./events";

export type EventHandler = (event: PipelineEvent) => void;

export interface StreamClientOptions {
  url: string;
  lastEventId?: number;
  maxReconnectAttempts?: number;
  onEvent: EventHandler;
  onError?: (error: Error) => void;
  onClose?: () => void;
  signal?: AbortSignal;
}

const MAX_RECONNECT_DELAY_MS = 10_000;
const INITIAL_RECONNECT_DELAY_MS = 500;

// All named event types the cognitive backend can emit
const NAMED_EVENT_TYPES: PipelineEventType[] = [
  "trace",
  "ping",
  "done",
  "error",
  "complete",
  "narrative_paragraph",
  "tick_start",
  "tick_end",
  "specialist_picked",
  "goal_emitted",
  "goal_satisfied",
  "conflict_emitted",
  "outcome_predicted",
  "cost_charge",
  "step_start",
  "step_complete",
  "ats_score",
  "agent_log",
  "content_chunk",
  "user_action_required",
  "external_abort",
];

export class StreamClient {
  private eventSource: EventSource | null = null;
  private seq = 0;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts: number;
  private readonly options: StreamClientOptions;
  private closed = false;

  constructor(options: StreamClientOptions) {
    this.options = options;
    this.seq = options.lastEventId ?? 0;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 5;
  }

  connect(): void {
    if (this.closed) return;

    const url = this.seq > 0 ? `${this.options.url}?lastEventId=${this.seq}` : this.options.url;
    this.eventSource = new EventSource(url);

    const handleRaw = (raw: MessageEvent, forcedType?: PipelineEventType) => {
      this.reconnectAttempts = 0;
      if (!raw.data || raw.data === "") return; // heartbeat ping
      try {
        const parsed = JSON.parse(raw.data as string) as Record<string, unknown>;

        // The cognitive backend puts the payload directly in data (not nested under "data")
        // Normalise to a PipelineEvent shape the store can consume
        const type = (forcedType ?? parsed.type ?? "trace") as PipelineEventType;
        const event: PipelineEvent = {
          id: String(parsed.id ?? `${Date.now()}-${this.seq}`),
          seq: (parsed.seq as number) ?? ++this.seq,
          type,
          timestamp: (parsed.timestamp as number) ?? Date.now(),
          // Pass the whole parsed object as data so the store can read any field
          data: parsed as Record<string, unknown>,
        };

        this.seq = event.seq;
        this.options.onEvent(event);

        if (
          type === "complete" ||
          type === "done" ||
          type === "error" ||
          type === "external_abort"
        ) {
          this.close();
        }
      } catch {
        // Ignore unparseable frames
      }
    };

    // Catch unnamed messages (fallback)
    this.eventSource.onmessage = (raw) => handleRaw(raw);

    // Listen for every named event type the backend can emit
    for (const evType of NAMED_EVENT_TYPES) {
      this.eventSource.addEventListener(evType, (raw) => handleRaw(raw as MessageEvent, evType));
    }

    this.eventSource.onerror = () => {
      this.eventSource?.close();
      this.eventSource = null;

      if (this.closed) return;

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.options.onError?.(new Error("Max reconnection attempts reached"));
        this.close();
        return;
      }

      const delay = Math.min(
        MAX_RECONNECT_DELAY_MS,
        INITIAL_RECONNECT_DELAY_MS * 2 ** this.reconnectAttempts,
      );
      this.reconnectAttempts++;
      setTimeout(() => this.connect(), delay);
    };

    this.options.signal?.addEventListener("abort", () => this.close(), { once: true });
  }

  close(): void {
    this.closed = true;
    this.eventSource?.close();
    this.eventSource = null;
    this.options.onClose?.();
  }

  getLastSeq(): number {
    return this.seq;
  }
}
