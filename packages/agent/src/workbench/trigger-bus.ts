/**
 * Trigger bus.
 *
 * Pub/sub for blackboard events. Specialists and monitors subscribe by
 * path-glob; the orchestrator publishes one event per committed write.
 *
 * Listener execution is fire-and-forget from the publisher's perspective,
 * but listener errors are caught, logged, and surfaced via `onError`.
 *
 * @brain thalamus: cortical relay / event router
 */

import type { BlackboardEvent } from "@retune/types";
import type { EventListener } from "./types";

type ErrorReporter = (
  err: unknown,
  context: { listener_id: string; event: BlackboardEvent },
) => void;

const DEFAULT_ERROR_REPORTER: ErrorReporter = (err, ctx) => {
  // eslint-disable-next-line no-console
  console.error(
    `[trigger-bus] listener "${ctx.listener_id}" threw on event "${ctx.event.path}":`,
    err,
  );
};

export class TriggerBus {
  private readonly listeners = new Map<string, EventListener>();
  private onError: ErrorReporter = DEFAULT_ERROR_REPORTER;

  set_error_reporter(reporter: ErrorReporter): void {
    this.onError = reporter;
  }

  subscribe(listener: EventListener): () => void {
    if (this.listeners.has(listener.id)) {
      throw new Error(`listener "${listener.id}" already subscribed`);
    }
    this.listeners.set(listener.id, listener);
    return () => this.listeners.delete(listener.id);
  }

  /**
   * Publish one event to all matching listeners. Awaits all listener
   * promises so that monitors which produce conflicts are settled before
   * the orchestrator picks the next goal.
   */
  async publish(event: BlackboardEvent): Promise<void> {
    const matched: EventListener[] = [];
    for (const listener of this.listeners.values()) {
      if (path_matches(event.path, listener.path_glob)) matched.push(listener);
    }
    if (matched.length === 0) return;

    const results = await Promise.allSettled(
      matched.map(async (l) => {
        await l.on_event(event);
      }),
    );
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r?.status === "rejected") {
        const listener = matched[i];
        if (!listener) continue;
        this.onError(r.reason, { listener_id: listener.id, event });
      }
    }
  }

  /** Snapshot of currently subscribed listener ids. */
  list_listeners(): string[] {
    return [...this.listeners.keys()];
  }
}

/**
 * Glob match for dot-separated paths. Supports `*` as a single-segment
 * wildcard and `**` as multi-segment.
 *
 * Examples:
 *   "draft.bullets.*"            matches "draft.bullets.<id>" but not deeper
 *   "draft.bullets.**"           matches "draft.bullets.<id>.text"
 *   "hypotheses.role_schema"     exact match
 */
export function path_matches(path: string, glob: string): boolean {
  if (glob === "**") return true;
  if (glob === path) return true;

  const path_parts = path.split(".");
  const glob_parts = glob.split(".");

  let pi = 0;
  let gi = 0;
  while (pi < path_parts.length && gi < glob_parts.length) {
    const g = glob_parts[gi];
    if (g === "**") {
      // Match any number of remaining path segments.
      if (gi === glob_parts.length - 1) return true;
      // Try to match the rest of the glob against any tail of the path.
      const rest_glob = glob_parts.slice(gi + 1).join(".");
      for (let k = pi; k <= path_parts.length; k++) {
        if (path_matches(path_parts.slice(k).join("."), rest_glob)) return true;
      }
      return false;
    }
    if (g === "*") {
      pi++;
      gi++;
      continue;
    }
    if (g !== path_parts[pi]) return false;
    pi++;
    gi++;
  }
  return pi === path_parts.length && gi === glob_parts.length;
}
