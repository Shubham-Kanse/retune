/**
 * Canonical voice-fingerprint module (technical-2.0 §11).
 *
 * Single source of truth for the 128-dim stylometric fingerprint used by
 * both `VoiceFingerprintExtractor` (which builds the user's baseline from
 * profile docs) and `VoiceDriftMonitor` (which scores each generated
 * bullet against that baseline).
 *
 * Before v2.0, both modules computed their own fingerprint with subtly
 * different word lists (alphabetical Mosteller-Wallace vs frequency-ordered
 * 65-word list). Cosine comparisons were semantically meaningless because
 * the dimensions were not aligned.
 *
 * @brain Broca's area + arcuate fasciculus: writing-style imprint
 */

// ──────────── Constants ────────────

export const VOICE_FINGERPRINT_DIM = 128;

/**
 * Canonical 64-word function-word list (Mosteller-Wallace order, alphabetical).
 * Frozen for the lifetime of the schema — adding/removing/reordering words
 * is a breaking change to every persisted `voice_centroids` row.
 *
 * Index `i ∈ [0, 64)` maps to `FUNCTION_WORDS_64[i]` and is the i-th
 * dimension of the resulting fingerprint.
 */
export const FUNCTION_WORDS_64: readonly string[] = [
  "a",
  "all",
  "also",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "been",
  "but",
  "by",
  "can",
  "do",
  "down",
  "even",
  "every",
  "for",
  "from",
  "had",
  "has",
  "have",
  "her",
  "his",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "may",
  "more",
  "must",
  "my",
  "no",
  "not",
  "now",
  "of",
  "on",
  "one",
  "only",
  "or",
  "our",
  "shall",
  "should",
  "so",
  "some",
  "such",
  "than",
  "that",
  "the",
  "their",
  "then",
  "there",
  "things",
  "this",
  "to",
  "up",
  "upon",
  "was",
  "were",
  "what",
  "when",
];

export const COORDINATORS: ReadonlySet<string> = new Set(["and", "but", "or", "nor", "so", "yet"]);

export const CONNECTORS: ReadonlySet<string> = new Set([
  "however",
  "therefore",
  "moreover",
  "furthermore",
  "nevertheless",
  "consequently",
  "additionally",
  "meanwhile",
]);

export const INTENSIFIERS: ReadonlySet<string> = new Set([
  "very",
  "extremely",
  "highly",
  "deeply",
  "tremendously",
  "remarkably",
  "incredibly",
  "exceptionally",
]);

export const HEDGES: ReadonlySet<string> = new Set([
  "might",
  "could",
  "perhaps",
  "possibly",
  "somewhat",
  "rather",
  "seemingly",
  "presumably",
]);

// ──────────── Public API ────────────

/**
 * Compute a deterministic 128-dim L2-normalised stylometric fingerprint.
 *
 * Layout (frozen — see technical-2.0 §11.2):
 *   0..63    function-word relative frequencies (FUNCTION_WORDS_64[i])
 *   64..95   sentence-length stats × 4 transforms (8 stats × 4)
 *   96..111  cohesion-marker densities × 4 transforms (4 markers × 4)
 *   112..127 lexical-richness signals × 4 transforms (4 metrics × 4)
 */
