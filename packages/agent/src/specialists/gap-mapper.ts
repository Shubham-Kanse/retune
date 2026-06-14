/**
 * GapMapper specialist — DLPFC working memory.
 *
 * For every JD requirement in `evidence_graph.requirement_matches`, produces
 * a typed disposition via multi-signal fusion:
 *
 *   1. Evidence presence + confidence → direct_hit threshold check
 *   2. Ontology traversal → implied_hit (e.g. Helm → K8s, React → TypeScript)
 *   3. Adjacent-domain transfer reasoning → transferable with haircut
 *   4. Discourse-function weighting → load-bearing vs aspirational
 *   5. Honesty calibration → per-claim-type confidence modulation
 *   6. Level-aware seniority reasoning → missable for over-leveled basics
 *
 * The Gap Map is the single authoritative source for what goes in the resume
 * vs cover letter vs gets omitted. It feeds directly into EvidenceSolver
 * (commit #9) and cover-letter writer (commit #10).
 *
 * Goal kind: `map_gaps`
 *
 * Reads:
 *   - evidence_graph.requirement_matches (JdSpanExtractor, commit #6)
 *   - evidence_graph.span_ids (JdSpanExtractor, commit #6)
 *   - hypotheses.role_schema (TitleSchemaRetriever, commit #2)
 *   - hypotheses.discourse_map (DiscourseClassifier, commit #7)
 *   - hypotheses.honesty_calibration (HonestyCalibrator, commit #8)
 *   - hypotheses.hidden_disqualifiers (CredibilityScanner, commit #8)
 *
 * Writes:
 *   - evidence_graph.gap_map
 *
 * Emits child goal: `solve_evidence` (priority - 1)
 *
 */

import { randomUUID } from "node:crypto";
import type { Confidence, Goal, GoalKind } from "@retune/types";
import { AuditTrail } from "../workbench/audit-trail";
import type { Specialist, SpecialistContext, SpecialistResult } from "../workbench/types";

const HANDLES: readonly GoalKind[] = ["map_gaps"];

// ──────────── Disposition types ────────────

type RequirementDisposition =
  | "direct_hit"
  | "implied_hit"
  | "transferable"
  | "missable"
  | "must_address_in_cover_letter"
  | "must_omit_from_application";

// ──────────── Public output types ────────────

export interface GapMapEntry {
  requirement_id: string;
  requirement_text: string;
  disposition: RequirementDisposition;
  evidence_span_ids: string[];
  confidence: number;
  adjusted_confidence: number;
  reason: string;
  discourse_function: string | null;
  discourse_importance: number;
  transfer_path: string[] | null;
  is_hard_constraint: boolean;
  and_or_group: string | null;
}

export interface GapMapSummary {
  direct_hits: number;
  implied_hits: number;
  transferable: number;
  missable: number;
  cover_letter: number;
  must_omit: number;
  total_requirements: number;
  hard_requirements_met: number;
  hard_requirements_total: number;
  coverage_pct: number;
  weighted_coverage: number;
}

export interface GapMap {
  entries: GapMapEntry[];
  summary: GapMapSummary;
  and_or_groups: AndOrGroup[];
  disqualifier_overlap: string[];
}

export interface AndOrGroup {
  group_id: string;
  kind: "and" | "or";
  requirement_ids: string[];
  satisfied: boolean;
  satisfaction_confidence: number;
}

// ──────────── Skill adjacency graph (ontology traversal) ────────────
//
// Represents the "angular gyrus" semantic integration: if a candidate
// has skill A and the JD requires skill B, and A → B exists in this
// graph, we can claim implied_hit with edge-specific confidence.
//
// This is a deliberately conservative seed — commit #14 replaces it
// with a learned embedding-distance threshold over the full skill taxonomy.

interface SkillEdge {
  from: string;
  to: string;
  confidence: number;
  rationale: string;
}

