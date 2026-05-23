"use client";

/**
 * Language switcher (Charter 16).
 *
 * Renders a select that POSTs to /api/i18n/locale and reloads the page
 * so server-rendered messages pick up the new bundle. Same UI style as
 * the rest of /settings — no new tokens.
 */

import { LOCALES, LOCALE_LABELS, type Locale } from "@/i18n/config";
import { Languages } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function LanguageCard({ activeLocale }: { activeLocale: Locale }) {
  const [pending, setPending] = useState(false);

  async function handleChange(next: string) {
    if (next === activeLocale) return;
    setPending(true);
    try {
      const res = await fetch("/api/i18n/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
      if (!res.ok) {
        toast.error("Couldn't switch language.");
        return;
      }
      toast.success("Language updated.");
      // Reload so server components re-resolve the active locale.
      window.location.reload();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-muted text-foreground">
          <Languages className="h-4 w-4" aria-hidden />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Language</p>
          <p className="text-xs text-muted-foreground">
            Choose how Retune talks to you. Affects copy across the product.
          </p>
        </div>
      </div>
      <select
        value={activeLocale}
        onChange={(e) => void handleChange(e.target.value)}
        disabled={pending}
        aria-label="Active language"
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
      >
        {LOCALES.map((tag) => (
          <option key={tag} value={tag}>
            {LOCALE_LABELS[tag]}
          </option>
        ))}
      </select>
    </div>
  );
}
