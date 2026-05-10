/**
 * CredibilityScanner specialist.
 *
 * Mines the JD's `legal` and `boilerplate` discourse-map sentences for
 * implicit hard disqualifiers — the things recruiters bury but use as
 * filters anyway. The BoilerplateStripper kept these sentences around
 * (importance=0) precisely so this specialist can read them.
 *
 * Method (PRD §6.2.3):
 *   - Iterate sentences with function ∈ {legal, boilerplate}.
 *   - Match against a curated regex bank of common disqualifiers
 *     (clearance, citizenship, certifications, exclusivity).
 *   - Emit one disqualifier per unique matching pattern, deduped.
 *
 * Goal kind handled: `scan_credibility`.
 *
 * Writes `hypotheses.hidden_disqualifiers` (string[]) — human-readable
 * descriptions, ordered by severity (clearance > citizenship > others).
 * If the discourse_map is missing or empty, writes [] and satisfies the
 * goal so downstream specialists don't gate on it.
 *
 * @brain superior temporal sulcus + ACC: implicit-cue inference +
 * @thinking pattern_recognition
 * @cellType interneuron
 * @neurotransmitter norepinephrine
 *        contradiction detection
 */

import type { Goal, GoalKind } from "@retune/types";
import { AuditTrail } from "../../workbench/audit-trail";
import type { Specialist, SpecialistContext, SpecialistResult } from "../../workbench/types";

const HANDLES: readonly GoalKind[] = ["scan_credibility"];

interface Pattern {
  /** Severity rank — used for ordering output. Higher = more severe. */
  rank: number;
  /** Human-readable disqualifier label written to the blackboard. */
  label: string;
  re: RegExp;
}

// Ordered by rank desc — tested in order so the first match per pattern
// is sufficient (we never list the same pattern twice).
const DISQUALIFIER_PATTERNS: ReadonlyArray<Pattern> = [
  {
    rank: 100,
    label: "active US security clearance required",
    re: /active\s+(?:us|u\.s\.)?\s*(?:security|secret|top\s*secret|ts\/sci)\s*clearance/i,
  },
  {
    rank: 95,
    label: "US citizenship required",
    re: /(?:must\s+be|require[sd]?)\s+(?:a\s+)?us\s+citizen|us\s+citizenship\s+required/i,
  },
  {
    rank: 90,
    label: "work authorization without sponsorship required",
    re: /authorized\s+to\s+work\s+in\s+the\s+(?:us|united\s+states)|no\s+(?:visa\s+)?sponsorship/i,
  },
  {
    rank: 80,
    label: "industry certification required (e.g. CISSP, CPA, PE)",
    re: /\b(?:cissp|cpa|p\.e\.?|cfa|series\s*\d+|cmt|frm)\s*(?:required|certification\s+required)/i,
  },
  {
    rank: 70,
    label: "specific degree required (PhD/MD/JD)",
    re: /\b(?:ph\.?d\.?|m\.?d\.?|j\.?d\.?)\s+required/i,
  },
  {
    rank: 60,
    label: "in-office presence required (no remote)",
    re: /(?:fully\s+)?(?:on[-\s]?site|in[-\s]?office)\s+required|no\s+remote\s+work/i,
  },
  {
    rank: 55,
    label: "background check / drug screen required",
    re: /(?:background\s+check|drug\s+screen(?:ing)?)\s+(?:required|condition)/i,
  },
  {
    rank: 50,
    label: "non-compete / exclusivity clause",
    re: /non[-\s]?compete|exclusivity\s+clause|cannot\s+work\s+for\s+competitors/i,
  },
];

export class CredibilityScanner implements Specialist {
  readonly id = "credibility_scanner";
  readonly display_name = "Credibility Scanner";
  readonly brain_region = "sts_acc";
  readonly handles_goal_kinds = HANDLES;
  readonly estimated_cost_usd = 0;
  readonly estimated_latency_ms = 3;

  async run(ctx: SpecialistContext, goal: Goal): Promise<SpecialistResult> {
    const t0 = Date.now();
    const map = ctx.blackboard.hypotheses.discourse_map ?? [];

    // Mine legal + boilerplate sentences. The classifier flags these
    // explicitly; we don't re-classify here.
    const candidates = map
      .filter((s) => s.function === "legal" || s.function === "boilerplate")
      .map((s) => s.text);
    // Fall back to scanning the entire JD if no discourse_map exists
    // (e.g. when the calling caller bypassed the classifier path).
    if (candidates.length === 0) {
      const fallback = read_jd_text(goal);
      if (fallback) candidates.push(fallback);
    }

    const seen = new Set<string>();
    const hits: Array<{ rank: number; label: string }> = [];
    for (const sent of candidates) {
      for (const p of DISQUALIFIER_PATTERNS) {
        if (seen.has(p.label)) continue;
        if (p.re.test(sent)) {
          seen.add(p.label);
          hits.push({ rank: p.rank, label: p.label });
        }
      }
    }
    hits.sort((a, b) => b.rank - a.rank);
    const disqualifiers = hits.map((h) => h.label);

    return {
      writes: [{ path: "hypotheses.hidden_disqualifiers", value: disqualifiers }],
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        micro_stage: "regex_mine_legal_and_boilerplate",
        inputs_hash: AuditTrail.hash({
          n_candidates: candidates.length,
          n_legal: map.filter((s) => s.function === "legal").length,
          n_boilerplate: map.filter((s) => s.function === "boilerplate").length,
        }),
        output_hash: AuditTrail.hash({ disqualifiers }),
        justification: `surfaced ${disqualifiers.length} hidden disqualifier(s) from ${candidates.length} sentence(s)`,
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        writes: ["hypotheses.hidden_disqualifiers"],
      },
    };
  }
}

function read_jd_text(goal: Goal): string | null {
  const v = goal.payload?.jd_text;
  if (typeof v === "string" && v.trim().length > 0) return v;
  return null;
}
