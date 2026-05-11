import { sql } from "drizzle-orm";
import type { SQLWrapper } from "drizzle-orm";
import { createHash } from "node:crypto";

function normalizeJd(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export async function dualWriteJobDescription(params: {
  db: { execute: (q: string | SQLWrapper) => unknown };
  userId: string;
  jdId?: string | null;
  jdText: string;
  jdUrl?: string | null;
  title?: string | null;
  company?: string | null;
  market?: string | null;
}) {
  const normalized = normalizeJd(params.jdText);
  const jdHash = createHash("sha256").update(normalized).digest("hex");
  if (params.jdId) {
    await params.db.execute(sql`
      insert into public.job_descriptions
        (id, user_id, jd_hash, title, company, market, jd_text, jd_url)
      values
        (${params.jdId}, ${params.userId}, ${jdHash}, ${params.title ?? null}, ${params.company ?? null}, ${params.market ?? null}, ${params.jdText}, ${params.jdUrl ?? null})
      on conflict (user_id, jd_hash) do update set
        id = excluded.id,
        title = coalesce(excluded.title, public.job_descriptions.title),
        company = coalesce(excluded.company, public.job_descriptions.company),
        market = coalesce(excluded.market, public.job_descriptions.market),
        jd_text = excluded.jd_text,
        jd_url = coalesce(excluded.jd_url, public.job_descriptions.jd_url)
    `);
    return;
  }

  await params.db.execute(sql`
    insert into public.job_descriptions
      (user_id, jd_hash, title, company, market, jd_text, jd_url)
    values
      (${params.userId}, ${jdHash}, ${params.title ?? null}, ${params.company ?? null}, ${params.market ?? null}, ${params.jdText}, ${params.jdUrl ?? null})
    on conflict (user_id, jd_hash) do update set
      title = coalesce(excluded.title, public.job_descriptions.title),
      company = coalesce(excluded.company, public.job_descriptions.company),
      market = coalesce(excluded.market, public.job_descriptions.market),
      jd_url = coalesce(excluded.jd_url, public.job_descriptions.jd_url)
  `);
}
