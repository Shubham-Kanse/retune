"use client";
import { X } from "lucide-react";
import { useEffect } from "react";

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { keys: ["?"], description: "Show this help menu" },
  { keys: ["Esc"], description: "Close modals and dialogs" },
  { keys: ["Cmd/Ctrl", "K"], description: "Focus main input" },
  { keys: ["Cmd/Ctrl", "Enter"], description: "Submit forms" },
  { keys: ["Enter"], description: "Navigate to application" },
] as const;

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md border border-border bg-background p-6 animate-in fade-in zoom-in-95">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
            <button
              onClick={onClose}
              className="rounded-lg p-1 hover:bg-muted transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-3">
            {SHORTCUTS.map((shortcut, i) => (
              <div key={i} className="flex items-center justify-between gap-4">
                <span className="text-sm text-muted-foreground flex-1">{shortcut.description}</span>
                <div className="flex items-center gap-1.5">
                  {shortcut.keys.map((key, j) => (
                    <span key={j} className="flex items-center gap-1">
                      <kbd className="px-2 py-1 text-xs font-semibold border border-border bg-muted rounded">
                        {key}
                      </kbd>
                      {j < shortcut.keys.length - 1 && (
                        <span className="text-muted-foreground text-xs">+</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Press{" "}
              <kbd className="px-1.5 py-0.5 text-xs font-semibold border border-border bg-muted rounded">
                ?
              </kbd>{" "}
              anytime to open this menu
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