export function compute_fingerprint(text: string): number[] {
  const tokens = tokenize(text);
  const sentences = split_sentences(text);
  if (tokens.length === 0) return new Array<number>(VOICE_FINGERPRINT_DIM).fill(0);

  const out = new Array<number>(VOICE_FINGERPRINT_DIM).fill(0);

  // 0..63 — function-word relative frequencies.
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  for (let i = 0; i < FUNCTION_WORDS_64.length; i++) {
    const fw = FUNCTION_WORDS_64[i];
    if (!fw) continue;
    out[i] = (counts.get(fw) ?? 0) / tokens.length;
  }

  // 64..95 — sentence-length distribution (8 stats × 4 transforms).
  const lens = sentences.map((s) => tokenize(s).length).filter((n) => n > 0);
  const stats = sentence_length_stats(lens);
  for (let i = 0; i < 8; i++) {
    const s = stats[i] ?? 0;
    out[64 + i * 4 + 0] = s;
    out[64 + i * 4 + 1] = s * s;
    out[64 + i * 4 + 2] = Math.log1p(Math.max(0, s));
    out[64 + i * 4 + 3] = Math.sqrt(Math.max(0, s));
  }

  // 96..111 — cohesion-marker densities (4 markers × 4 derived).
  const per_1000 = (n: number) => (1000 * n) / tokens.length;
  const counts_set = (s: ReadonlySet<string>) =>
    tokens.reduce((acc, t) => acc + (s.has(t) ? 1 : 0), 0);
  const marker_counts = [
    counts_set(COORDINATORS),
    counts_set(CONNECTORS),
    counts_set(INTENSIFIERS),
    counts_set(HEDGES),
  ];
  for (let i = 0; i < 4; i++) {
    const c = marker_counts[i] ?? 0;
    const dens = per_1000(c);
    out[96 + i * 4 + 0] = dens;
    out[96 + i * 4 + 1] = Math.log1p(dens);
    out[96 + i * 4 + 2] = sentences.length > 0 ? c / sentences.length : 0;
    out[96 + i * 4 + 3] = c / Math.sqrt(tokens.length);
  }

  // 112..127 — lexical-richness signals (4 metrics × 4 derived).
  const types = new Set(tokens).size;
  const ttr = types / tokens.length;
  const hapax_count = [...counts.values()].filter((c) => c === 1).length;
  const hapax_ratio = hapax_count / tokens.length;
  const avg_token_len = tokens.reduce((acc, t) => acc + t.length, 0) / tokens.length;
  const cap_rate = capitalization_rate(text);
  const richness = [ttr, hapax_ratio, avg_token_len, cap_rate];
  for (let i = 0; i < 4; i++) {
    const r = richness[i] ?? 0;
    out[112 + i * 4 + 0] = r;
    out[112 + i * 4 + 1] = r * r;
    out[112 + i * 4 + 2] = Math.log1p(Math.max(0, r));
    out[112 + i * 4 + 3] = Math.sqrt(Math.max(0, r));
  }

  return l2_normalize(out);
}

/** Cosine similarity in [-1, 1]. Returns 0 when either input is the zero vector. */
export function voice_drift_cosine(a: ReadonlyArray<number>, b: ReadonlyArray<number>): number {
  const dim = Math.min(a.length, b.length);
  let dot = 0;
  let norm_a = 0;
  let norm_b = 0;
  for (let i = 0; i < dim; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    norm_a += ai * ai;
    norm_b += bi * bi;
  }
  const denom = Math.sqrt(norm_a) * Math.sqrt(norm_b);
  return denom > 0 ? dot / denom : 0;
}

// ──────────── Internal helpers ────────────

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z']+/g) ?? []).filter(Boolean);
}

export function split_sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function sentence_length_stats(lens: number[]): number[] {
  if (lens.length === 0) return [0, 0, 0, 0, 0, 0, 0, 0];
  const sorted = [...lens].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / sorted.length;
  const variance = sorted.reduce((acc, n) => acc + (n - mean) * (n - mean), 0) / sorted.length;
  const std = Math.sqrt(variance);
  const pct = (q: number): number => {
    const idx = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
    return sorted[idx] ?? 0;
  };
  return [mean, std, pct(0.1), pct(0.25), pct(0.5), pct(0.75), pct(0.9), sorted.length];
}

function capitalization_rate(text: string): number {
  let upper = 0;
  let alpha = 0;
  for (const ch of text) {
    if (/[A-Za-z]/.test(ch)) {
      alpha++;
      if (/[A-Z]/.test(ch)) upper++;
    }
  }
  return alpha === 0 ? 0 : upper / alpha;
}

export function l2_norm(v: ReadonlyArray<number>): number {
  let s = 0;
  for (const x of v) s += x * x;
  return Math.sqrt(s);
}

function l2_normalize(v: number[]): number[] {
  const n = l2_norm(v);
  if (n === 0) return v;
  return v.map((x) => x / n);
}