const SKILL_ADJACENCY: readonly SkillEdge[] = [
  // Container orchestration
  {
    from: "docker",
    to: "kubernetes",
    confidence: 0.65,
    rationale: "container runtime → orchestration",
  },
  {
    from: "kubernetes",
    to: "helm",
    confidence: 0.75,
    rationale: "k8s deployment → chart management",
  },
  {
    from: "docker-compose",
    to: "kubernetes",
    confidence: 0.55,
    rationale: "local compose → cluster orchestration",
  },
  { from: "ecs", to: "kubernetes", confidence: 0.6, rationale: "AWS orchestration → k8s" },
  // Cloud platforms
  { from: "aws", to: "gcp", confidence: 0.55, rationale: "cloud provider transfer" },
  { from: "aws", to: "azure", confidence: 0.55, rationale: "cloud provider transfer" },
  { from: "gcp", to: "aws", confidence: 0.55, rationale: "cloud provider transfer" },
  { from: "terraform", to: "pulumi", confidence: 0.7, rationale: "IaC paradigm transfer" },
  {
    from: "terraform",
    to: "cloudformation",
    confidence: 0.65,
    rationale: "IaC → vendor-specific IaC",
  },
  // Languages
  { from: "python", to: "ruby", confidence: 0.5, rationale: "dynamic scripting transfer" },
  { from: "java", to: "kotlin", confidence: 0.75, rationale: "JVM ecosystem" },
  { from: "java", to: "scala", confidence: 0.65, rationale: "JVM + FP" },
  { from: "javascript", to: "typescript", confidence: 0.85, rationale: "superset" },
  { from: "typescript", to: "javascript", confidence: 0.95, rationale: "subset" },
  { from: "c++", to: "rust", confidence: 0.55, rationale: "systems language transfer" },
  { from: "go", to: "rust", confidence: 0.45, rationale: "concurrent systems" },
  { from: "python", to: "go", confidence: 0.35, rationale: "weak transfer (different paradigm)" },
  // Frameworks
  { from: "react", to: "vue", confidence: 0.65, rationale: "component-model transfer" },
  { from: "react", to: "angular", confidence: 0.5, rationale: "SPA framework transfer" },
  { from: "express", to: "fastify", confidence: 0.8, rationale: "Node HTTP server" },
  { from: "django", to: "flask", confidence: 0.75, rationale: "Python web framework" },
  { from: "spring", to: "spring-boot", confidence: 0.9, rationale: "Spring ecosystem" },
  { from: "next.js", to: "nuxt", confidence: 0.55, rationale: "meta-framework transfer" },
  // Databases
  { from: "postgresql", to: "mysql", confidence: 0.75, rationale: "RDBMS transfer" },
  { from: "mongodb", to: "dynamodb", confidence: 0.55, rationale: "NoSQL document store" },
  { from: "redis", to: "memcached", confidence: 0.7, rationale: "in-memory cache" },
  {
    from: "kafka",
    to: "rabbitmq",
    confidence: 0.5,
    rationale: "message broker (different semantics)",
  },
  { from: "kafka", to: "kinesis", confidence: 0.65, rationale: "streaming transfer" },
  // ML/AI
  { from: "pytorch", to: "tensorflow", confidence: 0.6, rationale: "DL framework transfer" },
  { from: "scikit-learn", to: "xgboost", confidence: 0.7, rationale: "ML library" },
  { from: "pandas", to: "spark", confidence: 0.45, rationale: "dataframe API (scale differs)" },
  // Observability
  { from: "datadog", to: "prometheus", confidence: 0.6, rationale: "monitoring platform" },
  { from: "grafana", to: "datadog", confidence: 0.55, rationale: "visualization → platform" },
  { from: "elk", to: "splunk", confidence: 0.6, rationale: "log aggregation" },
  // CI/CD
  { from: "github-actions", to: "gitlab-ci", confidence: 0.7, rationale: "CI/CD pipeline" },
  { from: "jenkins", to: "github-actions", confidence: 0.55, rationale: "CI paradigm transfer" },
  { from: "circleci", to: "github-actions", confidence: 0.7, rationale: "cloud CI transfer" },
] as const;

