/**
 * CoachPanel — 5-coach scoring rubric (PRD §17.1 / §A2).
 *
 * Each coach independently evaluates the generated package on a 0-100 scale
 * using a specialized rubric. The panel score is the trimmed mean (drop
 * highest + lowest) of the 5 scores, requiring ≥ 70 to pass.
 *
 * Coach identities (synthetic, calibrated against real $300/hr coach baselines):
 *   1. ATS Specialist — keyword density, formatting, parse-ability
 *   2. Narrative Coach — story arc coherence, progression, differentiation
 *   3. Honesty Auditor — claim verifiability, quantification quality
 *   4. Voice Analyst — authenticity, AI-detection risk, tone calibration
 *   5. Hiring Manager Proxy — would I phone-screen this candidate?
 *
 * All scoring is deterministic given the inputs — no LLM calls in the
 * eval harness (eval must be reproducible without API keys).
 */

export interface PackageForScoring {
  summary: string;
  bullets: Array<{ text: string; evidence_ids: string[] }>;
  cover_letter?: string;
  candidate_profile: string;
  job_description: string;
  market: "US" | "UK" | "EU" | "IN" | "CA" | "AU";
  role_family: string;
  verdict: "ship" | "revise" | "refuse";
  submission_confidence: number;
  interview_ready_score: number;
  ats_coverage_pct: number;
}

export interface CoachScore {
  coach_id: string;
  coach_role: string;
  score: number;
  notes: string[];
  passed: boolean;
}

export interface CoachPanelResult {
  scores: CoachScore[];
  trimmed_mean: number;
  raw_mean: number;
  panel_passed: boolean;
  gate_score: number;
  notes: string[];
}

const COACH_PASS_THRESHOLD = 70;

// ──────────── Individual coach scorers ────────────

function score_ats(pkg: PackageForScoring): CoachScore {
  const notes: string[] = [];
  let score = 100;

  // Keyword density in summary
  const jd_lower = pkg.job_description.toLowerCase();
  const summary_lower = pkg.summary.toLowerCase();
  const jd_tokens = new Set(jd_lower.split(/\W+/).filter((t) => t.length > 4));
  const matched = [...jd_tokens].filter((t) => summary_lower.includes(t)).length;
  const density = jd_tokens.size > 0 ? matched / jd_tokens.size : 0;

  if (density < 0.15) {
    score -= 20;
    notes.push(`Low JD keyword density in summary: ${(density * 100).toFixed(1)}%`);
  } else if (density < 0.25) {
    score -= 8;
    notes.push(`Moderate JD keyword density: ${(density * 100).toFixed(1)}%`);
  }

  // ATS coverage
  if (pkg.ats_coverage_pct < 60) {
    score -= 25;
    notes.push(`ATS coverage ${pkg.ats_coverage_pct.toFixed(1)}% below minimum 60%`);
  } else if (pkg.ats_coverage_pct < 75) {
    score -= 10;
    notes.push(`ATS coverage ${pkg.ats_coverage_pct.toFixed(1)}% moderate`);
  }

  // Bullet count
  if (pkg.bullets.length < 3) {
    score -= 20;
    notes.push(`Too few bullets: ${pkg.bullets.length}`);
  } else if (pkg.bullets.length > 15) {
    score -= 5;
    notes.push(`Excessive bullets: ${pkg.bullets.length} (max recommended: 15)`);
  }

  // UK market: check for British spelling signals
  if (pkg.market === "UK") {
    const uses_american = /\boptimize\b|\bcenter\b|\bcolor\b/.test(pkg.summary);
    if (uses_american) {
      score -= 8;
      notes.push("UK market: American spellings detected in summary");
    }
  }

  return {
    coach_id: "ats_specialist",
    coach_role: "ATS Specialist",
    score: Math.max(0, Math.min(100, score)),
    notes,
    passed: score >= COACH_PASS_THRESHOLD,
  };
}

