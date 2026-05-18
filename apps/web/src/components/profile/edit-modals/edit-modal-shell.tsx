"use client";

import { Button } from "@/components/ui/button";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type * as React from "react";

interface EditModalShellProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  onSave: () => void;
  saving?: boolean;
  saveLabel?: string;
}

/** Shared chrome for the profile edit modals — avoids duplicating Radix Dialog boilerplate across 5 files. */
export function EditModalShell({
  open,
  onOpenChange,
  title,
  description,
  children,
  onSave,
  saving = false,
  saveLabel = "Save",
}: EditModalShellProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-border bg-background shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <Dialog.Title className="text-base font-semibold text-foreground">
                {title}
              </Dialog.Title>
              {description && (
                <Dialog.Description className="mt-0.5 text-xs text-muted-foreground">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>

          <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/20 px-5 py-3">
            <Dialog.Close asChild>
              <Button type="button" variant="ghost" size="sm">
                Cancel
              </Button>
            </Dialog.Close>
            <Button type="button" size="sm" onClick={onSave} disabled={saving}>
              {saving ? "Saving..." : saveLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
