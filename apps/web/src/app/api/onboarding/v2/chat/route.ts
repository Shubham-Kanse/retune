/**
 * POST /api/onboarding/v2/chat
 *
 * Sequential question queue. The server owns question order. The AI only
 * phrases the next question warmly (one sentence, ≤20 words).
 *
 * Protocol
 * --------
 * Request body is one of:
 *   { kind: "greeting" }                          // initial turn, no session yet
 *   { kind: "message", text: string }             // user free-form / chip reply
 *   { kind: "resume_data", profile: unknown }     // upload parsed server-side
 *   { kind: "resume_failed" }                     // upload failed, continue anyway
 *
 * Response is an SSE stream with three event types:
 *   event: token          → JSON-string token to append
 *   event: turn_complete  → { stage, chips, hardMinimumMet }
 *   event: error          → { message }
 */

import { withAuth } from "@/lib/api-handler";
import { ValidationError } from "@/lib/errors";
import { streamChatTurn } from "@/lib/onboarding/chat-provider";
import { checkHardMinimum } from "@/lib/onboarding/completeness-gate";
import { parseUserMessage } from "@/lib/onboarding/field-parser";
import {
  type OnboardingState,
  type StoredMessage,
  getOrCreateSession,
  resetSession,
  saveSession,
} from "@/lib/onboarding/session-store";
import type { ProfileNormalized } from "@/lib/profile-domain/contracts";
import { persistProfile } from "@/lib/profile-domain/repositories/profile-repository";
import { normalizeProfile } from "@/lib/profile-domain/services/normalizer";

// ─── Request body ─────────────────────────────────────────────────────────────

type ChatRequest =
  | { kind: "greeting" }
  | { kind: "message"; text: string }
  | { kind: "resume_data"; profile: unknown }
  | { kind: "resume_failed" };

function parseBody(raw: unknown): ChatRequest {
  if (!raw || typeof raw !== "object") throw new ValidationError("Invalid request body");
  const r = raw as Record<string, unknown>;
  switch (r.kind) {
    case "greeting":
      return { kind: "greeting" };
    case "message": {
      const text = typeof r.text === "string" ? r.text.trim() : "";
      if (!text) throw new ValidationError("Message text is required");
      return { kind: "message", text };
    }
    case "resume_data":
      return { kind: "resume_data", profile: r.profile ?? null };
    case "resume_failed":
      return { kind: "resume_failed" };
    default:
      throw new ValidationError("Unknown request kind");
  }
}

// ─── Question queue ───────────────────────────────────────────────────────────

type QueueField = keyof ProfileNormalized | "greeting";

interface QueueItem {
  field: QueueField;
  prompt: string;
  chips?: string[];
}

const QUESTION_QUEUE: QueueItem[] = [
  {
    field: "greeting",
    prompt:
      "Greet the user warmly in one sentence and ask how they'd like to build their profile — by uploading a resume or starting from scratch.",
    chips: ["📄 Upload my resume", "✍️ Start from scratch"],
  },
  { field: "fullName", prompt: "Ask for their full name in one warm sentence." },
  { field: "currentTitle", prompt: "Ask for their current job title in one warm sentence." },
  {
    field: "experienceLevel",
    prompt: "Ask how many years of experience they have. Mention they can tap a chip or type.",
    chips: [
      "Entry (0–2 yrs)",
      "Early (2–4 yrs)",
      "Mid (4–7 yrs)",
      "Senior (7–10 yrs)",
      "Staff (10+ yrs)",
    ],
  },
  {
    field: "experience",
    prompt:
      "Ask about their most recent role — company and title is enough. Keep it to one warm sentence.",
  },
  {
    field: "targetRoles",
    prompt: "Ask what roles they're targeting next. Mention they can pick chips or type.",
    chips: [
      "Software Engineer",
      "Backend Engineer",
      "Frontend Engineer",
      "Full Stack Engineer",
      "AI/ML Engineer",
      "Data Engineer",
      "DevOps/SRE",
      "Product Manager",
    ],
  },
  { field: "location", prompt: "Ask where they're currently based in one sentence." },
];

const MAX_WORDS_PER_TURN = 25;
const MAX_TOKENS = 80;

// ─── SSE helpers ──────────────────────────────────────────────────────────────

