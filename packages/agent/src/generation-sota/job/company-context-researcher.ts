/**
 * CompanyContextResearcher (003 §6.3 Phase C).
 *
 * Uses the active provider's hosted web search to research a company.
 * Falls back gracefully when the provider does not support web search
 * or when consent has not been granted.
 *
 * Caches by (canonical_company_id, role_family) for `freshness_ttl_ms`
 * so repeat generations for the same role+company within the TTL skip
 * the LLM call.
 *
 * Brain region: angular gyrus (semantic memory + canonical lookup).
 */

import type { CompanyModel, Goal, GoalKind } from "@retune/types";
import { getProvider } from "../../lib/provider";
import { AuditTrail } from "../../workbench/audit-trail";
import type { Specialist, SpecialistContext, SpecialistResult } from "../../workbench/types";

const HANDLES: readonly GoalKind[] = ["research_company_context"];

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

interface CacheEntry {
  freshness_iso: string;
  model: CompanyModel;
}

/** Process-local cache. Replaced by a durable table in Phase 8. */
const cache = new Map<string, CacheEntry>();

export interface CompanyContextResearcherOptions {
  /** Inject a fake provider in tests. */
  provider?: ReturnType<typeof getProvider>;
  /** Override the TTL for tests. */
  ttl_ms?: number;
}

export class CompanyContextResearcher implements Specialist {
  readonly id = "company_context_researcher";
  readonly display_name = "Company Context Researcher";
  readonly brain_region = "angular_gyrus";
  readonly handles_goal_kinds = HANDLES;
  readonly estimated_cost_usd = 0.002;
  readonly estimated_latency_ms = 4_000;

  constructor(private readonly options: CompanyContextResearcherOptions = {}) {}

  async run(ctx: SpecialistContext, goal: Goal): Promise<SpecialistResult> {
    const t0 = Date.now();
    const payload = (goal.payload ?? {}) as {
      canonical_company_id?: string;
      display_name?: string;
      role_family?: string;
      consent_web_research?: boolean;
    };

    const company = payload.display_name ?? payload.canonical_company_id;
    if (!company) {
      return {
        writes: [],
        satisfied_goal_ids: [goal.id],
        audit: {
          specialist: this.id,
          micro_stage: "no_company",
          inputs_hash: AuditTrail.hash({ company: null }),
          output_hash: AuditTrail.hash({ status: "skipped" }),
          justification: "no company name supplied — skipping research",
          latency_ms: Date.now() - t0,
          cost_usd: 0,
          writes: [],
        },
      };
    }

    const cache_key = `${(payload.canonical_company_id ?? company).toLowerCase()}:${payload.role_family ?? "any"}`;
    const ttl = this.options.ttl_ms ?? CACHE_TTL_MS;
    const cached = cache.get(cache_key);
    if (cached && Date.now() - new Date(cached.freshness_iso).getTime() < ttl) {
      return {
        writes: [{ path: "sota.company_model", value: cached.model }],
        satisfied_goal_ids: [goal.id],
        audit: {
          specialist: this.id,
          micro_stage: "cache_hit",
          inputs_hash: AuditTrail.hash({ cache_key }),
          output_hash: AuditTrail.hash({
            company: cached.model.canonical_company_id,
            fresh: cached.freshness_iso,
          }),
          justification: `served company_model from cache (age=${Math.round((Date.now() - new Date(cached.freshness_iso).getTime()) / 1000)}s)`,
          latency_ms: Date.now() - t0,
          cost_usd: 0,
          writes: ["sota.company_model"],
        },
      };
    }

    if (!payload.consent_web_research) {
      const skeleton = makeSkeletonCompanyModel(company, payload.canonical_company_id);
      return {
        writes: [{ path: "sota.company_model", value: skeleton }],
        satisfied_goal_ids: [goal.id],
        audit: {
          specialist: this.id,
          micro_stage: "no_consent",
          inputs_hash: AuditTrail.hash({ company }),
          output_hash: AuditTrail.hash({ canonical_company_id: skeleton.canonical_company_id }),
          justification: `no web-research consent — wrote skeleton company_model`,
          latency_ms: Date.now() - t0,
          cost_usd: 0,
          writes: ["sota.company_model"],
        },
      };
    }

    const provider = this.options.provider ?? getProvider();
    let summary: string | null = null;
    let citations: CompanyModel["citations"] = [];
    let stale = false;
    if (provider.capabilities.webSearch) {
      const result = await provider.searchWeb(
        `${company} hiring bar engineering culture recent news`,
        {
          maxUses: 3,
        },
      );
      if (result) {
        summary = result.summary;
        citations = result.citations.map((c) => ({
          url: c.url,
          title: c.title,
          snippet: c.snippet,
          fetched_at: c.fetchedAt,
        }));
        stale = result.partial;
      }
    } else {
      stale = true;
    }

    const model: CompanyModel = {
      schema_version: "sota-v3",
      canonical_company_id:
        payload.canonical_company_id ?? company.toLowerCase().replace(/[^a-z0-9]/g, "-"),
      display_name: company,
      industry: null,
      product_lines: [],
      size_band: "unknown",
      hq_country: null,
      business_priorities: summary ? extractBusinessPriorities(summary) : [],
      technology_signals: summary ? extractTechSignals(summary) : [],
      hiring_bar: null,
      recruiter_style: "unknown",
      culture_vector: null,
      risk_signals: [],
      citations,
      freshness_iso: new Date().toISOString(),
      stale,
      fetch_consent: true,
    };

    cache.set(cache_key, { freshness_iso: model.freshness_iso, model });

    return {
      writes: [{ path: "sota.company_model", value: model }],
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        micro_stage: "web_search",
        inputs_hash: AuditTrail.hash({ company }),
        output_hash: AuditTrail.hash({
          canonical_company_id: model.canonical_company_id,
          n_citations: citations.length,
        }),
        justification: `researched company "${company}" (${citations.length} citations${stale ? ", partial" : ""})`,
        latency_ms: Date.now() - t0,
        cost_usd: 0.002,
        writes: ["sota.company_model"],
      },
    };
  }
}

/** Test-only — clear the in-process cache so a stale entry can't leak between tests. */
export function _resetCompanyResearchCache(): void {
  cache.clear();
}

function makeSkeletonCompanyModel(company: string, canonical?: string): CompanyModel {
  return {
    schema_version: "sota-v3",
    canonical_company_id: canonical ?? company.toLowerCase().replace(/[^a-z0-9]/g, "-"),
    display_name: company,
    industry: null,
    product_lines: [],
    size_band: "unknown",
    hq_country: null,
    business_priorities: [],
    technology_signals: [],
    hiring_bar: null,
    recruiter_style: "unknown",
    culture_vector: null,
    risk_signals: [],
    citations: [],
    freshness_iso: new Date().toISOString(),
    stale: true,
    fetch_consent: false,
  };
}

const TECH_TERMS = [
  "kubernetes",
  "aws",
  "gcp",
  "react",
  "nextjs",
  "typescript",
  "go",
  "python",
  "java",
  "kotlin",
  "rust",
  "graphql",
  "kafka",
  "snowflake",
];

function extractBusinessPriorities(summary: string): string[] {
  const sentences = summary
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return sentences
    .filter((s) => /\b(?:priority|focus|invest|launch|expand|growth|partnership)\b/i.test(s))
    .slice(0, 5);
}

function extractTechSignals(summary: string): string[] {
  const lc = summary.toLowerCase();
  return TECH_TERMS.filter((t) => lc.includes(t));
}
