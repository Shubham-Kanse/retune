"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { UPLOAD_CHIP_LABEL } from "@/lib/onboarding/chat-ui";
import type { DisplayCard, OnboardingQuestion, Pill, ProfileReadiness } from "@/lib/onboarding/types";

export type { DisplayCard, Pill, ProfileReadiness } from "@/lib/onboarding/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  pills?: Pill[];
  cards?: DisplayCard[];
  questionKey?: string;
  isProcessing?: boolean;
}

interface TurnCompletePayload {
  phase: string;
  stage?: string;
  pills?: Pill[];
  cards?: DisplayCard[];
  readiness?: ProfileReadiness;
  message?: string;
  question?: OnboardingQuestion | null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOnboardingChat() {
  const router = useRouter();
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [phase, setPhase] = useState<string>("orb_intro");
  const [readiness, setReadiness] = useState<ProfileReadiness>({
    canEnterDashboard: false,
    score: 0,
    blockers: [],
    warnings: [],
    suggestions: [],
    completedCategories: {
      identity: 0,
      experience: 0,
      experienceOrProjects: 0,
      education: 0,
      educationOrNotApplicable: 0,
      skills: 0,
      professionalProfile: 0,
      careerIntent: 0,
      resumeWritingSignals: 0,
      resumeWritingPreferences: 0,
      qualityAndConfirmation: 0,
    },
  });
  const [currentQuestion, setCurrentQuestion] = useState<OnboardingQuestion | null>(null);
  const [currentPills, setCurrentPills] = useState<Pill[]>([]);
  const [currentCards, setCurrentCards] = useState<DisplayCard[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [extractionStatus, setExtractionStatus] = useState<"none" | "pending" | "done" | "failed">("none");

  const greetingFiredRef = useRef(false);

  // ── Core: send a turn to the backend ────────────────────────────────────
  const sendTurn = useCallback(async (body: Record<string, unknown>) => {
    setIsStreaming(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/onboarding/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let assistantText = "";

      const parseFrame = (frame: string) => {
        let eventType = "";
        const dataLines: string[] = [];
        for (const line of frame.split("\n")) {
          if (line.startsWith("event:")) eventType = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
        }
        if (!dataLines.length) return;
        const raw = dataLines.join("\n");

        if (eventType === "token") {
          try {
            const token = JSON.parse(raw) as string;
            assistantText += token;
          } catch {}
        } else if (eventType === "ui_payload") {
          try {
            const payload = JSON.parse(raw) as { question?: OnboardingQuestion | null; readiness?: ProfileReadiness; stage?: string };
            setCurrentQuestion(payload.question ?? null);
            if (payload.readiness) setReadiness(payload.readiness);
            if (payload.stage) setPhase(payload.stage);
          } catch {}
        } else if (eventType === "turn_complete") {
          try {
            const payload = JSON.parse(raw) as TurnCompletePayload;
            setPhase(payload.stage ?? payload.phase);
            setCurrentQuestion(payload.question ?? null);
            setCurrentPills(payload.question?.pills ?? payload.pills ?? []);
            setCurrentCards(payload.question?.cards ?? payload.cards ?? []);
            if (payload.readiness) setReadiness(payload.readiness);

            // Push assistant message (if we have text)
            const msgText = assistantText || payload.message || "";
            if (msgText.trim()) {
              setMessages(prev => [...prev, {
                id: `ai-${Date.now()}`,
                role: "assistant",
                content: msgText,
                pills: payload.question?.pills ?? payload.pills,
                cards: payload.question?.cards ?? payload.cards,
                questionKey: payload.question?.questionKey,
              }]);
            }

            if (payload.phase === "dashboard_handoff" || payload.phase === "profile_ready") {
              if (payload.readiness?.canEnterDashboard) {
                setIsComplete(true);
                setTimeout(() => router.push("/dashboard"), 2500);
              }
            }
          } catch {}
        } else if (eventType === "error") {
          try {
            const parsed = JSON.parse(raw) as { message?: string };
            setErrorMessage(parsed.message ?? "Something went wrong.");
          } catch {}
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
      if (buf.trim()) parseFrame(buf);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Network error");
    } finally {
      setIsStreaming(false);
    }
  }, [router]);

  // ── Hydrate session on mount ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/onboarding/session");
        if (!res.ok) throw new Error(`session ${res.status}`);
        const data = await res.json();
        if (cancelled) return;

        if (data.isReturning && data.messages?.length) {
          const hydrated: UIMessage[] = data.messages
            .filter((m: any) => (m.role === "user" || m.role === "assistant") && m.content?.trim())
            .map((m: any, i: number) => ({
              id: `hist-${i}`,
              role: m.role,
              content: m.content,
              pills: i === data.messages.length - 1 ? m.pills : undefined,
              cards: i === data.messages.length - 1 ? m.cards : undefined,
              questionKey: m.questionKey,
            }));
          setMessages(hydrated);
          setPhase(data.phase);
          if (data.readiness) setReadiness(data.readiness);
          if (data.nextQuestion?.pills) setCurrentPills(data.nextQuestion.pills);
          if (data.nextQuestion) setCurrentQuestion(data.nextQuestion);
          greetingFiredRef.current = true;
          return;
        }

        if (!greetingFiredRef.current) {
          greetingFiredRef.current = true;
          void sendTurn({ kind: "greeting" });
        }
      } catch {
        if (!cancelled && !greetingFiredRef.current) {
          greetingFiredRef.current = true;
          void sendTurn({ kind: "greeting" });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [sendTurn]);

  // ── Public: user sends text ─────────────────────────────────────────────
  const sendMessage = useCallback((text: string) => {
    setMessages(prev => [...prev, { id: `user-${Date.now()}`, role: "user", content: text }]);
    setCurrentPills([]);
    setCurrentCards([]);
    void sendTurn({ kind: "text_input", text });
  }, [sendTurn]);

  // ── Public: user clicks a pill ──────────────────────────────────────────
  const clickPill = useCallback((pill: Pill, questionKey?: string) => {
    // Show pill click as user message
    setMessages(prev => [...prev, { id: `user-${Date.now()}`, role: "user", content: pill.label }]);
    setCurrentPills([]);
    setCurrentCards([]);

    if (pill.action === "navigate" && pill.value === "dashboard") {
      router.push("/dashboard");
      return;
    }
    if (pill.label === UPLOAD_CHIP_LABEL || pill.value === "upload_resume" || pill.value === "upload") {
      // Trigger file upload — handled by the page
      return;
    }

    void sendTurn({
      kind: "pill_click",
      questionKey: questionKey ?? currentQuestion?.questionKey,
      action: pill.action,
      field: pill.field,
      value: pill.value,
    });
  }, [currentQuestion, sendTurn, router]);

  const stageMultiSelect = useCallback((questionKey: string | undefined, pill: Pill) => {
    const toggle = (candidate: Pill) =>
      candidate.value === pill.value && candidate.field === pill.field
        ? { ...candidate, selected: !candidate.selected }
        : candidate;

    setMessages(prev => {
      const next = [...prev];
      const idx = [...next].reverse().findIndex((m) => m.role === "assistant" && m.questionKey === questionKey);
      const messageIndex = idx === -1 ? next.length - 1 : next.length - 1 - idx;
      const msg = next[messageIndex];
      if (!msg?.pills) return prev;

      next[messageIndex] = {
        ...msg,
        pills: msg.pills.map(toggle),
      };
      return next;
    });
    setCurrentPills((prev) => prev.map(toggle));
  }, []);

  const submitMultiSelect = useCallback((questionKey: string | undefined, field: string, values: string[]) => {
    setMessages(prev => [...prev, { id: `user-${Date.now()}`, role: "user", content: values.length ? values.join(", ") : "Continue" }]);
    void sendTurn({ kind: "multi_select", questionKey: questionKey ?? currentQuestion?.questionKey ?? field, field, values });
  }, [currentQuestion, sendTurn]);

  const submitSkills = useCallback((skills: { technical: string[]; tools: string[]; business: string[] }) => {
    setMessages(prev => [...prev, { id: `user-${Date.now()}`, role: "user", content: "Updated skills" }]);
    void sendTurn({ kind: "skills_update", questionKey: currentQuestion?.questionKey, skills });
  }, [currentQuestion, sendTurn]);

  // ── Public: upload file ─────────────────────────────────────────────────
  const uploadFile = useCallback(async (file: File) => {
    setExtractionStatus("pending");
    setMessages(prev => [...prev, { id: `proc-${Date.now()}`, role: "assistant", content: "Reading your resume…", isProcessing: true }]);

    const fd = new FormData();
    fd.append("file", file);

    try {
      // Try streaming endpoint first for real-time progress
      const res = await fetch("/api/onboarding/upload/stream", { method: "POST", body: fd });

      if (res.headers.get("content-type")?.includes("text/event-stream") && res.body) {
        // SSE streaming path — show live progress
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let completed = false;

        const updateProcessingMessage = (text: string) => {
          setMessages(prev => prev.map(m => m.isProcessing ? { ...m, content: text } : m));
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
            if (!frame.length) continue;

            let eventType = "";
            const dataLines: string[] = [];
            for (const line of frame.split("\n")) {
              if (line.startsWith("event:")) eventType = line.slice(6).trim();
              else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
            }
            if (!dataLines.length) continue;
            const raw = dataLines.join("\n");

            if (eventType === "extraction_stage") {
              try {
                const { stage } = JSON.parse(raw) as { stage: string };
                if (stage === "reading") updateProcessingMessage("Reading your resume…");
                else if (stage === "understanding") updateProcessingMessage("Understanding your career…");
                else if (stage === "organizing") updateProcessingMessage("Organizing your profile…");
              } catch {}
            } else if (eventType === "extraction_complete") {
              try {
                const data = JSON.parse(raw);
                setMessages(prev => prev.filter(m => !m.isProcessing));
                setExtractionStatus("done");
                if (data.readiness) setReadiness(data.readiness);
                if (data.nextQuestion) {
                  setCurrentQuestion(data.nextQuestion);
                  setCurrentPills(data.nextQuestion.pills ?? []);
                  setCurrentCards(data.nextQuestion.cards ?? data.cards ?? []);
                }
                completed = true;
                void sendTurn({ kind: "resume_uploaded" });
              } catch {}
            } else if (eventType === "extraction_error") {
              setMessages(prev => prev.filter(m => !m.isProcessing));
              setExtractionStatus("failed");
              setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: "assistant", content: "Couldn't read that file. Try a different format?", pills: [{ label: "Try again", value: "upload_resume", action: "navigate", field: "resume" }] }]);
              void sendTurn({ kind: "resume_failed" });
              completed = true;
            }
          }
        }
        if (completed) return;
      }

      // Fallback: JSON response (cached result or non-streaming)
      const data = await res.json().catch(() => ({}));
      setMessages(prev => prev.filter(m => !m.isProcessing));

      if (!res.ok || !data.ok) {
        setExtractionStatus("failed");
        setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: "assistant", content: "Couldn't read that file. Try a different format?", pills: [{ label: "Try again", value: "upload_resume", action: "navigate", field: "resume" }] }]);
        void sendTurn({ kind: "resume_failed" });
        return;
      }

