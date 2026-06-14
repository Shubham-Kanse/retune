"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type TuneSection = "voice" | "preferences" | "positioning" | "skills";

interface Message {
  id: string;
  role: "assistant" | "user";
  content: string;
}

interface TuneWithAIWidgetProps {
  section: TuneSection;
  /** Trigger button label. Defaults to "Tune with AI". */
  label?: string;
  /** Optional intro line shown when the panel opens. */
  intro?: string;
}

const DEFAULT_INTRO: Record<TuneSection, string> = {
  voice: "Tell me how you'd like your resume to sound and I'll adjust the voice profile. Try: 'be more direct', 'I hate the word leverage', or 'sound less corporate'.",
  preferences: "Tell me how you'd like to position your resume. Try: 'target staff backend roles at fintech startups', 'deemphasise my QA work', or 'my frame is system design at scale'.",
  positioning: "Tell me how you see yourself. Try: 'I'm targeting senior platform engineering' or 'I'm not really a backend engineer, I'm a fullstack engineer.'",
  skills: "Tell me which skills to add or remove. Try: 'add Rust and Terraform', 'remove jQuery', or 'I'm strong in distributed systems'.",
};

/**
 * Conversational profile-tuning widget. Opens a side panel with a chat
 * interface backed by /api/profile-v2/tune. The user types naturally; the
 * LLM interprets the request, applies a patch, and confirms.
 *
 * This sits alongside the static edit modals — modals for direct field
 * editing, this widget for natural-language adjustments. Both update the
 * same v2 tables.
 */
export function TuneWithAIWidget({ section, label = "Tune with AI", intro }: TuneWithAIWidgetProps) {
  const router = useRouter();
  const tToasts = useTranslations("toasts");
  const [open, setOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([
        { id: crypto.randomUUID(), role: "assistant", content: intro ?? DEFAULT_INTRO[section] },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (text: string) => {
    if (!text.trim() || pending) return;
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setPending(true);
    try {
      const res = await fetch("/api/profile-v2/tune", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ section, message: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((m) => [
          ...m,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: data.message ?? "I hit an error — try again?",
          },
        ]);
        return;
      }
      if (data.understood) {
        setMessages((m) => [
          ...m,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: data.confirmationMessage ?? "Done. Anything else?",
          },
        ]);
        toast.success(tToasts("profile_updated"));
        router.refresh();
      } else {
        setMessages((m) => [
          ...m,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: data.clarifying_question ?? "Could you be more specific?",
          },
        ]);
      }
    } catch {
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Network hiccup — try once more?",
        },
      ]);
    } finally {
      setPending(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send(input);
  };

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="text-xs">
        <Sparkles className="mr-1.5 size-3" />
        {label}
      </Button>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-background shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <Dialog.Title className="text-base font-semibold text-foreground">
                  Tune {sectionLabel(section)} with AI
                </Dialog.Title>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Describe what you want. I&apos;ll update your profile.
                </p>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close"
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </Dialog.Close>
            </div>

            <div role="log" aria-live="polite" className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {pending && (
                <div className="flex justify-start">
                  <div className="rounded-2xl bg-muted px-3 py-2 text-xs text-muted-foreground">
                    Thinking...
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <form onSubmit={handleSubmit} className="flex gap-2 border-t border-border px-5 py-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your instruction..."
                disabled={pending}
                aria-label="Tune profile instruction"
                className="flex-1 rounded-lg bg-muted px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-foreground/20"
              />
              <Button type="submit" size="sm" disabled={pending || !input.trim()}>
                Send
              </Button>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function sectionLabel(s: TuneSection): string {
  switch (s) {
    case "voice":
      return "your voice";
    case "preferences":
      return "your preferences";
    case "positioning":
      return "your positioning";
    case "skills":
      return "your skills";
  }
}