// Build adjacency index for O(1) lookup
const ADJACENCY_INDEX = build_adjacency_index(SKILL_ADJACENCY);

function build_adjacency_index(
  edges: readonly SkillEdge[],
): Map<string, Array<{ target: string; confidence: number; rationale: string }>> {
  const idx = new Map<string, Array<{ target: string; confidence: number; rationale: string }>>();
  for (const e of edges) {
    const key = e.from.toLowerCase();
    if (!idx.has(key)) idx.set(key, []);
    idx
      .get(key)!
      .push({ target: e.to.toLowerCase(), confidence: e.confidence, rationale: e.rationale });
  }
  return idx;
}

// ──────────── AND/OR group detection ────────────
//
// JD requirements often form logical groups:
//   AND: "5+ years Python AND experience with Django"
//   OR: "experience with React OR Vue OR Angular"
//
// These are detected via linguistic signals in the requirement text.

const OR_SIGNALS = /\bor\b|\//i;
const AND_SIGNALS = /\band\b|,\s*(?:and\s+)?/i;

// ──────────── Missable signal patterns ────────────

const MISSABLE_EXPLICIT: readonly RegExp[] = [
  /nice[\s-]to[\s-]have/i,
  /bonus(?:\s+points?)?/i,
  /preferred\s+but\s+not\s+required/i,
  /\ba\s+plus\b/i,
  /ideally/i,
  /not\s+required\s+but/i,
  /would\s+be\s+great/i,
  /familiarity\s+(?:is\s+)?helpful/i,
];

const MISSABLE_SENIORITY: readonly RegExp[] = [
  /basic\s+understanding/i,
  /awareness\s+of/i,
  /exposure\s+to/i,
  /familiar\s+with\s+(?:the\s+)?concept/i,
  /general\s+knowledge/i,
];

// ──────────── Explicable (cover-letter addressable) ────────────

const EXPLICABLE_PATTERNS: readonly RegExp[] = [
  /(?:\d+\+?\s+years?\s+)?experience\s+(?:with|in|using)/i,
  /knowledge\s+of/i,
  /understanding\s+of/i,
  /proficiency\s+in/i,
  /background\s+in/i,
  /hands[- ]on\s+experience/i,
  /track\s+record/i,
  /proven\s+ability/i,
];

// ──────────── Thresholds ────────────

const DIRECT_HIT_THRESHOLD = 0.7;
const IMPLIED_HIT_THRESHOLD = 0.5;
const TRANSFERABLE_THRESHOLD = 0.3;
const HARD_CONSTRAINT_THRESHOLD = 0.7;

// ──────────── Main specialist ────────────

export class GapMapper implements Specialist {
  readonly id = "gap_mapper";
  readonly display_name = "Mapping role requirements";
  readonly brain_region = "DLPFC";
  readonly handles_goal_kinds = HANDLES;
  readonly estimated_cost_usd = 0;
  readonly estimated_latency_ms = 8;

