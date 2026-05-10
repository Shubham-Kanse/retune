import assert from "node:assert/strict";
import test from "node:test";
import { load_canonical } from "../src/canonical/loader";

test("load_canonical loads and validates seed cases", () => {
  const cases = load_canonical();
  assert.ok(cases.length >= 3, `expected at least 3 seed cases, got ${cases.length}`);
  for (const c of cases) {
    assert.ok(c.id.length > 0);
    assert.ok(
      [
        "new_grad",
        "experienced",
        "junior",
        "mid",
        "senior",
        "staff",
        "principal",
        "executive",
      ].includes(c.persona),
    );
    assert.ok(c.expert_package.experience_bullets.length >= 1);
    for (const b of c.expert_package.experience_bullets) {
      assert.ok(b.evidence_ids.length >= 1, `every bullet must have ≥1 evidence id (case ${c.id})`);
    }
  }
});

test("load_canonical includes one new_grad and one experienced case", () => {
  const cases = load_canonical();
  const personas = new Set(cases.map((c) => c.persona));
  assert.ok(personas.has("new_grad"));
  assert.ok(personas.has("experienced"));
});
