// GET /api/onboarding-v2/upload/stream
//
// Server-Sent Events progress channel surfaced to the client during Stage 1-3
// processing. The actual extraction + LLM work happens in the upload POST
// handler — this stream observes progress by polling the session status and
// emits typed events that the client consumes via EventSource.
//
// Events:
//   progress      — { stage: "uploading"|"extracting"|"mapping", message }
//   complete      — { stage: "complete", message }
//   error         — { code, message }
//   slow_connection — { message }  (after SLOW_CONNECTION_TIMEOUT_MS)

import { getOnboardingV2UserId } from "@/lib/onboarding-v2/auth";
import { SLOW_CONNECTION_TIMEOUT_MS } from "@/lib/onboarding-v2/constants";
import { loadSession } from "@/lib/onboarding-v2/session";

export const dynamic = "force-dynamic";

const PROGRESS_MESSAGES = [
  { stage: "uploading", message: "Uploading your resume..." },
  { stage: "extracting", message: "Reading your resume..." },
  { stage: "mapping", message: "Understanding your career..." },
  { stage: "complete", message: "Done! Let me show you what I found." },
] as const;

export async function GET(req: Request) {
  const userId = await getOnboardingV2UserId();
  if (!userId) return new Response("unauthorized", { status: 401 });

  const url = new URL(req.url);
  const expectedSessionId = url.searchParams.get("sessionId");

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const startedAt = Date.now();
      let lastStage = "";
      let slowEmitted = false;
      let cancelled = false;

      const emit = (event: string, data: unknown) => {
        if (cancelled) return;
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          cancelled = true;
        }
      };

      // Initial event so the client sees the connection is live.
      emit("progress", PROGRESS_MESSAGES[0]);

      const stageToMessage = (status: string): (typeof PROGRESS_MESSAGES)[number] => {
        switch (status) {
          case "awaiting_upload":
            return PROGRESS_MESSAGES[0];
          case "extraction_complete":
            return PROGRESS_MESSAGES[1];
          case "dual_extraction_complete":
            return PROGRESS_MESSAGES[2];
          case "inference_complete":
          case "summary_confirmed":
          case "correction_in_progress":
          case "path_branched":
          case "resume_questions_complete":
          case "voice_extraction_complete":
          case "committed":
            return PROGRESS_MESSAGES[3];
          default:
            return PROGRESS_MESSAGES[1];
        }
      };

      // Poll session every 700ms and emit progress when the stage advances.
      const interval = setInterval(async () => {
        if (cancelled) return;
        try {
          const session = await loadSession(userId);
          if (!session) return;
          if (expectedSessionId && session.session_id !== expectedSessionId) return;

          const next = stageToMessage(session.onboarding_status);
          if (next.stage !== lastStage) {
            lastStage = next.stage;
            emit(next.stage === "complete" ? "complete" : "progress", next);

            if (next.stage === "complete") {
              clearInterval(interval);
              try {
                controller.close();
              } catch {
                /* already closed */
              }
              return;
            }
          }

          // Slow-connection notification (one-shot).
          if (
            !slowEmitted &&
            Date.now() - startedAt > SLOW_CONNECTION_TIMEOUT_MS &&
            next.stage !== "complete"
          ) {
            slowEmitted = true;
            emit("slow_connection", {
              message:
                "This is taking longer than expected — you can keep waiting or try again with a smaller file.",
            });
          }
        } catch {
          // Don't kill the stream on transient DB errors; rely on client timeout.
        }
      }, 700);

      // Hard ceiling — close after 2 minutes regardless.
      const timeout = setTimeout(() => {
        if (cancelled) return;
        cancelled = true;
        clearInterval(interval);
        emit("error", { code: "stream_timeout", message: "Connection closed — please refresh." });
        try {
          controller.close();
        } catch {
          /* noop */
        }
      }, 120_000);

      const onAbort = () => {
        cancelled = true;
        clearInterval(interval);
        clearTimeout(timeout);
        try {
          controller.close();
        } catch {
          /* noop */
        }
      };
      req.signal.addEventListener("abort", onAbort);
    },
    cancel() {
      // Caller closed the stream; loop short-circuits next tick.
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