  async run(ctx: SpecialistContext, goal: Goal): Promise<SpecialistResult> {
    const t0 = Date.now();
    const { evidence_graph, hypotheses } = ctx.blackboard;

    if (evidence_graph.requirement_matches.length === 0) {
      return this.empty_result(goal, t0);
    }

    const role_level = hypotheses.role_schema?.level ?? "mid";
    const role_family = hypotheses.role_schema?.family ?? "swe";
    const discourse_map = hypotheses.discourse_map ?? [];
    const honesty_cal = hypotheses.honesty_calibration ?? {};
    const hidden_disqualifiers = hypotheses.hidden_disqualifiers ?? [];

    // Build discourse-function lookup: requirement_text → (function, importance)
    const discourse_lookup = build_discourse_lookup(discourse_map);

    // Classify each requirement
    const entries: GapMapEntry[] = evidence_graph.requirement_matches.map((rm) =>
      this.classify_requirement(rm, {
        role_level,
        role_family,
        discourse_lookup,
        honesty_cal,
        all_span_ids: evidence_graph.span_ids,
      }),
    );

    // Detect AND/OR logical groups
    const and_or_groups = this.detect_and_or_groups(entries);

    // Cross-reference with hidden disqualifiers
    const disqualifier_overlap = this.find_disqualifier_overlap(entries, hidden_disqualifiers);

    // Build summary
    const summary = this.compute_summary(entries, and_or_groups);

    const gap_map: GapMap = {
      entries,
      summary,
      and_or_groups,
      disqualifier_overlap,
    };

    const inputs_hash = AuditTrail.hash({
      n_requirements: evidence_graph.requirement_matches.length,
      n_spans: evidence_graph.span_ids.length,
      role_level,
      role_family,
      n_discourse_sentences: discourse_map.length,
      n_honesty_kinds: Object.keys(honesty_cal).length,
    });

    // Emit child goal: solve_evidence (priority degraded by 1)
    const solver_goal = {
      id: randomUUID(),
      kind: "solve_evidence" as const,
      priority: Math.max(0, (goal.priority ?? 80) - 1),
      emitted_by: this.id,
      payload: {
        bullet_budget: this.estimate_bullet_budget(entries, role_level),
        max_claims_per_bullet: 3,
      },
      status: "pending" as const,
      satisfied_by: [] as string[],
      parent_goal_id: goal.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    return {
      writes: [{ path: "evidence_graph.gap_map", value: gap_map }],
      new_goals: [solver_goal],
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        micro_stage: "classify_and_group",
        inputs_hash,
        output_hash: AuditTrail.hash({
          ...summary,
          n_groups: and_or_groups.length,
          n_disqualifier_overlap: disqualifier_overlap.length,
        }),
        justification: `mapped ${entries.length} requirements → ${summary.direct_hits} direct, ${summary.implied_hits} implied, ${summary.transferable} transferable, ${summary.missable} missable, ${summary.cover_letter} cover-letter, ${summary.must_omit} omit | coverage=${summary.coverage_pct.toFixed(1)}% | ${and_or_groups.length} logical groups | ${disqualifier_overlap.length} disqualifier overlaps`,
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        writes: ["evidence_graph.gap_map"],
      },
    };
  }

  // ──────────── Core classification ────────────

