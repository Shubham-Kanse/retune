"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Pill {
  label: string;
  value: string;
  action: string;
  recommended?: boolean;
}

export interface DisplayCard {
  type: string;
  id?: string;
  title: string;
  subtitle?: string;
  metadata?: string[];
  confidence?: number;
  status?: string;
}

export interface UIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  pills?: Pill[];
  cards?: DisplayCard[];
  isProcessing?: boolean;
}

export interface ProfileReadiness {
  canEnterDashboard: boolean;
  score: number;
  blockers: string[];
  warnings: string[];
}

interface TurnCompletePayload {
  phase: string;
  pills?: Pill[];
  cards?: DisplayCard[];
  readiness?: ProfileReadiness;
  message?: string;
  question?: { questionKey: string; answerType: string; field: string; whyAsked?: string };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOnboardingChat() {
  const router = useRouter();
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [phase, setPhase] = useState<string>("orb_intro");
  const [readiness, setReadiness] = useState<ProfileReadiness>({ canEnterDashboard: false, score: 0, blockers: [], warnings: [] });
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
            assistantText = token; // In new arch, full message comes as one token
          } catch {}
        } else if (eventType === "turn_complete") {
          try {
            const payload = JSON.parse(raw) as TurnCompletePayload;
            setPhase(payload.phase);
            setCurrentPills(payload.pills ?? []);
            setCurrentCards(payload.cards ?? []);
            if (payload.readiness) setReadiness(payload.readiness);

            // Push assistant message (if we have text)
            const msgText = assistantText || payload.message || "";
            if (msgText.trim()) {
              setMessages(prev => [...prev, {
                id: `ai-${Date.now()}`,
                role: "assistant",
                content: msgText,
                pills: payload.pills,
                cards: payload.cards,
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
            }));
          setMessages(hydrated);
          setPhase(data.phase);
          if (data.readiness) setReadiness(data.readiness);
          if (data.nextQuestion?.pills) setCurrentPills(data.nextQuestion.pills);
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
    if (pill.action === "navigate" && pill.value === "upload") {
      // Trigger file upload — handled by the page
      return;
    }

    void sendTurn({ kind: "pill_click", questionKey: questionKey ?? "", pill: { value: pill.value, action: pill.action } });
  }, [sendTurn, router]);

  // ── Public: upload file ─────────────────────────────────────────────────
  const uploadFile = useCallback(async (file: File) => {
    setExtractionStatus("pending");
    setMessages(prev => [...prev, { id: `proc-${Date.now()}`, role: "assistant", content: "Reading your resume...", isProcessing: true }]);

    const fd = new FormData();
    fd.append("file", file);

    try {
      const res = await fetch("/api/onboarding/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));

      // Remove processing message
      setMessages(prev => prev.filter(m => !m.isProcessing));

      if (!res.ok || !data.result) {
        setExtractionStatus("failed");
        setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: "assistant", content: "Couldn't read that file. Try a different format?", pills: [{ label: "Try again", value: "upload", action: "navigate" }, { label: "Continue manually", value: "manual", action: "skip" }] }]);
        return;
      }

      setExtractionStatus("done");
      void sendTurn({ kind: "resume_data", profile: data.result });
    } catch {
      setExtractionStatus("failed");
      setMessages(prev => prev.filter(m => !m.isProcessing));
      setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: "assistant", content: "Upload failed. Try again?", pills: [{ label: "Try again", value: "upload", action: "navigate" }] }]);
    }
  }, [sendTurn]);

  // ── Public: start over ──────────────────────────────────────────────────
  const startOver = useCallback(() => {
    setMessages([]);
    setPhase("orb_intro");
    setReadiness({ canEnterDashboard: false, score: 0, blockers: [], warnings: [] });
    setCurrentPills([]);
    setCurrentCards([]);
    setIsComplete(false);
    void sendTurn({ kind: "start_over" });
  }, [sendTurn]);

  return {
    messages,
    isStreaming,
    isComplete,
    phase,
    readiness,
    currentPills,
    currentCards,
    errorMessage,
    extractionStatus,
    sendMessage,
    clickPill,
    uploadFile,
    startOver,
  };
}
