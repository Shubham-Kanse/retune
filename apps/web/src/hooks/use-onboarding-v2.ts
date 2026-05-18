"use client";

import type { AuditSummaryData } from "@/components/onboarding-v2/audit-summary";
import type { ChatMessage } from "@/components/onboarding-v2/chat-interface";
import type { ExtractionCardData } from "@/components/onboarding-v2/extraction-dropdown";
import type { QuestionPresentation } from "@/components/onboarding-v2/question-card";
import type { VoiceQuestionPresentation } from "@/components/onboarding-v2/voice-question-card";
import type { OnboardingV2Session, OnboardingV2Status } from "@/lib/onboarding-v2/types";
import { useCallback, useEffect, useReducer } from "react";

// --- Types ---

export type UIStage =
  | "loading"
  | "upload"
  | "processing"
  | "summary"
  | "correction"
  | "questions"
  | "voice"
  | "audit"
  | "committing"
  | "complete";

interface State {
  session: OnboardingV2Session | null;
  uiStage: UIStage;
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  currentQuestion: QuestionPresentation | VoiceQuestionPresentation | null;
}

type Action =
  | { type: "SET_SESSION"; session: OnboardingV2Session }
  | { type: "SET_STAGE"; stage: UIStage }
  | { type: "ADD_MESSAGE"; message: ChatMessage }
  | { type: "ADD_MESSAGE_IF_EMPTY"; message: ChatMessage }
  | { type: "CLEAR_PROGRESS_MESSAGES" }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "REPLACE_AUDIT"; message: ChatMessage }
  | { type: "RESOLVE_AUDIT_GAP"; field: string }
  | {
      type: "SET_QUESTION";
      question: QuestionPresentation | VoiceQuestionPresentation | null;
    }
  | { type: "RESET" };

const initialState: State = {
  session: null,
  uiStage: "loading",
  messages: [],
  loading: true,
  error: null,
  currentQuestion: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_SESSION":
      return {
        ...state,
        session: action.session,
        uiStage: mapStatusToStage(action.session.onboarding_status),
      };
    case "SET_STAGE":
      return { ...state, uiStage: action.stage };
    case "ADD_MESSAGE":
      return { ...state, messages: [...state.messages, action.message] };
    case "ADD_MESSAGE_IF_EMPTY":
      if (state.messages.length > 0) return state;
      return { ...state, messages: [action.message] };
    case "CLEAR_PROGRESS_MESSAGES":
      // Remove all progress/processing messages — called after upload completes
      return { ...state, messages: state.messages.filter(m => m.type !== "progress") };
    case "REPLACE_AUDIT": {
      // Replace the last audit message, or append if none exists
      let idx = -1;
      for (let i = state.messages.length - 1; i >= 0; i--) {
        if (state.messages[i]!.type === "audit") { idx = i; break; }
      }
      if (idx >= 0) {
        const next = [...state.messages];
        next[idx] = action.message;
        return { ...state, messages: next };
      }
      return { ...state, messages: [...state.messages, action.message] };
    }
    case "RESOLVE_AUDIT_GAP": {
      // Optimistically remove the resolved gap and recalculate score
      let idx = -1;
      for (let i = state.messages.length - 1; i >= 0; i--) {
        if (state.messages[i]!.type === "audit") { idx = i; break; }
      }
      if (idx < 0) return state;
      const auditMsg = state.messages[idx]!;
      if (!auditMsg.audit) return state;
      const audit = { ...auditMsg.audit };
      const totalGapsBefore = audit.critical_gaps.length + audit.important_gaps.length + audit.contradictions.length;
      const fieldKey = action.field.toLowerCase().replace(/[_\s]/g, "");
      const matchesField = (f: string) => {
        const normalized = f.toLowerCase().replace(/[_\s]/g, "");
        return normalized === fieldKey || normalized.includes(fieldKey) || fieldKey.includes(normalized);
      };
      audit.critical_gaps = audit.critical_gaps.filter((g) => !matchesField(g.field));
      audit.important_gaps = audit.important_gaps.filter((g) => !matchesField(g.field));
      audit.contradictions = audit.contradictions.filter((c) => !matchesField(c.field));
      const totalGapsAfter = audit.critical_gaps.length + audit.important_gaps.length + audit.contradictions.length;
      // Recalculate: distribute the base score proportionally across resolved gaps
      if (totalGapsBefore > 0) {
        const pointsPerGap = (100 - audit.profile_quality_score) / totalGapsBefore;
        audit.profile_quality_score = Math.round(audit.profile_quality_score + pointsPerGap * (totalGapsBefore - totalGapsAfter));
      }
      if (totalGapsAfter === 0) audit.profile_quality_score = 100;
      audit.ready_to_commit = audit.critical_gaps.length === 0;
      const next = [...state.messages];
      next[idx] = { ...auditMsg, audit };
      return { ...state, messages: next };
    }
    case "SET_LOADING":
      return { ...state, loading: action.loading };
    case "SET_ERROR":
      return { ...state, error: action.error };
    case "SET_QUESTION":
      return { ...state, currentQuestion: action.question };
    case "RESET":
      return { ...initialState };
    default:
      return state;
  }
}