  private classify_requirement(
    rm: {
      requirement_id: string;
      requirement_text: string;
      disposition: string;
      evidence_span_ids: string[];
      match_confidence: Confidence;
    },
    ctx: {
      role_level: string;
      role_family: string;
      discourse_lookup: Map<string, { function_type: string; importance: number }>;
      honesty_cal: Record<string, number>;
      all_span_ids: string[];
    },
  ): GapMapEntry {
    const conf = rm.match_confidence.point;
    const has_evidence = rm.evidence_span_ids.length > 0;
    const text = rm.requirement_text;

    // Discourse function context (if matched)
    const discourse_info = find_discourse_match(text, ctx.discourse_lookup);

    // Honesty calibration haircut: reduce confidence for claim types
    // where the user historically over-claims
    const honesty_haircut = this.compute_honesty_haircut(text, ctx.honesty_cal);
    const adjusted_confidence = conf * honesty_haircut;

    let disposition: RequirementDisposition;
    let reason: string;
    let transfer_path: string[] | null = null;

    if (has_evidence && adjusted_confidence >= DIRECT_HIT_THRESHOLD) {
      disposition = "direct_hit";
      reason = `confidence ${adjusted_confidence.toFixed(3)} ≥ ${DIRECT_HIT_THRESHOLD} with ${rm.evidence_span_ids.length} evidence spans (honesty haircut: ${honesty_haircut.toFixed(3)})`;
    } else if (has_evidence && adjusted_confidence >= IMPLIED_HIT_THRESHOLD) {
      // Check ontology for transfer path
      const traversal = this.attempt_ontology_traversal(text, ctx.all_span_ids);
      if (traversal) {
        disposition = "implied_hit";
        transfer_path = traversal.path;
        reason = `KG traversal: ${traversal.path.join(" → ")} (edge confidence: ${traversal.confidence.toFixed(3)}, rationale: ${traversal.rationale})`;
      } else {
        disposition = "implied_hit";
        reason = `confidence ${adjusted_confidence.toFixed(3)} suggests implied match without explicit KG path`;
      }
    } else if (has_evidence && adjusted_confidence >= TRANSFERABLE_THRESHOLD) {
      const traversal = this.attempt_ontology_traversal(text, ctx.all_span_ids);
      disposition = "transferable";
      transfer_path = traversal?.path ?? null;
      const haircut_note =
        honesty_haircut < 1.0 ? ` (honesty-adjusted from ${conf.toFixed(3)})` : "";
      reason = `adjacent-domain transfer, adjusted confidence ${adjusted_confidence.toFixed(3)}${haircut_note}${traversal ? `, KG: ${traversal.path.join(" → ")}` : ""}`;
    } else if (!has_evidence && this.is_missable(text, ctx.role_level)) {
      disposition = "missable";
      reason = this.missable_reason(text, ctx.role_level);
    } else if (!has_evidence && this.is_explicable(text)) {
      disposition = "must_address_in_cover_letter";
      reason =
        "gap addressable via cover-letter narrative (eager-to-learn framing or adjacent-experience pivot)";
    } else if (!has_evidence) {
      disposition = "must_omit_from_application";
      reason = "irreducible gap: no evidence, no KG path, not explicable — do not draw attention";
    } else {
      // Low confidence with evidence — attempt transfer path
      const traversal = this.attempt_ontology_traversal(text, ctx.all_span_ids);
      if (traversal && traversal.confidence >= TRANSFERABLE_THRESHOLD) {
        disposition = "transferable";
        transfer_path = traversal.path;
        reason = `low direct confidence (${adjusted_confidence.toFixed(3)}) but KG transfer: ${traversal.path.join(" → ")}`;
      } else {
        disposition = "must_address_in_cover_letter";
        reason = `evidence exists but confidence too low (${adjusted_confidence.toFixed(3)}) for resume inclusion`;
      }
    }

    // Determine if this is a hard constraint (load-bearing for application success)
    const is_hard = this.is_hard_constraint(disposition, adjusted_confidence, discourse_info);

    return {
      requirement_id: rm.requirement_id,
      requirement_text: text,
      disposition,
      evidence_span_ids: rm.evidence_span_ids,
      confidence: conf,
      adjusted_confidence,
      reason,
      discourse_function: discourse_info?.function_type ?? null,
      discourse_importance: discourse_info?.importance ?? 0.5,
      transfer_path,
      is_hard_constraint: is_hard,
      and_or_group: null, // filled by detect_and_or_groups
    };
  }

  // ──────────── Ontology traversal (angular gyrus) ────────────

  private attempt_ontology_traversal(
    requirement_text: string,
    _all_span_ids: string[],
  ): { path: string[]; confidence: number; rationale: string } | null {
    // Extract skill tokens from requirement text
    const tokens = extract_skill_tokens(requirement_text);
    if (tokens.length === 0) return null;

    // For each required skill, check if any adjacent skill is in our evidence
    // (In commit #14 this becomes embedding-distance over the full taxonomy)
    for (const required_skill of tokens) {
      const adjacencies = ADJACENCY_INDEX.get(required_skill.toLowerCase());
      if (!adjacencies) continue;

      // Check reverse edges too: if JD wants "kubernetes" and we have "docker"
      for (const [source_skill, edges] of ADJACENCY_INDEX.entries()) {
        for (const edge of edges) {
          if (edge.target === required_skill.toLowerCase()) {
            return {
              path: [source_skill, required_skill],
              confidence: edge.confidence,
              rationale: edge.rationale,
            };
          }
        }
      }

      // Direct edge: we have "docker" and JD wants "kubernetes"
      // (would need span text lookup — for now check if any adjacency exists)
      if (adjacencies.length > 0) {
        const best = adjacencies.reduce((a, b) => (a.confidence > b.confidence ? a : b));
        return {
          path: [required_skill, best.target],
          confidence: best.confidence * 0.7, // discount for direction uncertainty
          rationale: best.rationale,
        };
      }
    }

    return null;
  }

