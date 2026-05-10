/**
 * Coverage proof: every primitive in the markdown taxonomies (technical-2.0.md
 * §25–§28) has a node in the ontology, every required class has at least one
 * instance, and every Specialist is fully wired.
 *
 * If a primitive is added/removed in the markdown but not the JSON-LD (or vice
 * versa), this test fails. The JSON-LD is the source of truth; markdown is a
 * derived view.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { ontology } from "../src/runtime.js";
import type { SpecialistNode } from "../src/types.js";

const EXPECTED_COUNTS = {
  specialists: 27,
  brainRegions: 26,
  networks: 5,
  cellTypes: 8,
  gliaTypes: 4,
  neurotransmitters: 7,
  thinkingComponents: 17,
  mindsetAxes: 5,
  thoughtModes: 8,
  actionClasses: 4,
  oscillationBands: 4,
  plasticityMechanisms: 5,
  pathologyModes: 5,
  emotionalStates: 5,
  layers: 9,
} as const;

test("graph counts match the markdown taxonomy completion stamp", () => {
  assert.equal(ontology.specialists().length, EXPECTED_COUNTS.specialists);
  assert.equal(ontology.brainRegions().length, EXPECTED_COUNTS.brainRegions);
  assert.equal(ontology.networks().length, EXPECTED_COUNTS.networks);
  assert.equal(ontology.cellTypes().length, EXPECTED_COUNTS.cellTypes);
  assert.equal(ontology.gliaTypes().length, EXPECTED_COUNTS.gliaTypes);
  assert.equal(ontology.neurotransmitters().length, EXPECTED_COUNTS.neurotransmitters);
  assert.equal(ontology.thinkingComponents().length, EXPECTED_COUNTS.thinkingComponents);
  assert.equal(ontology.mindsetAxes().length, EXPECTED_COUNTS.mindsetAxes);
  assert.equal(ontology.thoughtModes().length, EXPECTED_COUNTS.thoughtModes);
  assert.equal(ontology.actionClasses().length, EXPECTED_COUNTS.actionClasses);
  assert.equal(ontology.oscillationBands().length, EXPECTED_COUNTS.oscillationBands);
  assert.equal(ontology.plasticityMechanisms().length, EXPECTED_COUNTS.plasticityMechanisms);
  assert.equal(ontology.pathologyModes().length, EXPECTED_COUNTS.pathologyModes);
  assert.equal(ontology.emotionalStates().length, EXPECTED_COUNTS.emotionalStates);
  assert.equal(ontology.layers().length, EXPECTED_COUNTS.layers);
});

test("every Specialist has a complete required-property set", () => {
  const required: Array<keyof SpecialistNode> = [
    "actsAt",
    "embodiesCellType",
    "usesNeurotransmitter",
    "tagsRegion",
    "actionClass",
    "coversThinking",
  ];
  for (const s of ontology.specialists()) {
    for (const k of required) {
      assert.ok(
        s[k] !== undefined && s[k] !== null,
        `${s.id} missing required property: ${String(k)}`,
      );
    }
    assert.ok((s.tagsRegion as readonly string[]).length > 0, `${s.id} has empty tagsRegion`);
    assert.ok(
      (s.coversThinking as readonly string[]).length > 0,
      `${s.id} has empty coversThinking`,
    );
  }
});

test("every BrainRegion is referenced by at least one Specialist OR is a documented infrastructure-bridge", () => {
  // These regions are intentionally NOT linked to a registry Specialist; they
  // correspond to infrastructure (Postgres / MLClient / Temporal / API
  // response writer) per technical-2.0.md Appendix C. The markdown is the
  // contract; this test enforces no *unintended* drift.
  const infrastructureBridges = [
    "retune:region.motor", // API response writer + SSE emitter
    "retune:region.hippocampus", // PostgresPersistence (audit trail)
    "retune:region.thalamus", // MLClient (HTTP/gRPC cross-cortex transport)
    "retune:region.corpus_callosum", // tests/cross-lang-e2e (cross-lang transport)
  ].sort();
  const unlinked = [...ontology.unlinkedRegions()].sort();
  assert.deepEqual(
    unlinked,
    infrastructureBridges,
    `region coverage drifted from infrastructure-bridge contract; got: ${unlinked.join(", ")}`,
  );
});

test("every ThinkingComponent is covered by at least one Specialist OR is documented infrastructure", () => {
  // 'actionSelection' is realised by API response writer + SSE emitter +
  // apps/web route handlers per technical-2.0.md §25.1, not by a registry
  // Specialist. Same contract as the infrastructure-bridge regions above.
  const infrastructureBridges = ["retune:thinking.actionSelection"].sort();
  const unlinked = [...ontology.unlinkedThinkingComponents()].sort();
  assert.deepEqual(
    unlinked,
    infrastructureBridges,
    `thinking-component coverage drifted; got: ${unlinked.join(", ")}`,
  );
});

test("every CellType is embodied by at least one Specialist", () => {
  const unlinked = ontology.unlinkedCellTypes();
  // 'relay' has no specialist registrant; that's expected (it's an infrastructure cell type
  // realized by MLClient/Temporal, not a registry specialist). All others must be linked.
  const expectedUnlinked = ["retune:cellType.relay"];
  assert.deepEqual([...unlinked].sort(), expectedUnlinked.sort());
});

test("every Neurotransmitter is used by at least one Specialist", () => {
  const unlinked = ontology.unlinkedNeurotransmitters();
  assert.deepEqual(unlinked, [], `unlinked neurotransmitters: ${unlinked.join(", ")}`);
});

test("all canonical bio-ontology cross-refs are well-formed IRIs", () => {
  const PREFIX_RE = /^(uberon|chebi|go|doid|mfoem|cogpo|nlx):[A-Za-z0-9_/.-]+$/;
  for (const cls of [
    "retune:Class.BrainRegion",
    "retune:Class.Neurotransmitter",
    "retune:Class.PlasticityMechanism",
    "retune:Class.PathologyMode",
    "retune:Class.EmotionalState",
    "retune:Class.Network",
    "retune:Class.GliaType",
    "retune:Class.CellType",
    "retune:Class.ThinkingComponent",
  ]) {
    for (const node of ontology.nodesOfClass(cls as `retune:${string}`)) {
      for (const m of [...(node.exactMatch ?? []), ...(node.closeMatch ?? [])]) {
        assert.match(m, PREFIX_RE, `${node.id} has malformed cross-ref: ${m}`);
      }
    }
  }
});
