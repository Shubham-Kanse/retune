import assert from "node:assert/strict";
import test from "node:test";
import { span_f1, voice_drift_cosine } from "../src/metrics";

test("span_f1: perfect match → f1=1", () => {
  const spans = [
    { kind: "skill", char_start: 0, char_end: 8 },
    { kind: "metric", char_start: 10, char_end: 16 },
  ];
  const r = span_f1(spans, spans);
  assert.equal(r.f1, 1);
  assert.equal(r.precision, 1);
  assert.equal(r.recall, 1);
});

test("span_f1: kind mismatch → no credit", () => {
  const pred = [{ kind: "skill", char_start: 0, char_end: 8 }];
  const gold = [{ kind: "tool", char_start: 0, char_end: 8 }];
  const r = span_f1(pred, gold);
  assert.equal(r.true_positives, 0);
  assert.equal(r.f1, 0);
});

test("span_f1: low IoU → no match", () => {
  const pred = [{ kind: "skill", char_start: 0, char_end: 4 }];
  const gold = [{ kind: "skill", char_start: 5, char_end: 10 }];
  const r = span_f1(pred, gold, 0.5);
  assert.equal(r.true_positives, 0);
});

test("span_f1: greedy 1:1 — second prediction can't reuse first gold", () => {
  const pred = [
    { kind: "skill", char_start: 0, char_end: 8 },
    { kind: "skill", char_start: 0, char_end: 8 },
  ];
  const gold = [{ kind: "skill", char_start: 0, char_end: 8 }];
  const r = span_f1(pred, gold);
  assert.equal(r.true_positives, 1);
  assert.equal(r.false_positives, 1);
  assert.equal(r.false_negatives, 0);
});

test("voice_drift_cosine: identical vectors → 1.0", () => {
  const v = [1, 2, 3, 4];
  assert.ok(Math.abs(voice_drift_cosine(v, v) - 1) < 1e-9);
});

test("voice_drift_cosine: orthogonal vectors → 0.0", () => {
  const a = [1, 0, 0, 0];
  const b = [0, 1, 0, 0];
  assert.equal(voice_drift_cosine(a, b), 0);
});

test("voice_drift_cosine: dim mismatch throws", () => {
  assert.throws(() => voice_drift_cosine([1, 2], [1, 2, 3]));
});