  // ──────────── Honesty calibration (OFC integration) ────────────

  private compute_honesty_haircut(text: string, honesty_cal: Record<string, number>): number {
    if (Object.keys(honesty_cal).length === 0) return 1.0;

    // Map requirement text to claim type via keyword heuristics
    const claim_type = infer_claim_type(text);
    if (!claim_type) return 1.0;

    const trust = honesty_cal[claim_type];
    if (trust === undefined) return 1.0;

    // Haircut formula: if trust is low (user over-claims this type),
    // reduce confidence. Range: trust ∈ [0,1] → haircut ∈ [0.6, 1.0]
    // Floor at 0.6 prevents total suppression of legitimate claims.
    return 0.6 + 0.4 * trust;
  }

  // ──────────── Missable detection ────────────

  private is_missable(text: string, role_level: string): boolean {
    // Explicit nice-to-have signals
    if (MISSABLE_EXPLICIT.some((r) => r.test(text))) return true;

    // Level-aware: for senior+, basic-skill signals are missable
    const senior_levels = ["senior", "staff", "principal", "director"];
    if (senior_levels.includes(role_level)) {
      if (MISSABLE_SENIORITY.some((r) => r.test(text))) return true;
    }

    return false;
  }

  private missable_reason(text: string, role_level: string): string {
    if (MISSABLE_EXPLICIT.some((r) => r.test(text))) {
      return "explicit nice-to-have signal in requirement text";
    }
    return `basic-skill requirement missable for ${role_level}-level candidate (assumed competence)`;
  }

  private is_explicable(text: string): boolean {
    return EXPLICABLE_PATTERNS.some((r) => r.test(text));
  }

  // ──────────── Hard constraint detection ────────────

  private is_hard_constraint(
    disposition: RequirementDisposition,
    confidence: number,
    discourse_info: { function_type: string; importance: number } | null,
  ): boolean {
    // If discourse says it's a "filter" or "actual_test", it's hard
    if (discourse_info) {
      if (discourse_info.function_type === "filter") return true;
      if (discourse_info.function_type === "actual_test" && discourse_info.importance >= 0.7)
        return true;
    }

    // If disposition is direct_hit or implied_hit with high confidence, it's hard
    if (
      (disposition === "direct_hit" || disposition === "implied_hit") &&
      confidence >= HARD_CONSTRAINT_THRESHOLD
    ) {
      return true;
    }

    return false;
  }

  // ──────────── AND/OR group detection ────────────

  private detect_and_or_groups(entries: GapMapEntry[]): AndOrGroup[] {
    const groups: AndOrGroup[] = [];

    for (const entry of entries) {
      const text = entry.requirement_text;

      // Detect "X or Y or Z" patterns
      if (OR_SIGNALS.test(text)) {
        const parts = text
          .split(OR_SIGNALS)
          .map((p) => p.trim())
          .filter((p) => p.length > 3);
        if (parts.length >= 2) {
          const group_id = `or_${entry.requirement_id}`;
          entry.and_or_group = group_id;
          // OR group satisfied if ANY part has evidence
          const satisfied =
            entry.disposition === "direct_hit" || entry.disposition === "implied_hit";
          groups.push({
            group_id,
            kind: "or",
            requirement_ids: [entry.requirement_id],
            satisfied,
            satisfaction_confidence: satisfied ? entry.adjusted_confidence : 0,
          });
        }
      }
    }

    // Detect sequential AND patterns (adjacent requirements with AND connectors)
    for (let i = 0; i < entries.length - 1; i++) {
      const current = entries[i]!;
      const next = entries[i + 1]!;
      if (
        AND_SIGNALS.test(current.requirement_text) &&
        current.is_hard_constraint &&
        next.is_hard_constraint
      ) {
        const group_id = `and_${current.requirement_id}_${next.requirement_id}`;
        current.and_or_group = group_id;
        next.and_or_group = group_id;
        const both_satisfied =
          (current.disposition === "direct_hit" || current.disposition === "implied_hit") &&
          (next.disposition === "direct_hit" || next.disposition === "implied_hit");
        groups.push({
          group_id,
          kind: "and",
          requirement_ids: [current.requirement_id, next.requirement_id],
          satisfied: both_satisfied,
          satisfaction_confidence: both_satisfied
            ? Math.min(current.adjusted_confidence, next.adjusted_confidence)
            : 0,
        });
      }
    }

    return groups;
  }

