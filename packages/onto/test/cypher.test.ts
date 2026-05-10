/**
 * The Cypher export must be deterministic (byte-identical on re-run) and
 * include exactly the right number of node and relationship statements.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { toCypher } from "../src/cypher.js";
import { ontology } from "../src/runtime.js";

test("Cypher export is deterministic", () => {
  const a = toCypher();
  const b = toCypher();
  assert.equal(a, b);
});

test("Cypher node count equals total graph node count", () => {
  const out = toCypher();
  const merges = out.match(/^MERGE \(:/gm) ?? [];
  // every entity node generates exactly one MERGE (:Label { ... })
  const expected =
    ontology.layers().length +
    ontology.brainRegions().length +
    ontology.networks().length +
    ontology.cellTypes().length +
    ontology.gliaTypes().length +
    ontology.neurotransmitters().length +
    ontology.thinkingComponents().length +
    ontology.mindsetAxes().length +
    ontology.thoughtModes().length +
    ontology.actionClasses().length +
    ontology.oscillationBands().length +
    ontology.plasticityMechanisms().length +
    ontology.pathologyModes().length +
    ontology.emotionalStates().length +
    ontology.goalKinds().length +
    ontology.conflictMonitors().length +
    ontology.sseEventKinds().length +
    ontology.specialists().length;
  assert.equal(merges.length, expected);
});

test("Cypher contains exactly one ACTS_AT relationship per Specialist", () => {
  const out = toCypher();
  const acts = out.match(/MERGE \(a\)-\[:ACTS_AT\]/g) ?? [];
  // 27 specialists, all with actsAt
  assert.equal(acts.length, ontology.specialists().length);
});