function sseEvent(type: string, data: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

type DeltaBag = Partial<ProfileNormalized> & Record<string, unknown>;

function hasValue(delta: DeltaBag, field: QueueField): boolean {
  if (field === "greeting") return false;
  const v = delta[field as string];
  if (v == null || v === "") return false;
  if (Array.isArray(v) && v.length === 0) return false;
  return true;
}

/** Synthesize a single `experience` entry from loose fields when hardMinimum
 *  needs it but the user hasn't given a structured answer. */
function synthesizeExperience(delta: DeltaBag): DeltaBag {
  if (Array.isArray(delta.experience) && delta.experience.length > 0) return delta;
  const title = typeof delta.currentTitle === "string" ? delta.currentTitle : "";
  const company = typeof delta.company === "string" ? delta.company : "";
  if (!title && !company) return delta;
  return {
    ...delta,
    experience: [{ company: company || "Current", title: title || "Role" }],
  };
}

function findNextQueueIndex(delta: DeltaBag, from: number): number {
  for (let i = Math.max(from, 1); i < QUESTION_QUEUE.length; i++) {
    const item = QUESTION_QUEUE[i];
    if (item && !hasValue(delta, item.field)) return i;
  }
  return QUESTION_QUEUE.length;
}

function buildSystemPrompt(
  nextItem: QueueItem | null,
  variant: "greeting" | "resume_ok" | "resume_fail" | "normal",
  userName?: string,
): string {
  const base = `You are retune's onboarding assistant — warm, concise, like a thoughtful career coach. HARD RULES: Write EXACTLY ONE sentence. Stop after it. Do NOT summarise prior answers. Do NOT ask multiple things. Max ${MAX_WORDS_PER_TURN} words total.`;

  if (variant === "greeting" || (nextItem && nextItem.field === "greeting")) {
    return `${base}\n\nTASK: ${QUESTION_QUEUE[0]?.prompt ?? ""}`;
  }
  if (!nextItem) return base;

  if (variant === "resume_ok") {
    const nameClause = userName ? `, addressing them as ${userName}` : "";
    return `${base}\n\nCONTEXT: A resume was just uploaded and parsed.\nTASK: Acknowledge the upload warmly in one sentence${nameClause}, then ask: ${nextItem.prompt}`;
  }
  if (variant === "resume_fail") {
    return `${base}\n\nCONTEXT: The resume upload failed.\nTASK: Reassure the user briefly, then ask: ${nextItem.prompt}`;
  }
  return `${base}\n\nTASK: ${nextItem.prompt}`;
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export const POST = withAuth(async (request, session) => {
  const raw = await request.json().catch(() => {
    throw new ValidationError("Invalid JSON");
  });
  const body = parseBody(raw);

  // Only reset if we're greeting AND there's nothing worth keeping.
  // `resetSession` used to run unconditionally which wiped in-flight sessions
  // on every React remount — we now hydrate via GET /session on the client
  // and only send {kind:"greeting"} for a genuinely new session.
  let stored = await getOrCreateSession(session.userId);
  const alreadyHasAssistantTurn = stored.messages.some((m) => m.role === "assistant");
  if (body.kind === "greeting" && alreadyHasAssistantTurn) {
    await resetSession(session.userId);
    stored = await getOrCreateSession(session.userId);
  }

  const messages: StoredMessage[] = [...stored.messages];
  let profileDelta: DeltaBag = {
    ...(stored.state.profileDelta ?? {}),
  } as DeltaBag;

  // Pre-seed fullName from the auth session once, so we don't ask redundantly.
  if (!profileDelta.fullName && session.fullName) {
    profileDelta.fullName = session.fullName;
  }

  // ── Apply body to state ──────────────────────────────────────────────────
  let queueIndex = stored.state.queueIndex || 0;

  if (body.kind === "resume_data") {
    // Merge extracted fields silently.
    if (body.profile && typeof body.profile === "object") {
      profileDelta = { ...profileDelta, ...(body.profile as DeltaBag) };
    }
    // Ensure we move past the greeting step.
    if (queueIndex === 0) queueIndex = 1;
  } else if (body.kind === "resume_failed") {
    if (queueIndex === 0) queueIndex = 1;
  } else if (body.kind === "message") {
    messages.push({ role: "user", content: body.text, ts: new Date().toISOString() });
    const prev = QUESTION_QUEUE[queueIndex - 1];
    const parsed = parseUserMessage(body.text);
    for (const [k, v] of Object.entries(parsed)) {
      if (v != null && !hasValue(profileDelta, k as QueueField)) {
        (profileDelta as Record<string, unknown>)[k] = v;
      }
    }
    // Fall back to storing the raw answer for the asked field if the parser
    // didn't pick it up.
    if (prev && prev.field !== "greeting" && !hasValue(profileDelta, prev.field)) {
      const field = prev.field as keyof ProfileNormalized;
      if (field === "targetRoles") {
        (profileDelta as Record<string, unknown>)[field] = [body.text.trim()];
      } else if (field === "experience") {
        // handled by synthesis below
        (profileDelta as Record<string, unknown>).company = body.text.trim();
      } else {
        (profileDelta as Record<string, unknown>)[field] = body.text.trim();
      }
    }
  }

  // ── Decide next step ─────────────────────────────────────────────────────
  const withSynth = synthesizeExperience(profileDelta);
  const gate = checkHardMinimum(withSynth);

  // The greeting turn is special: we always want to ask the greeting
  // question (with its chips), regardless of what fields are already
  // pre-seeded from the auth session. Skipping this check and going
  // straight through `findNextQueueIndex` would land on the first
  // unanswered field instead.
  const isGreetingTurn = body.kind === "greeting";
  if (isGreetingTurn) {
    queueIndex = 0;
  } else {
    queueIndex = findNextQueueIndex(withSynth, queueIndex);
  }

  // Completion: queue exhausted AND hard minimum met.
  // (Never completes on a greeting turn.)
  if (!isGreetingTurn && queueIndex >= QUESTION_QUEUE.length && gate.met) {
    const finalDelta = withSynth;
    const normalized = normalizeProfile(finalDelta, session.email, session.fullName ?? "");
    await persistProfile({
      userId: session.userId,
      sessionEmail: session.email,
      sessionFullName: session.fullName,
      profile: normalized,
      markOnboardingCompleted: true,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (t: string, d: unknown) => controller.enqueue(encoder.encode(sseEvent(t, d)));
        const farewell = "That's everything I need — you're all set! Welcome to retune.";
        send("token", farewell);
        messages.push({ role: "assistant", content: farewell, ts: new Date().toISOString() });
        const nextState: OnboardingState = {
          ...stored.state,
          profileDelta: finalDelta,
          queueIndex: QUESTION_QUEUE.length,
          stage: "complete",
          hardMinimumMet: true,
        };
        await saveSession(session.userId, nextState, messages);
        send("turn_complete", { stage: "complete", hardMinimumMet: true, chips: [] });
        controller.close();
      },
    });
    return new Response(stream, { headers: SSE_HEADERS });
  }

  // If the queue is exhausted but the hard minimum isn't met, loop back and
  // ask the first missing field. (Should be rare — only if the user typed
  // nothing meaningful in the queue.)
  let nextItem: QueueItem;
  if (isGreetingTurn) {
    const greeting = QUESTION_QUEUE[0];
    if (!greeting) throw new Error("Unreachable: missing greeting entry");
    nextItem = greeting;
  } else if (queueIndex >= QUESTION_QUEUE.length) {
    const missingField = gate.missing[0];
    if (!missingField) {
      // Defensive — shouldn't reach here because gate.met would be true.
      throw new Error("Unreachable: queue exhausted but no missing field");
    }
    const fallbackPrompt =
      QUESTION_QUEUE.find((q) => q.field === missingField)?.prompt ??
      `Ask the user briefly for their ${missingField}.`;
    nextItem = { field: missingField, prompt: fallbackPrompt };
    queueIndex = QUESTION_QUEUE.findIndex((q) => q.field === missingField);
    if (queueIndex < 0) queueIndex = QUESTION_QUEUE.length - 1;
  } else {
    const item = QUESTION_QUEUE[queueIndex];
    if (!item) throw new Error("Unreachable: queueIndex out of bounds");
    nextItem = item;
  }

  // ── Build prompt ─────────────────────────────────────────────────────────
  const variant: "greeting" | "resume_ok" | "resume_fail" | "normal" =
    nextItem.field === "greeting"
      ? "greeting"
      : body.kind === "resume_data"
        ? "resume_ok"
        : body.kind === "resume_failed"
          ? "resume_fail"
          : "normal";

  const systemPrompt = buildSystemPrompt(
    nextItem,
    variant,
    typeof profileDelta.fullName === "string" ? profileDelta.fullName : undefined,
  );

  const contextMessages =
    body.kind === "message" ? [{ role: "user" as const, content: body.text }] : [];

  // ── Stream response ──────────────────────────────────────────────────────
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (t: string, d: unknown) => controller.enqueue(encoder.encode(sseEvent(t, d)));
      let fullResponse = "";
      try {
        const tokenStream = streamChatTurn({
          system: systemPrompt,
          messages: contextMessages,
          maxTokens: MAX_TOKENS,
        });
        const reader = tokenStream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullResponse += value;
          send("token", value);
        }
      } catch (err) {
        send("error", { message: err instanceof Error ? err.message : "AI error" });
        controller.close();
        return;
      }

      const chips = nextItem.chips ?? [];
      messages.push({
        role: "assistant",
        content: fullResponse,
        chips: chips.length ? chips : undefined,
        ts: new Date().toISOString(),
      });

      // Advance past the question we just asked so the next turn knows.
      const savedIndex = queueIndex + 1;

      const nextState: OnboardingState = {
        ...stored.state,
        profileDelta,
        queueIndex: savedIndex,
        stage: "collecting",
        hardMinimumMet: gate.met,
        extractionStatus:
          body.kind === "resume_data"
            ? "done"
            : body.kind === "resume_failed"
              ? "failed"
              : stored.state.extractionStatus,
      };
      await saveSession(session.userId, nextState, messages);

      send("turn_complete", {
        stage: "collecting",
        hardMinimumMet: gate.met,
        chips,
      });
      controller.close();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
});