  // ──────────── Disqualifier cross-reference ────────────

  private find_disqualifier_overlap(entries: GapMapEntry[], disqualifiers: string[]): string[] {
    if (disqualifiers.length === 0) return [];

    const overlaps: string[] = [];
    for (const entry of entries) {
      if (entry.disposition === "must_omit_from_application") {
        for (const dq of disqualifiers) {
          // Check if the requirement text is semantically related to a disqualifier
          if (text_overlap_score(entry.requirement_text, dq) > 0.3) {
            overlaps.push(`${entry.requirement_id} ↔ "${dq}"`);
          }
        }
      }
    }
    return overlaps;
  }

  // ──────────── Bullet budget estimation ────────────

  private estimate_bullet_budget(entries: GapMapEntry[], role_level: string): number {
    const addressable = entries.filter(
      (e) =>
        e.disposition === "direct_hit" ||
        e.disposition === "implied_hit" ||
        e.disposition === "transferable",
    ).length;

    // Budget: senior/staff get more bullets (deeper experience)
    const level_multiplier: Record<string, number> = {
      intern: 0.5,
      junior: 0.7,
      mid: 1.0,
      senior: 1.2,
      staff: 1.3,
      principal: 1.4,
      manager: 1.1,
      director: 1.2,
    };
    const mult = level_multiplier[role_level] ?? 1.0;

    // Base: 3 bullets per addressable requirement, capped at 24, floored at 6
    const raw = Math.ceil(addressable * 3 * mult);
    return Math.max(6, Math.min(24, raw));
  }

  private empty_result(goal: Goal, t0: number): SpecialistResult {
    return {
      writes: [],
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        micro_stage: "no_requirements",
        inputs_hash: AuditTrail.hash({ goal_id: goal.id }),
        output_hash: AuditTrail.hash({ empty: true }),
        justification: "no requirement_matches on evidence_graph — nothing to map",
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        writes: [],
      },
    };
  }

  // ──────────── Summary computation ────────────

  private compute_summary(entries: GapMapEntry[], groups: AndOrGroup[]): GapMapSummary {
    const summary: GapMapSummary = {
      direct_hits: 0,
      implied_hits: 0,
      transferable: 0,
      missable: 0,
      cover_letter: 0,
      must_omit: 0,
      total_requirements: entries.length,
      hard_requirements_met: 0,
      hard_requirements_total: 0,
      coverage_pct: 0,
      weighted_coverage: 0,
    };

    let weighted_sum = 0;
    let weight_total = 0;

    for (const e of entries) {
      const weight = e.discourse_importance;
      weight_total += weight;

      switch (e.disposition) {
        case "direct_hit":
          summary.direct_hits++;
          weighted_sum += weight * e.adjusted_confidence;
          break;
        case "implied_hit":
          summary.implied_hits++;
          weighted_sum += weight * e.adjusted_confidence * 0.85;
          break;
        case "transferable":
          summary.transferable++;
          weighted_sum += weight * e.adjusted_confidence * 0.6;
          break;
        case "missable":
          summary.missable++;
          break;
        case "must_address_in_cover_letter":
          summary.cover_letter++;
          break;
        case "must_omit_from_application":
          summary.must_omit++;
          break;
      }

      if (e.is_hard_constraint) {
        summary.hard_requirements_total++;
        if (e.disposition === "direct_hit" || e.disposition === "implied_hit") {
          summary.hard_requirements_met++;
        }
      }
    }

    // Coverage: fraction of non-missable requirements that are addressable
    const meaningful = entries.length - summary.missable;
    const addressable = summary.direct_hits + summary.implied_hits + summary.transferable;
    summary.coverage_pct = meaningful > 0 ? (addressable / meaningful) * 100 : 100;

    // Weighted coverage: importance-weighted, confidence-modulated
    summary.weighted_coverage = weight_total > 0 ? weighted_sum / weight_total : 0;

    return summary;
  }
}