      setExtractionStatus("done");
      if (data.readiness) setReadiness(data.readiness);
      if (data.nextQuestion) {
        setCurrentQuestion(data.nextQuestion);
        setCurrentPills(data.nextQuestion.pills ?? []);
        setCurrentCards(data.nextQuestion.cards ?? data.cards ?? []);
      }
      void sendTurn({ kind: "resume_uploaded" });
    } catch {
      setExtractionStatus("failed");
      setMessages(prev => prev.filter(m => !m.isProcessing));
      setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: "assistant", content: "Upload failed. Try again?", pills: [{ label: "Try again", value: "upload", action: "navigate" }] }]);
    }
  }, [sendTurn]);

  // ── Public: start over ──────────────────────────────────────────────────
  // Two-phase reset for a smooth visual transition:
  //   1. Set isResetting=true → page fades out current chat (~280ms)
  //   2. After fade, clear all client state and dispatch the server wipe.
  // The fresh question streams in over the cleared canvas as the new chat fades back in.
  const startOver = useCallback(() => {
    setIsResetting(true);
    setTimeout(() => {
      setMessages([]);
      setPhase("orb_intro");
      setReadiness({
        canEnterDashboard: false,
        score: 0,
        blockers: [],
        warnings: [],
        suggestions: [],
        completedCategories: {
            identity: 0,
            experience: 0,
            experienceOrProjects: 0,
            education: 0,
            educationOrNotApplicable: 0,
            skills: 0,
            professionalProfile: 0,
            careerIntent: 0,
            resumeWritingSignals: 0,
            resumeWritingPreferences: 0,
            qualityAndConfirmation: 0,
        },
      });
      setCurrentPills([]);
      setCurrentCards([]);
      setExtractionStatus("none");
      setIsComplete(false);
      setIsResetting(false);
      void sendTurn({ kind: "start_over" });
    }, 280);
  }, [sendTurn]);

  // ── Public: finish now (skip remaining optional steps) ─────────────────
  const finishNow = useCallback(() => {
    void sendTurn({ kind: "finish_now" });
  }, [sendTurn]);

  return {
    messages,
    isStreaming,
    isComplete,
    isResetting,
    phase,
    readiness,
    currentQuestion,
    currentPills,
    currentCards,
    errorMessage,
    extractionStatus,
    sendMessage,
    clickPill,
    stageMultiSelect,
    submitMultiSelect,
    submitSkills,
    uploadFile,
    startOver,
    finishNow,
  };
}
