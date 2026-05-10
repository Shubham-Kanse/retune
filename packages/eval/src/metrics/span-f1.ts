/**
 * Span-level F1 metric for the extraction layer.
 *
 * Two spans match if and only if:
 *   1. Their `kind` is identical.
 *   2. Their character ranges have IoU ≥ `iou_threshold` (default 0.5).
 *
 * Returns precision, recall, F1, and counts. Used by:
 *   - `apps/ml` extraction model regression tests
 *   - the canonical eval gate in CI (PRD §15.1)
 *   - the discourse classifier evaluation
 */

export interface LabeledSpan {
  kind: string;
  char_start: number;
  char_end: number;
}

export interface SpanF1Result {
  precision: number;
  recall: number;
  f1: number;
  true_positives: number;
  false_positives: number;
  false_negatives: number;
  iou_threshold: number;
}

export function span_f1(
  predicted: readonly LabeledSpan[],
  gold: readonly LabeledSpan[],
  iou_threshold = 0.5,
): SpanF1Result {
  // Greedy 1:1 matching: for each predicted, find its best-IoU gold of the
  // same kind, and consume that gold so it can't be matched twice.
  const consumed = new Set<number>();
  let tp = 0;
  for (const pred of predicted) {
    let best_idx = -1;
    let best_iou = iou_threshold;
    for (let i = 0; i < gold.length; i++) {
      if (consumed.has(i)) continue;
      const g = gold[i];
      if (!g) continue;
      if (g.kind !== pred.kind) continue;
      const iou = compute_iou(pred, g);
      if (iou >= best_iou) {
        best_iou = iou;
        best_idx = i;
      }
    }
    if (best_idx >= 0) {
      tp++;
      consumed.add(best_idx);
    }
  }
  const fp = predicted.length - tp;
  const fn = gold.length - tp;
  const precision = predicted.length === 0 ? 1 : tp / predicted.length;
  const recall = gold.length === 0 ? 1 : tp / gold.length;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return {
    precision,
    recall,
    f1,
    true_positives: tp,
    false_positives: fp,
    false_negatives: fn,
    iou_threshold,
  };
}

function compute_iou(a: LabeledSpan, b: LabeledSpan): number {
  const start = Math.max(a.char_start, b.char_start);
  const end = Math.min(a.char_end, b.char_end);
  const intersection = Math.max(0, end - start);
  const union = Math.max(a.char_end, b.char_end) - Math.min(a.char_start, b.char_start);
  if (union === 0) return 0;
  return intersection / union;
}