// ──────────── Utility functions ────────────

function build_discourse_lookup(
  discourse_map: ReadonlyArray<{ text: string; function: string; importance: number }>,
): Map<string, { function_type: string; importance: number }> {
  const lookup = new Map<string, { function_type: string; importance: number }>();
  for (const s of discourse_map) {
    // Index by normalized first 60 chars for fuzzy matching against requirement_text
    const key = s.text.toLowerCase().slice(0, 60);
    lookup.set(key, { function_type: s.function, importance: s.importance });
  }
  return lookup;
}

function find_discourse_match(
  requirement_text: string,
  lookup: Map<string, { function_type: string; importance: number }>,
): { function_type: string; importance: number } | null {
  const normalized = requirement_text.toLowerCase().slice(0, 60);
  // Exact prefix match
  const exact = lookup.get(normalized);
  if (exact) return exact;
  // Substring containment
  for (const [key, value] of lookup) {
    if (key.includes(normalized) || normalized.includes(key)) return value;
  }
  return null;
}

function extract_skill_tokens(text: string): string[] {
  // Extract likely skill/technology names (capitalized words, hyphenated compounds, known patterns)
  const tokens: string[] = [];
  const skill_pattern = /\b(?:[A-Z][a-z]+(?:\.[a-z]+)?|[a-z]+(?:[-\.][a-z]+)+|[A-Z]{2,})\b/g;
  let match: RegExpExecArray | null;
  while ((match = skill_pattern.exec(text)) !== null) {
    tokens.push(match[0].toLowerCase());
  }
  // Also extract common lowercase tech names
  const known_lower =
    /\b(python|java|golang|rust|ruby|scala|kotlin|typescript|javascript|react|vue|angular|docker|kubernetes|terraform|kafka|redis|postgresql|mysql|mongodb|graphql|grpc|fastapi|django|flask|spring|node|express|fastify|next\.js|nuxt|svelte|aws|gcp|azure|helm|pulumi|datadog|prometheus|grafana|elk|splunk|jenkins|circleci)\b/gi;
  while ((match = known_lower.exec(text)) !== null) {
    const t = match[1]!.toLowerCase();
    if (!tokens.includes(t)) tokens.push(t);
  }
  return tokens;
}

function infer_claim_type(text: string): string | null {
  const lower = text.toLowerCase();
  if (/\d+\s*\+?\s*year|yoe|experience/i.test(lower)) return "duration";
  if (/\d+[xX%]|\d+\s*(?:million|billion|k\b|m\b)/i.test(lower)) return "metric";
  if (/lead|manage|mentor|coach|grow/i.test(lower)) return "leadership";
  if (/architect|design|implement|build|scale/i.test(lower)) return "technical_depth";
  if (/team\s+of\s+\d|direct\s+reports|org\s+of/i.test(lower)) return "scope";
  if (/shipped|launched|delivered|published/i.test(lower)) return "achievement";
  if (/proficien|fluent|expert|deep\s+knowledge/i.test(lower)) return "skill_usage";
  return null;
}

function text_overlap_score(a: string, b: string): number {
  const tokens_a = new Set(a.toLowerCase().split(/\s+/));
  const tokens_b = new Set(b.toLowerCase().split(/\s+/));
  let overlap = 0;
  for (const t of tokens_a) {
    if (tokens_b.has(t) && t.length > 3) overlap++;
  }
  const min_size = Math.min(tokens_a.size, tokens_b.size);
  return min_size > 0 ? overlap / min_size : 0;
}