function mapStatusToStage(status: OnboardingV2Status): UIStage {
  switch (status) {
    case "awaiting_upload":
      return "upload";
    case "extraction_complete":
    case "dual_extraction_complete":
      return "processing";
    case "inference_complete":
      return "summary";
    case "summary_confirmed":
    case "path_branched":
      return "questions";
    case "correction_in_progress":
      return "correction";
    case "resume_questions_complete":
      return "voice";
    case "voice_extraction_complete":
      return "audit";
    case "committed":
      return "complete";
    default:
      return "upload";
  }
}

function msg(
  role: "assistant" | "user",
  content: string,
  type: ChatMessage["type"] = "text",
  extra?: Partial<ChatMessage>,
): ChatMessage {
  return { id: crypto.randomUUID(), role, content, type, ...extra };
}

const COMFORT_MESSAGES = [
  "Got it.",
  "Noted.",
  "Good to know.",
  "Makes sense.",
  "Understood.",
  "Perfect, thanks.",
  "That helps.",
  "Great, noted.",
];

function comfortMessage(_field: string, _value: string | string[]): string {
  return COMFORT_MESSAGES[Math.floor(Math.random() * COMFORT_MESSAGES.length)]!;
}

// --- Hook ---

export function useOnboardingV2() {
  const [state, dispatch] = useReducer(reducer, initialState);

  const loadSession = useCallback(async (suppressWelcomeBack = false) => {
    dispatch({ type: "SET_LOADING", loading: true });
    try {
      const res = await fetch("/api/onboarding-v2/session");
      const data = await res.json();
      if (data.exists && data.session) {
        dispatch({ type: "SET_SESSION", session: data.session });
        if (data.session.onboarding_status === "awaiting_upload") {
          // Only add the upload prompt if the messages list is empty (avoid duplicates on reload)
          dispatch({
            type: "ADD_MESSAGE_IF_EMPTY",
            message: msg(
              "assistant",
              "Upload your resume and I'll extract your experience, education, skills, and contact details.",
              "text",
              {
                actions: [{ label: "Upload resume", action: "trigger_upload", variant: "primary" }],
              },
            ),
          });
        } else if (
          data.session.onboarding_status !== "awaiting_upload" &&
          data.session.onboarding_status !== "committed"
        ) {
          if (!suppressWelcomeBack) {
            dispatch({
              type: "ADD_MESSAGE",
              message: msg(
                "assistant",
                "Welcome back — I still have your resume from your last session. Would you like to continue where you left off, or upload a new resume?",
                "text",
                {
                  actions: [
                    {
                      label: "Continue where I left off",
                      action: "continue_session",
                      variant: "primary",
                    },
                    { label: "Upload a new resume", action: "restart_session", variant: "secondary" },
                  ],
                },
              ),
            });
          }
        }
        if (data.session.onboarding_status === "inference_complete") {
          // Inline to avoid stale closure — fetchSummary is defined after loadSession
          const res = await fetch("/api/onboarding-v2/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "get_summary" }) });
          const d = await res.json().catch(() => ({}));
          dispatch({ type: "SET_STAGE", stage: "summary" });
          dispatch({ type: "ADD_MESSAGE", message: msg("assistant", d.presentation?.summaryMessage || "I've read your resume. Does everything look correct?", "summary", { extractionCards: d.presentation?.extractionCards ?? [], ambiguityQuestions: d.presentation?.ambiguityQuestions ?? [], actions: [{ label: "Looks correct", action: "looks_correct", variant: "primary" }, { label: "Something is wrong", action: "something_wrong", variant: "secondary" }] }) });
        } else if (data.session.onboarding_status === "path_branched") {
          const res = await fetch("/api/onboarding-v2/message", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "get_question" }) });
          const d = await res.json().catch(() => ({}));
          if (d.question) { dispatch({ type: "SET_STAGE", stage: "questions" }); dispatch({ type: "SET_QUESTION", question: d.question }); dispatch({ type: "ADD_MESSAGE", message: msg("assistant", d.question.prompt, "question", { question: d.question }) }); }
        } else if (data.session.onboarding_status === "resume_questions_complete") {
          const res = await fetch("/api/onboarding-v2/message", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "get_voice_question" }) });
          const d = await res.json().catch(() => ({}));
          if (d.question) { dispatch({ type: "SET_STAGE", stage: "voice" }); dispatch({ type: "SET_QUESTION", question: d.question }); dispatch({ type: "ADD_MESSAGE", message: msg("assistant", d.question.prompt, "voice_question", { voiceQuestion: d.question }) }); }
        } else if (data.session.onboarding_status === "voice_extraction_complete") {
          const res = await fetch("/api/onboarding-v2/commit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "audit" }) });
          const d = await res.json().catch(() => ({}));
          if (d.audit) { dispatch({ type: "SET_STAGE", stage: "audit" }); dispatch({ type: "ADD_MESSAGE", message: msg("assistant", d.audit.ready_to_commit ? `Your profile is ready! Quality score: ${d.audit.profile_quality_score}/100.` : "Let's review what we have before committing.", "audit", { audit: d.audit }) }); }
        }
      } else {
        const createRes = await fetch("/api/onboarding-v2/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const created = await createRes.json();
        if (created.session) {
          dispatch({ type: "SET_SESSION", session: created.session });
          dispatch({
            type: "ADD_MESSAGE_IF_EMPTY",
            message: msg(
              "assistant",
              "Upload your resume and I'll extract your experience, education, skills, and contact details.",
              "text",
              {
                actions: [{ label: "Upload resume", action: "trigger_upload", variant: "primary" }],
              },
            ),
          });
        }
      }
    } catch {
      dispatch({ type: "SET_ERROR", error: "Failed to load session" });
    }
    dispatch({ type: "SET_LOADING", loading: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load on mount
  // biome-ignore lint/correctness/useExhaustiveDependencies: loadSession intentionally owns the resume/create boot flow and is stable for this local onboarding surface.
  useEffect(() => {
    loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch("/api/onboarding-v2/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get_summary" }),
      });
      const data = await res.json();
      if (data.presentation) {
        dispatch({ type: "SET_STAGE", stage: "summary" });
        dispatch({
          type: "ADD_MESSAGE",
          message: msg("assistant", data.presentation.summaryMessage, "summary", {
            extractionCards: data.presentation.extractionCards as ExtractionCardData[],
            ambiguityQuestions: data.presentation.ambiguityQuestions,
            actions: [
              { label: "Looks correct", action: "looks_correct", variant: "primary" },
              { label: "Something is wrong", action: "something_wrong", variant: "secondary" },
            ],
          }),
        });
      } else {
        // Fallback: show confirm buttons even if summary generation failed
        dispatch({ type: "SET_STAGE", stage: "summary" });
        dispatch({
          type: "ADD_MESSAGE",
          message: msg("assistant", "I've read your resume. Does everything look correct?", "summary", {
            extractionCards: [],
            ambiguityQuestions: [],
            actions: [
              { label: "Looks correct", action: "looks_correct", variant: "primary" },
              { label: "Something is wrong", action: "something_wrong", variant: "secondary" },
            ],
          }),
        });
      }
    } catch {
      dispatch({ type: "SET_STAGE", stage: "summary" });
      dispatch({
        type: "ADD_MESSAGE",
        message: msg("assistant", "I've read your resume. Does everything look correct?", "summary", {
          extractionCards: [],
          ambiguityQuestions: [],
          actions: [
            { label: "Looks correct", action: "looks_correct", variant: "primary" },
            { label: "Something is wrong", action: "something_wrong", variant: "secondary" },
          ],
        }),
      });
    }
  }, []);

  const startUploadProgressStream = useCallback((sessionId?: string | null) => {
    if (typeof window === "undefined" || !("EventSource" in window)) {
      return () => {};
    }

    const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
    const source = new EventSource(`/api/onboarding-v2/upload/stream${query}`);
    let closed = false;

    const close = () => {
      if (closed) return;
      closed = true;
      source.close();
    };

    const parse = (event: Event): { message?: string; code?: string } => {
      if (!(event instanceof MessageEvent) || typeof event.data !== "string") return {};
      try {
        return JSON.parse(event.data) as { message?: string; code?: string };
      } catch {
        return {};
      }
    };

    source.addEventListener("progress", (event) => {
      const payload = parse(event);
      if (!payload.message) return;
      dispatch({
        type: "ADD_MESSAGE",
        message: msg("assistant", payload.message, "progress"),
      });
    });

    source.addEventListener("slow_connection", (event) => {
      const payload = parse(event);
      if (!payload.message) return;
      dispatch({
        type: "ADD_MESSAGE",
        message: msg("assistant", payload.message, "text"),
      });
    });

    source.addEventListener("complete", () => {
      // Don't add a message — the loadSession call after upload will advance the UI to summary
      close();
    });

    source.addEventListener("error", (event) => {
      const payload = parse(event);
      if (payload.message) {
        dispatch({
          type: "ADD_MESSAGE",
          message: msg("assistant", payload.message, "error"),
        });
      }
      close();
    });

    return close;
  }, []);

  const uploadFile = useCallback(
    async (file: File) => {
      dispatch({ type: "SET_STAGE", stage: "processing" });
      dispatch({
        type: "ADD_MESSAGE",
        message: msg("user", `Uploaded ${file.name}`, "text"),
      });
      const closeProgress = startUploadProgressStream(state.session?.session_id);

      const form = new FormData();
      form.append("file", file);
      try {
        const res = await fetch("/api/onboarding-v2/upload", { method: "POST", body: form });
        const data = await res.json();
        if (!data.success) {
          dispatch({ type: "SET_STAGE", stage: "upload" });
          dispatch({
            type: "ADD_MESSAGE",
            message: msg("assistant", data.error?.message || "Upload failed", "error"),
          });
          return;
        }
        dispatch({ type: "CLEAR_PROGRESS_MESSAGES" });
        closeProgress();
        await loadSession(true);
      } catch {
        dispatch({ type: "SET_ERROR", error: "Upload failed" });
        dispatch({ type: "SET_STAGE", stage: "upload" });
      } finally {
        closeProgress();
      }
    },
    [loadSession, startUploadProgressStream, state.session?.session_id],
  );

  const pasteText = useCallback(
    async (text: string) => {
      dispatch({ type: "SET_STAGE", stage: "processing" });
      dispatch({
        type: "ADD_MESSAGE",
        message: msg("user", "Pasted resume text", "text"),
      });
      const closeProgress = startUploadProgressStream(state.session?.session_id);
      try {
        const res = await fetch("/api/onboarding-v2/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pastedText: text }),
        });
        const data = await res.json();
        if (!data.success) {
          dispatch({ type: "SET_STAGE", stage: "upload" });
          dispatch({
            type: "ADD_MESSAGE",
            message: msg("assistant", data.error?.message || "Processing failed", "error"),
          });
          return;
        }
        await loadSession();
      } catch {
        dispatch({ type: "SET_ERROR", error: "Processing failed" });
        dispatch({ type: "SET_STAGE", stage: "upload" });
      } finally {
        closeProgress();
      }
    },
    [loadSession, startUploadProgressStream, state.session?.session_id],
  );

  const confirmSummary = useCallback(async () => {
    dispatch({ type: "ADD_MESSAGE", message: msg("user", "Looks correct", "text") });
    dispatch({ type: "SET_LOADING", loading: true });
    await fetch("/api/onboarding-v2/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "looks_correct" }),
    });
    await runCompleteness();
    dispatch({ type: "SET_LOADING", loading: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rejectSummary = useCallback(async () => {
    const res = await fetch("/api/onboarding-v2/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "something_wrong" }),
    });
    const data = await res.json();
    dispatch({ type: "SET_STAGE", stage: "correction" });
    dispatch({ type: "ADD_MESSAGE", message: msg("assistant", data.message, "text") });
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      dispatch({ type: "ADD_MESSAGE", message: msg("user", text, "text") });
      dispatch({ type: "SET_LOADING", loading: true });
      const res = await fetch("/api/onboarding-v2/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "correction", message: text }),
      });
      const data = await res.json();
      dispatch({ type: "SET_LOADING", loading: false });

      if (data.action === "restart") {
        dispatch({ type: "RESET" });
        await loadSession();
        return;
      }
      if (data.escalated) {
        dispatch({
          type: "ADD_MESSAGE",
          message: msg("assistant", data.escapeMessage, "text", {
            actions: data.actions?.map((a: { label: string; action: string }) => ({
              ...a,
              variant: a.action === "accept_escape" ? "primary" : "secondary",
            })),
          }),
        });
        return;
      }
      if (data.corrected) {
        dispatch({
          type: "ADD_MESSAGE",
          message: msg("assistant", data.message, "text", {
            actions: [
              { label: "Looks correct now", action: "confirm_correction", variant: "primary" },
              {
                label: "Something else is wrong",
                action: "continue_correction",
                variant: "secondary",
              },
            ],
          }),
        });
        return;
      }
      if (data.message) {
        dispatch({
          type: "ADD_MESSAGE",
          message: msg("assistant", data.message, "text"),
        });
      }
    },
    [loadSession],
  );

  const handleAction = useCallback(
    async (action: string, payload?: unknown) => {
      if (action === "looks_correct") return confirmSummary();
      if (action === "something_wrong") return rejectSummary();
      if (action === "confirm_correction" || action === "accept_escape") {
        dispatch({ type: "SET_QUESTION", question: null });
        dispatch({ type: "SET_LOADING", loading: true });
        await fetch("/api/onboarding-v2/message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        await runCompleteness();
        dispatch({ type: "SET_LOADING", loading: false });
        return;
      }
      if (action === "continue_correction") {
        dispatch({ type: "SET_STAGE", stage: "correction" });
        return;
      }
      if (action === "select_role_family") {
        dispatch({ type: "SET_QUESTION", question: null });
        dispatch({ type: "SET_LOADING", loading: true });
        await fetch("/api/onboarding-v2/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "select_role_family", value: payload }),
        });
        await runCompleteness();
        dispatch({ type: "SET_LOADING", loading: false });
        return;
      }
      if (action === "select_seniority") {
        dispatch({ type: "SET_QUESTION", question: null });
        dispatch({ type: "SET_LOADING", loading: true });
        await fetch("/api/onboarding-v2/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "select_seniority", value: payload }),
        });
        await runCompleteness();
        dispatch({ type: "SET_LOADING", loading: false });
        return;
      }
      if (action === "commit") return commitProfile();
      if (action === "continue_session") {
        const s = state.session;
        if (!s) return;
        if (s.onboarding_status === "inference_complete") await fetchSummary();
        else if (
          s.onboarding_status === "summary_confirmed" ||
          s.onboarding_status === "path_branched"
        )
          await runCompleteness();
        else if (s.onboarding_status === "correction_in_progress")
          dispatch({ type: "SET_STAGE", stage: "correction" });
        else if (s.onboarding_status === "resume_questions_complete")
          await fetchNextVoiceQuestion();
        else if (s.onboarding_status === "voice_extraction_complete") await fetchAudit();
        return;
      }
      if (action === "restart_session") return startOver();
      if (action === "resolve_critical_gap") {
        const gap = payload as { field?: string; answer?: string; simplified_question?: string };
        if (gap?.answer && gap?.field) {
          dispatch({ type: "RESOLVE_AUDIT_GAP", field: gap.field });
          fetch("/api/onboarding-v2/message", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "resolve_audit_gap",
              field: gap.field,
              value: gap.answer,
            }),
          });
        }
        return;
      }
      if (action === "skip_critical_gap") {
        const gap = payload as { field?: string };
        if (gap?.field) {
          dispatch({ type: "RESOLVE_AUDIT_GAP", field: gap.field });
          fetch("/api/onboarding-v2/message", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "resolve_audit_gap",
              field: gap.field,
              value: "skipped",
            }),
          });
        }
        return;
      }
      if (action === "resolve_contradiction") {
        const data = payload as { field?: string; answer?: string };
        if (data?.field) {
          dispatch({ type: "RESOLVE_AUDIT_GAP", field: data.field });
          if (data.answer === "yes") {
            fetch("/api/onboarding-v2/message", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "resolve_audit_gap", field: data.field, value: "confirmed" }),
            });
          }
        }
        return;
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.session, confirmSummary, rejectSummary, fetchSummary],
  );

  const selectChip = useCallback(
    async (field: string, value: string | string[]) => {
      // Resolve chip labels for display
      const chips = (state.currentQuestion as QuestionPresentation | null)?.chips;
      const resolveLabel = (v: string) => chips?.find((c) => c.value === v)?.label ?? v;
      const displayText = Array.isArray(value)
        ? value.map(resolveLabel).join(", ")
        : resolveLabel(value);
      dispatch({
        type: "ADD_MESSAGE",
        message: msg("user", displayText, "text"),
      });
      dispatch({ type: "SET_LOADING", loading: true });

      const isVoice = state.uiStage === "voice";
      const auditGapField = field.startsWith("audit_gap:")
        ? field.slice("audit_gap:".length)
        : null;
      if (auditGapField) {
        const res = await fetch("/api/onboarding-v2/message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "resolve_audit_gap",
            field: auditGapField,
            value,
          }),
        });
        const data = await res.json();
        dispatch({ type: "SET_LOADING", loading: false });
        if (!res.ok || !data.success) {
          dispatch({
            type: "ADD_MESSAGE",
            message: msg("assistant", data.error || "I couldn't save that yet.", "error"),
          });
          return;
        }
        dispatch({ type: "SET_QUESTION", question: null });
        await fetchAudit();
        return;
      }

      const res = await fetch("/api/onboarding-v2/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: isVoice ? "voice_answer" : "answer",
          field,
          value,
        }),
      });
      const data = await res.json();

      if (data.followUp) {
        dispatch({ type: "SET_LOADING", loading: false });
        dispatch({
          type: "ADD_MESSAGE",
          message: msg("assistant", data.followUp, "text"),
        });
        return;
      }
      if (data.stageComplete) {
        dispatch({ type: "SET_QUESTION", question: null });
        dispatch({ type: "ADD_MESSAGE", message: msg("assistant", comfortMessage(field, value), "text") });
        if (isVoice) {
          dispatch({ type: "SET_STAGE", stage: "audit" });
          await fetchAudit();
        } else {
          dispatch({ type: "SET_STAGE", stage: "voice" });
          await fetchNextVoiceQuestion();
        }
        dispatch({ type: "SET_LOADING", loading: false });
        return;
      }
      dispatch({ type: "SET_LOADING", loading: false });
      if (data.nextQuestion) {
        dispatch({ type: "ADD_MESSAGE", message: msg("assistant", comfortMessage(field, value), "text") });
        presentQuestion(data.nextQuestion, isVoice);
      } else if (data.question) {
        dispatch({ type: "ADD_MESSAGE", message: msg("assistant", comfortMessage(field, value), "text") });
        presentQuestion(data.question, isVoice);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.uiStage, state.currentQuestion],
  );

  const presentQuestion = (
    question: QuestionPresentation | VoiceQuestionPresentation,
    isVoice: boolean,
  ) => {
    dispatch({ type: "SET_QUESTION", question });
    dispatch({
      type: "ADD_MESSAGE",
      message: msg(
        "assistant",
        question.prompt,
        isVoice ? "voice_question" : "question",
        isVoice
          ? { voiceQuestion: question as VoiceQuestionPresentation }
          : { question: question as QuestionPresentation },
      ),
    });
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: invoked imperatively by the active question UI; presentQuestion is stable for this reducer-backed flow.
  const skipQuestion = useCallback(async (field: string) => {
    dispatch({ type: "SET_LOADING", loading: true });
    const res = await fetch("/api/onboarding-v2/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "skip", field }),
    });
    const data = await res.json();
    dispatch({ type: "SET_LOADING", loading: false });
    if (data.stageComplete) {
      dispatch({ type: "SET_QUESTION", question: null });
      dispatch({ type: "SET_STAGE", stage: "voice" });
      await fetchNextVoiceQuestion();
      return;
    }
    if (data.nextQuestion) presentQuestion(data.nextQuestion, false);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: callbacks below form a small state machine; keeping this stable avoids re-driving stages on render.
  const runCompleteness = useCallback(async () => {
    dispatch({ type: "SET_STAGE", stage: "processing" });
    dispatch({
      type: "ADD_MESSAGE",
      message: msg("assistant", "Analyzing your profile...", "progress"),
    });
    const res = await fetch("/api/onboarding-v2/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get_question" }),
    });
    const data = await res.json();
    if (data.question) {
      dispatch({ type: "SET_STAGE", stage: "questions" });
      presentQuestion(data.question, false);
    } else {
      dispatch({ type: "SET_STAGE", stage: "voice" });
      await fetchNextVoiceQuestion();
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: see runCompleteness; this callback is invoked imperatively by the state machine.
  const fetchNextQuestion = useCallback(async () => {
    const res = await fetch("/api/onboarding-v2/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get_question" }),
    });
    const data = await res.json();
    if (data.question) {
      dispatch({ type: "SET_STAGE", stage: "questions" });
      presentQuestion(data.question, false);
    } else {
      dispatch({ type: "SET_STAGE", stage: "voice" });
      await fetchNextVoiceQuestion();
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: see runCompleteness; this callback is invoked imperatively by the state machine.
  const fetchNextVoiceQuestion = useCallback(async () => {
    const res = await fetch("/api/onboarding-v2/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get_voice_question" }),
    });
    const data = await res.json();
    if (data.question) {
      dispatch({ type: "SET_STAGE", stage: "voice" });
      presentQuestion(data.question, true);
    } else {
      dispatch({ type: "SET_STAGE", stage: "audit" });
      await fetchAudit();
    }
  }, []);

  const fetchAudit = useCallback(async () => {
    dispatch({ type: "SET_LOADING", loading: true });
    const res = await fetch("/api/onboarding-v2/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "audit" }),
    });
    const data = await res.json();
    dispatch({ type: "SET_LOADING", loading: false });
    if (data.audit) {
      const audit = data.audit as AuditSummaryData;
      dispatch({ type: "SET_QUESTION", question: null });
      dispatch({
        type: "REPLACE_AUDIT",
        message: msg(
          "assistant",
          audit.ready_to_commit
            ? `Your profile is ready! Quality score: ${audit.profile_quality_score}/100. ${audit.profile_quality_note}`
            : "Let's review what we have before committing.",
          "audit",
          { audit },
        ),
      });
    }
  }, []);

  const commitProfile = useCallback(async () => {
    dispatch({ type: "SET_STAGE", stage: "committing" });
    dispatch({
      type: "ADD_MESSAGE",
      message: msg("assistant", "Saving your profile...", "progress"),
    });
    // Mark audit as ready on server before committing
    await fetch("/api/onboarding-v2/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_ready" }),
    });
    const res = await fetch("/api/onboarding-v2/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (data.success) {
      dispatch({ type: "SET_STAGE", stage: "complete" });
      window.location.href = "/dashboard";
    } else if (data.audit) {
      dispatch({ type: "SET_STAGE", stage: "audit" });
      dispatch({
        type: "ADD_MESSAGE",
        message: msg("assistant", "Let's clear the required fields before saving.", "audit", {
          audit: data.audit as AuditSummaryData,
        }),
      });
    } else {
      dispatch({
        type: "ADD_MESSAGE",
        message: msg("assistant", data.error || "Something went wrong", "error", {
          actions: [{ label: "Try again", action: "commit", variant: "primary" }],
        }),
      });
      dispatch({ type: "SET_STAGE", stage: "audit" });
    }
  }, []);

  const startOver = useCallback(async () => {
    await fetch("/api/onboarding-v2/restart", { method: "POST" });
    dispatch({ type: "RESET" });
    await loadSession();
  }, [loadSession]);

  const finishLater = useCallback(async () => {
    await fetch("/api/onboarding-v2/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save_draft" }),
    });
    window.location.href = "/dashboard";
  }, []);

  return {
    ...state,
    uploadFile,
    pasteText,
    confirmSummary,
    rejectSummary,
    sendMessage,
    handleAction,
    selectChip,
    skipQuestion,
    commitProfile,
    startOver,
    finishLater,
  };
}