function score_narrative(pkg: PackageForScoring): CoachScore {
  const notes: string[] = [];
  let score = 100;

  // Summary quality
  const word_count = pkg.summary.split(/\s+/).length;
  if (word_count < 50) {
    score -= 20;
    notes.push(`Summary too short: ${word_count} words (min: 50)`);
  } else if (word_count > 150) {
    score -= 10;
    notes.push(`Summary too long: ${word_count} words (max: 150)`);
  }

  // Banned phrases
  const banned = [
    "passionate professional",
    "proven track record",
    "results-driven",
    "dynamic",
    "motivated self-starter",
    "team player",
    "hardworking",
  ];
  const summary_lower = pkg.summary.toLowerCase();
  const cover_lower = (pkg.cover_letter ?? "").toLowerCase();
  for (const b of banned) {
    if (summary_lower.includes(b) || cover_lower.includes(b)) {
      score -= 12;
      notes.push(`Banned phrase detected: "${b}"`);
    }
  }

  // Narrative arc coherence: first bullet should be strongest
  if (pkg.bullets.length >= 2) {
    const first = pkg.bullets[0]!.text;
    const has_metric = /\d/.test(first);
    if (!has_metric) {
      score -= 8;
      notes.push("First bullet lacks quantification — lead should be strongest");
    }
  }

  // Verdict check
  if (pkg.verdict === "refuse") {
    score -= 30;
    notes.push("Package was refused by the gate — narrative insufficient");
  } else if (pkg.verdict === "revise") {
    score -= 10;
    notes.push("Package marked for revision — narrative needs strengthening");
  }

  return {
    coach_id: "narrative_coach",
    coach_role: "Narrative Coach",
    score: Math.max(0, Math.min(100, score)),
    notes,
    passed: score >= COACH_PASS_THRESHOLD,
  };
}

function score_honesty(pkg: PackageForScoring): CoachScore {
  const notes: string[] = [];
  let score = 100;

  // Check every bullet has evidence
  const ungrounded = pkg.bullets.filter((b) => b.evidence_ids.length === 0);
  if (ungrounded.length > 0) {
    score -= ungrounded.length * 15;
    notes.push(`${ungrounded.length} bullet(s) have no evidence IDs`);
  }

  // Check for suspicious superlatives without metrics
  const superlatives = /\b(best|fastest|most|largest|biggest|top-performing)\b/gi;
  for (const b of pkg.bullets) {
    const matches = b.text.match(superlatives);
    if (matches && !/\d/.test(b.text)) {
      score -= 8;
      notes.push(`Superlative without metric: "${matches[0]}" in "${b.text.slice(0, 50)}..."`);
      break; // Only penalize once
    }
  }

  // Check submission confidence is reasonable
  if (pkg.submission_confidence < 0.3 && pkg.verdict === "ship") {
    score -= 15;
    notes.push(
      `Low submission confidence (${(pkg.submission_confidence * 100).toFixed(0)}%) but shipped — possible honesty gap`,
    );
  }

  return {
    coach_id: "honesty_auditor",
    coach_role: "Honesty Auditor",
    score: Math.max(0, Math.min(100, score)),
    notes,
    passed: score >= COACH_PASS_THRESHOLD,
  };
}

function score_voice(pkg: PackageForScoring): CoachScore {
  const notes: string[] = [];
  let score = 100;

  const all_text = [pkg.summary, ...pkg.bullets.map((b) => b.text), pkg.cover_letter ?? ""].join(
    " ",
  );
  const lower = all_text.toLowerCase();

  // AI-sounding patterns
  const ai_patterns = [
    { pattern: /\bleverage\b/g, label: "leverage" },
    { pattern: /\bsynergize\b/g, label: "synergize" },
    { pattern: /\bdeliver value\b/g, label: "deliver value" },
    { pattern: /\bsolution[s]?\b/g, label: "solutions (generic)" },
    { pattern: /\bimpact(?:ful)?\b/g, label: "impactful" },
    { pattern: /\bstack\b.*\bblazar\b/g, label: "buzzword stacking" },
  ];

  let ai_count = 0;
  for (const { pattern, label } of ai_patterns) {
    const matches = lower.match(pattern);
    if (matches && matches.length > 2) {
      ai_count++;
      notes.push(`AI-sounding pattern repeated ${matches.length}×: "${label}"`);
    }
  }

  if (ai_count >= 3) {
    score -= 25;
  } else if (ai_count >= 1) {
    score -= 10;
  }

  // Check for verb repetition across bullets
  const first_words = pkg.bullets.map((b) => b.text.split(/\s+/)[0]?.toLowerCase() ?? "");
  const verb_counts = new Map<string, number>();
  for (const w of first_words) {
    verb_counts.set(w, (verb_counts.get(w) ?? 0) + 1);
  }
  const repeated_verbs = [...verb_counts.entries()].filter(([, count]) => count > 1);
  if (repeated_verbs.length > 0) {
    score -= repeated_verbs.length * 8;
    notes.push(
      `Repeated opening verbs: ${repeated_verbs.map(([v, c]) => `${v}(×${c})`).join(", ")}`,
    );
  }

  // Interview ready score proxy for voice quality
  if (pkg.interview_ready_score < 60) {
    score -= 15;
    notes.push(`Low interview-ready score: ${pkg.interview_ready_score}/100`);
  }

  return {
    coach_id: "voice_analyst",
    coach_role: "Voice Analyst",
    score: Math.max(0, Math.min(100, score)),
    notes,
    passed: score >= COACH_PASS_THRESHOLD,
  };
}

