"use client";

import { GREETING_FALLBACK_CHIPS, GREETING_FALLBACK_CONTENT } from "@/lib/onboarding/chat-ui";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

// ─── Public shape ─────────────────────────────────────────────────────────────

export interface UIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  chips?: string[];
  card?: { section: "experience" | "skills" | "education"; data: unknown };
}

export type ExtractionStatus = "none" | "pending" | "done" | "failed";

interface TurnCompletePayload {
  stage: string;
  chips?: string[];
  hardMinimumMet?: boolean;
}

interface SessionHydration {
  stage: string;
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
    chips?: string[];
    card?: { section: "experience" | "skills" | "education"; data: unknown };
  }>;
  isReturning: boolean;
}

// ─── Request body types (keeps the protocol explicit) ────────────────────────

type ChatRequestBody =
  | { kind: "greeting" }
  | { kind: "message"; text: string }
  | { kind: "resume_data"; profile: unknown }
  | { kind: "resume_failed" };

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOnboardingChat() {
  const router = useRouter();
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [extractionStatus, setExtractionStatus] = useState<ExtractionStatus>("none");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const greetingFiredRef = useRef(false);

  // ── Core: POST a turn + stream the response ─────────────────────────────
  const sendTurn = useCallback(
    async (body: ChatRequestBody) => {
      setIsStreaming(true);
      setErrorMessage(null);

      const streamingId = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setMessages((prev) => [...prev, { id: streamingId, role: "assistant", content: "" }]);

      const isGreeting = body.kind === "greeting";

      const applyFallback = () => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamingId
              ? {
                  ...m,
                  content: GREETING_FALLBACK_CONTENT,
                  chips: [...GREETING_FALLBACK_CHIPS],
                }
              : m,
          ),
        );
      };

      const removeStreaming = () => {
        setMessages((prev) => prev.filter((m) => m.id !== streamingId));
      };

      try {
        const res = await fetch("/api/onboarding/v2/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok || !res.body) {
          throw new Error(`Chat request failed (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let completed = false;

        // SSE frames are separated by a blank line (`\n\n`). Parse frame-by-frame.
        const parseFrame = (frame: string) => {
          let eventType = "message";
          const dataLines: string[] = [];
          for (const line of frame.split("\n")) {
            if (line.startsWith("event:")) {
              eventType = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              dataLines.push(line.slice(5).replace(/^ /, ""));
            }
          }
          if (dataLines.length === 0) return;
          const raw = dataLines.join("\n");

          if (eventType === "token") {
            try {
              const token = JSON.parse(raw) as string;
              setMessages((prev) =>
                prev.map((m) => (m.id === streamingId ? { ...m, content: m.content + token } : m)),
              );
            } catch {
              /* malformed token frame — skip */
            }
          } else if (eventType === "turn_complete") {
            try {
              const payload = JSON.parse(raw) as TurnCompletePayload;
              const chips = payload.chips ?? [];
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamingId ? { ...m, chips: chips.length ? chips : undefined } : m,
                ),
              );
              if (payload.stage === "complete") {
                setIsComplete(true);
                setTimeout(() => router.push("/dashboard"), 2500);
              }
              completed = true;
            } catch {
              /* malformed — fall through to generic error handling below */
            }
          } else if (eventType === "error") {
            let msg = "Something went wrong. Please try again.";
            try {
              const parsed = JSON.parse(raw) as { message?: string };
              if (parsed.message) msg = parsed.message;
            } catch {
              /* ignore */
            }
            if (isGreeting) {
              applyFallback();
            } else {
              removeStreaming();
              setErrorMessage(msg);
            }
            completed = true;
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          for (;;) {
            const sep = buf.indexOf("\n\n");
            if (sep === -1) break;
            const frame = buf.slice(0, sep);
            buf = buf.slice(sep + 2);
            if (frame.length > 0) parseFrame(frame);
          }
        }

        // Flush any trailing frame (no final blank line).
        if (buf.trim().length > 0) parseFrame(buf);

        // Stream ended without a turn_complete event → treat as failure.
        if (!completed) {
          if (isGreeting) applyFallback();
          else {
            const hasContent = await new Promise<boolean>((resolve) => {
              setMessages((prev) => {
                const m = prev.find((x) => x.id === streamingId);
                resolve(Boolean(m && m.content.length > 0));
                return prev;
              });
            });
            if (!hasContent) removeStreaming();
          }
        }
      } catch (err) {
        if (isGreeting) {
          applyFallback();
        } else {
          removeStreaming();
          setErrorMessage(err instanceof Error ? err.message : "Network error");
        }
      } finally {
        setIsStreaming(false);
      }
    },
    [router],
  );

  // ── Hydrate existing session on mount (refresh/returning user) ──────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/onboarding/v2/session", {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`session ${res.status}`);
        const data = (await res.json()) as SessionHydration;
        if (cancelled) return;

        if (data.isReturning && data.messages?.length) {
          const hydrated: UIMessage[] = data.messages
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m, i) => ({
              id: `hist-${i}`,
              role: m.role as "user" | "assistant",
              content: m.content,
              chips: m.chips?.length ? m.chips : undefined,
              card: m.card,
            }));
          // Only expose chips on the last assistant message so earlier turns
          // aren't interactive.
          for (let i = 0; i < hydrated.length - 1; i++) {
            const msg = hydrated[i];
            if (msg) msg.chips = undefined;
          }
          setMessages(hydrated);
          if (data.stage === "complete") setIsComplete(true);
          greetingFiredRef.current = true;
          return;
        }

        if (!greetingFiredRef.current) {
          greetingFiredRef.current = true;
          void sendTurn({ kind: "greeting" });
        }
      } catch {
        // Hydration failed — still fire greeting so the user sees something.
        if (!cancelled && !greetingFiredRef.current) {
          greetingFiredRef.current = true;
          void sendTurn({ kind: "greeting" });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sendTurn]);

  // ── Public: user sends text ─────────────────────────────────────────────
  const sendMessage = useCallback(
    (text: string) => {
      setMessages((prev) => {
        // Clear chips from the previous assistant turn so they can't be tapped twice.
        const cleared = prev.map((m, i) =>
          i === prev.length - 1 ? { ...m, chips: undefined } : m,
        );
        return [
          ...cleared,
          {
            id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            role: "user",
            content: text,
          },
        ];
      });
      void sendTurn({ kind: "message", text });
    },
    [sendTurn],
  );

  const confirmChip = useCallback(
    (value: string) => {
      sendMessage(value);
    },
    [sendMessage],
  );

  // ── File upload — structured payload, no string sentinels ───────────────
  const uploadFile = useCallback(
    async (file: File) => {
      setExtractionStatus("pending");
      setErrorMessage(null);

      const fd = new FormData();
      fd.append("file", file);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);

      try {
        const res = await fetch("/api/onboarding/v2/upload", {
          method: "POST",
          body: fd,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const data = (await res.json().catch(() => ({}))) as {
          result?: unknown;
          error?: string;
        };

        if (!res.ok || !data.result) {
          setExtractionStatus("failed");
          void sendTurn({ kind: "resume_failed" });
          return;
        }

        setExtractionStatus("done");
        void sendTurn({ kind: "resume_data", profile: data.result });
      } catch (err) {
        clearTimeout(timeout);
        console.error("[uploadFile]", err);
        setExtractionStatus("failed");
        void sendTurn({ kind: "resume_failed" });
      }
    },
    [sendTurn],
  );

  return {
    messages,
    isStreaming,
    isComplete,
    extractionStatus,
    errorMessage,
    sendMessage,
    confirmChip,
    uploadFile,
  };
}
