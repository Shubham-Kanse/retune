/**
 * Materialize derived artefacts from cognitive.jsonld into ./dist/.
 * Idempotent; produces byte-identical output for unchanged JSON-LD.
 *
 * Outputs:
 *   - dist/cognitive.cypher   Neo4j-loadable graph
 *   - dist/cognitive.json     compacted JSON-LD without @context (raw graph)
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { toCypher } from "../src/cypher.js";
import { ontology } from "../src/runtime.js";

const __filename = fileURLToPath(import.meta.url);
const here = dirname(__filename);
const dist = resolve(here, "..", "dist");
mkdirSync(dist, { recursive: true });

writeFileSync(resolve(dist, "cognitive.cypher"), toCypher(), "utf8");

const compact = {
  version: ontology.version,
  counts: {
    specialists: ontology.specialists().length,
    brainRegions: ontology.brainRegions().length,
    networks: ontology.networks().length,
    thinkingComponents: ontology.thinkingComponents().length,
    cellTypes: ontology.cellTypes().length,
    gliaTypes: ontology.gliaTypes().length,
    neurotransmitters: ontology.neurotransmitters().length,
    mindsetAxes: ontology.mindsetAxes().length,
    thoughtModes: ontology.thoughtModes().length,
    actionClasses: ontology.actionClasses().length,
    oscillationBands: ontology.oscillationBands().length,
    plasticityMechanisms: ontology.plasticityMechanisms().length,
    pathologyModes: ontology.pathologyModes().length,
    emotionalStates: ontology.emotionalStates().length,
    goalKinds: ontology.goalKinds().length,
    conflictMonitors: ontology.conflictMonitors().length,
    sseEventKinds: ontology.sseEventKinds().length,
    layers: ontology.layers().length,
  },
};
writeFileSync(resolve(dist, "summary.json"), JSON.stringify(compact, null, 2) + "\n", "utf8");

// eslint-disable-next-line no-console
console.log("[onto] built dist/cognitive.cypher and dist/summary.json");
// eslint-disable-next-line no-console
console.log(JSON.stringify(compact.counts, null, 2));