function score_hm_proxy(pkg: PackageForScoring): CoachScore {
  const notes: string[] = [];
  let score = 100;

  // Interview-ready score from the gate is the primary input
  if (pkg.interview_ready_score >= 80) {
    notes.push(`High interview-ready score: ${pkg.interview_ready_score}/100`);
  } else if (pkg.interview_ready_score >= 60) {
    score -= 10;
    notes.push(`Moderate interview-ready score: ${pkg.interview_ready_score}/100`);
  } else {
    score -= 25;
    notes.push(`Low interview-ready score: ${pkg.interview_ready_score}/100`);
  }

  // Submission confidence from gate
  if (pkg.submission_confidence < 0.4) {
    score -= 20;
    notes.push(`Low submission confidence: ${(pkg.submission_confidence * 100).toFixed(0)}%`);
  } else if (pkg.submission_confidence < 0.6) {
    score -= 8;
    notes.push(`Moderate submission confidence: ${(pkg.submission_confidence * 100).toFixed(0)}%`);
  }

  // Role-family calibration: senior roles need stronger seniority signals
  if (["backend_swe", "ml_engineering", "data_engineering"].includes(pkg.role_family)) {
    const has_system_scale = pkg.bullets.some((b) =>
      /\d+[kKmMbB]?\s*(users|req|daily|MAU|DAU)/i.test(b.text),
    );
    if (!has_system_scale) {
      score -= 10;
      notes.push("No system-scale signal in bullets (users, requests/day, etc.)");
    }
  }

  // Verdict must be ship for HM consideration
  if (pkg.verdict === "refuse") {
    score -= 35;
    notes.push("Package was refused — would not forward to HM");
  } else if (pkg.verdict === "revise") {
    score -= 15;
    notes.push("Package marked for revision — borderline candidate");
  }

  return {
    coach_id: "hm_proxy",
    coach_role: "Hiring Manager Proxy",
    score: Math.max(0, Math.min(100, score)),
    notes,
    passed: score >= COACH_PASS_THRESHOLD,
  };
}

// ──────────── Panel aggregator ────────────

export function score_coach_panel(pkg: PackageForScoring): CoachPanelResult {
  const scores: CoachScore[] = [
    score_ats(pkg),
    score_narrative(pkg),
    score_honesty(pkg),
    score_voice(pkg),
    score_hm_proxy(pkg),
  ];

  const raw_values = scores.map((s) => s.score);
  const raw_mean = raw_values.reduce((a, b) => a + b, 0) / raw_values.length;

  // Trimmed mean: drop highest and lowest
  const sorted = [...raw_values].sort((a, b) => a - b);
  const trimmed = sorted.slice(1, -1);
  const trimmed_mean = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;

  const panel_passed = trimmed_mean >= COACH_PASS_THRESHOLD;

  // Collect all notes
  const all_notes = scores.flatMap((s) => s.notes.map((n) => `[${s.coach_role}] ${n}`));

  return {
    scores,
    trimmed_mean,
    raw_mean,
    panel_passed,
    gate_score: trimmed_mean,
    notes: all_notes,
  };
}
