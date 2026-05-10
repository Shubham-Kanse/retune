/**
 * CompanySchemaRetriever (specialist S2, PRD §6).
 *
 * Resolves a company surface-form ("stripe.com" / "Stripe Inc") into the
 * canonical company-schema node, including tier, funding stage, and
 * 8-dim cultural fingerprint vector. Writes into
 * `hypotheses.company_schema`.
 *
 * Sub-stages (PRD §S2 micro-circuits):
 *   1. alias resolution (delegated to OntologyResolver)
 *   2. cache lookup (in commit #2 the in-memory map IS the cache)
 *   3. freshness check (no-op in commit #2; crawl pipeline lands in #6)
 *   4. stage-of-company classifier (uses funding_stage from KG)
 *   5. cultural fingerprinter (returns the stored fingerprint)
 *   6. talent-flow analyzer (deferred to commit #6 when company KG ships)
 *
 * @brain angular gyrus + DLPFC: schema activation
 * @thinking long_term_memory
 * @cellType stellate
 * @neurotransmitter acetylcholine
 */

import type { Goal, GoalKind } from "@retune/types";
import type { OntologyResolver } from "../../memory/semantic/ontology-resolver";
import { AuditTrail } from "../../workbench/audit-trail";
import type { Specialist, SpecialistContext, SpecialistResult } from "../../workbench/types";

const HANDLES: readonly GoalKind[] = ["analyze_company"];

export class CompanySchemaRetriever implements Specialist {
  readonly id = "company_schema_retriever";
  readonly display_name = "Company Schema Retriever";
  readonly brain_region = "angular_gyrus";
  readonly handles_goal_kinds = HANDLES;
  readonly estimated_cost_usd = 0; // KG read only
  readonly estimated_latency_ms = 5;

  constructor(private readonly resolver: OntologyResolver) {}

  async run(ctx: SpecialistContext, goal: Goal): Promise<SpecialistResult> {
    const t0 = Date.now();
    const company_input = readCompany(goal);
    if (!company_input) {
      return refuse_unknown_input(goal, this.id);
    }

    const resolution = this.resolver.resolve_company(company_input);
    const inputs_hash = AuditTrail.hash({ company: company_input });

    if (!resolution) {
      // Below-threshold confidence → blocking factor written, no fabrication.
      const writes = [
        {
          path: "blocking_factors",
          value: [
            ...((ctx.blackboard.blocking_factors ?? []) as readonly string[]),
            `company_unknown:${company_input}`,
          ],
        },
      ];
      return {
        writes,
        audit: {
          specialist: this.id,
          micro_stage: "miss_to_blocking_factor",
          inputs_hash,
          output_hash: AuditTrail.hash({ resolved: false }),
          justification: `no canonical company for "${company_input}" — recorded as blocking factor (decision gate will surface to user)`,
          latency_ms: Date.now() - t0,
          cost_usd: 0,
          writes: ["blocking_factors"],
        },
      };
    }

    const company_schema = {
      canonical_company_id: resolution.company.canonical_id,
      display_name: resolution.company.display_name,
      tier: resolution.company.tier,
      funding_stage: resolution.company.funding_stage,
      hq_country: resolution.company.hq_country,
      industries: [...resolution.company.industries] as string[],
      cultural_fingerprint: [...resolution.company.cultural_fingerprint] as number[],
    };

    return {
      writes: [{ path: "hypotheses.company_schema", value: company_schema }],
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        micro_stage: "canonical_resolve",
        inputs_hash,
        output_hash: AuditTrail.hash(company_schema),
        justification: `resolved "${company_input}" → ${resolution.company.canonical_id} (tier=${resolution.company.tier}, ${resolution.match_kind} match)`,
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        writes: ["hypotheses.company_schema"],
      },
    };
  }
}

function readCompany(goal: Goal): string | null {
  const c = goal.payload?.company;
  if (typeof c === "string" && c.trim().length > 0) return c.trim();
  return null;
}

function refuse_unknown_input(goal: Goal, specialist_id: string): SpecialistResult {
  return {
    writes: [],
    audit: {
      specialist: specialist_id,
      micro_stage: "missing_input",
      inputs_hash: AuditTrail.hash({ goal_id: goal.id }),
      output_hash: AuditTrail.hash({ refused: true }),
      justification: "no company in goal payload — cannot run",
      latency_ms: 0,
      cost_usd: 0,
      writes: [],
    },
  };
}
