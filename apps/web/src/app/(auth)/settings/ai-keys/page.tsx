"use client";

import { PageHeader, PageShell } from "@/components/app/page-shell";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

/**
 * BYOK settings — bring your own Anthropic / OpenAI key.
 *
 * With a key stored, the user's generations run against THEIR provider
 * account (their billing, their rate limits, their data agreements).
 * Keys are validated live, encrypted at rest, and only ever shown masked.
 */

type Provider = "anthropic" | "openai";

interface StoredKey {
  provider: Provider;
  masked: string;
  status: string;
  last_validated_at: string | null;
}

const PROVIDER_META: Record<Provider, { label: string; placeholder: string; consoleUrl: string }> =
  {
    anthropic: {
      label: "Anthropic",
      placeholder: "sk-ant-api03-…",
      consoleUrl: "https://console.anthropic.com/settings/keys",
    },
    openai: {
      label: "OpenAI",
      placeholder: "sk-…",
      consoleUrl: "https://platform.openai.com/api-keys",
    },
  };

export default function AiKeysSettingsPage() {
  const [available, setAvailable] = useState(true);
  const [keys, setKeys] = useState<StoredKey[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/ai-keys");
      const data = (await res.json()) as { byok_available?: boolean; keys?: StoredKey[] };
      setAvailable(data.byok_available ?? false);
      setKeys(data.keys ?? []);
    } catch {
      // Leave previous state.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <PageShell width="narrow">
      <PageHeader
        eyebrow={
          <Link href="/settings" className="hover:text-foreground">
            ← Settings
          </Link>
        }
        title="Your AI keys"
        subtitle="Bring your own Anthropic or OpenAI key and your tunings run on your account — your billing, your rate limits, your data agreements. Keys are verified, encrypted at rest, and never shown again in full."
      />

      {!available && !loading ? (
        <p className="mt-6 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
          Key storage isn't enabled on this deployment. Ask the operator to set
          RETUNE_BYOK_ENCRYPTION_KEY.
        </p>
      ) : null}

      <div className="mt-8 space-y-6">
        {(Object.keys(PROVIDER_META) as Provider[]).map((provider) => (
          <ProviderKeyCard
            key={provider}
            provider={provider}
            stored={keys.find((k) => k.provider === provider) ?? null}
            disabled={!available}
            onChanged={refresh}
          />
        ))}
      </div>

      <p className="mt-10 text-[11px] leading-relaxed text-muted-foreground/50">
        Without a key of your own, tunings use Retuned's platform models and count against your plan
        credits. Stored keys are encrypted with AES-256-GCM and used only to run your own
        generations; removing a key takes effect immediately.
      </p>
    </PageShell>
  );
}

function ProviderKeyCard({
  provider,
  stored,
  disabled,
  onChanged,
}: {
  provider: Provider;
  stored: StoredKey | null;
  disabled: boolean;
  onChanged: () => Promise<void>;
}) {
  const meta = PROVIDER_META[provider];
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);

  async function save() {
    if (!value.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/settings/ai-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, api_key: value.trim() }),
      });
      const data = (await res.json().catch(() => null)) as {
        message?: string;
        error?: string;
      } | null;
      if (!res.ok) {
        setError(data?.message ?? "Could not save the key.");
        return;
      }
      setValue("");
      setEditing(false);
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError("");
    try {
      await fetch("/api/settings/ai-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  const showInput = editing || !stored;

  return (
    <section className="rounded-lg border border-border/60 p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-foreground">{meta.label}</h2>
          {stored && !editing ? (
            <p className="mt-1 font-mono text-xs text-muted-foreground/70">
              {stored.masked}
              <span className="ml-2 rounded bg-emerald-500/10 px-1.5 py-0.5 font-sans text-[10px] text-emerald-600 dark:text-emerald-400">
                {stored.status === "active" ? "verified" : stored.status}
              </span>
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground/60">
              <a
                href={meta.consoleUrl}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-dotted hover:text-muted-foreground"
              >
                Create a key in the {meta.label} console
              </a>
            </p>
          )}
        </div>
        {stored && !editing ? (
          <div className="flex gap-3 text-xs">
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={busy || disabled}
              className="text-muted-foreground/70 hover:text-foreground disabled:opacity-50"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy}
              className="text-destructive/80 hover:text-destructive disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        ) : null}
      </div>

      {showInput ? (
        <div className="mt-4 flex gap-2">
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={meta.placeholder}
            disabled={busy || disabled}
            className="flex-1 rounded-md border border-border/60 bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || disabled || value.trim().length < 20}
            className="rounded-md bg-foreground px-4 py-2 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Verifying…" : "Verify & save"}
          </button>
          {editing ? (
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setValue("");
                setError("");
              }}
              disabled={busy}
              className="text-xs text-muted-foreground/60 hover:text-muted-foreground"
            >
              Cancel
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
