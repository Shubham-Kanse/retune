"use client";

import { apiUrl } from "@/lib/api-config";
import { ArrowLeft, Mail, MessageSquare, RotateCcw, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

interface RefusalPayload {
  generation_id: string;
  status: string;
  verdict: string | null;
  termination: string | null;
  conflicts: Array<{ id: string; monitor: string; severity: string; summary: string }>;
  pending_revisions: Array<{ target: string; reason: string }>;
}

export default function RefusedPage() {
  const t = useTranslations("refusal");
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [data, setData] = useState<RefusalPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(apiUrl(`/generate/${id}`));
        if (res.ok && !cancelled) setData(await res.json());
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  return (
    <div className="min-h-screen flex items-start justify-center pt-16 px-6">
      <div className="w-full max-w-2xl">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-3.5 w-3.5" /> {t("back_to_dashboard")}
        </Link>

        <div className="rounded-3xl border border-[#fde68a] bg-[#fef9c3]/90 p-8 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)] mb-8">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-1 h-6 w-6 text-[#d97706] shrink-0" />
            <div>
              <p className="rt-label text-[#d97706]">{t("decision_label")}</p>
              <h1 className="font-serif text-3xl font-normal text-foreground mt-1 leading-tight">{t("title")}</h1>
              <p className="mt-3 text-sm text-muted-foreground max-w-prose">{t("body")}</p>
            </div>
          </div>
        </div>

        {loading && <p className="text-sm text-muted-foreground">{t("loading")}</p>}

        {!loading && data && (
          <>
            <section className="space-y-3 mb-8">
              <h2 className="rt-label">{t("why_heading")}</h2>
              {data.conflicts.length === 0 && (
                <div className="rounded-3xl border border-[#e0ddd9] bg-white/90 p-4 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)] text-sm text-muted-foreground">
                  {t("termination_label")}: <span className="font-mono">{data.termination ?? t("termination_unknown")}</span>
                </div>
              )}
              {data.conflicts.map((c) => (
                <article key={c.id} className="rounded-3xl border border-[#e0ddd9] bg-white/90 p-5 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
                  <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-medium text-foreground">
                      {(() => {
                        const key = `titles.${c.monitor}` as Parameters<typeof t>[0];
                        try { return t(key); } catch { return c.monitor.replace(/_/g, " "); }
                      })()}
                    </h3>
                    <span className="rt-label shrink-0">{c.severity}</span>
                  </div>
                  <p className="mt-2 text-sm text-foreground leading-relaxed">{c.summary}</p>
                  <p className="mt-4 border-l-2 border-[#fde68a] pl-3 text-sm text-muted-foreground">
                    <strong className="text-foreground">{t("next_step_prefix")}</strong>{" "}
                    {(() => {
                      const key = `next_steps.${c.monitor}` as Parameters<typeof t>[0];
                      try { return t(key); } catch { return t("next_steps.default"); }
                    })()}
                  </p>
                </article>
              ))}
            </section>

            {data.pending_revisions.length > 0 && (
              <section className="mb-8">
                <h2 className="rt-label mb-3">{t("drafts_heading")}</h2>
                <ul className="space-y-2">
                  {data.pending_revisions.map((r) => (
                    <li key={r.target} className="rounded-3xl border border-[#e0ddd9] bg-white/90 p-4 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)] text-sm">
                      <span className="font-mono text-xs text-muted-foreground">{r.target}</span>
                      <p className="mt-1 text-foreground">{r.reason}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        <section className="rounded-3xl border border-[#e0ddd9] bg-white/90 p-6 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)] mb-8">
          <h3 className="text-sm font-medium text-foreground mb-2">{t("contest_title")}</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-prose">{t("contest_body")}</p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/generate/${id}/contest`} className="rt-btn-ghost inline-flex items-center gap-2"><MessageSquare className="h-4 w-4" />{t("contest_button")}</Link>
            <a href="mailto:support@retuned.cv" className="rt-btn-ghost inline-flex items-center gap-2"><Mail className="h-4 w-4" />{t("email_support")}</a>
            <Link href={`/generate/${id}/audit`} className="rt-btn-ghost inline-flex items-center gap-2"><RotateCcw className="h-4 w-4" />{t("replay_cycle")}</Link>
          </div>
        </section>

        <div className="flex items-center justify-between border-t border-[#e0ddd9] pt-6">
          <Link href="/dashboard" className="rt-btn-ghost inline-flex items-center gap-2"><ArrowLeft className="h-4 w-4" />{t("back_to_dashboard")}</Link>
          <Link href="/generate/new" className="rt-btn">{t("try_different_role")}</Link>
        </div>
      </div>
    </div>
  );
}
