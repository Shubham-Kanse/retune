# @retune/onto — Cognitive-Neural Knowledge Graph

**Status:** v0.1.0 — canonical source of truth for retune's cognitive and neural taxonomies.

This package replaces the prose markdown tables in `technical-2.0.md` §25–§28 and `prd-2.0.md` Appendix E as the single source of truth. The markdown is now a derived view; the graph is the spec.

## What's in the graph

| Class | Count | Cross-references |
|---|---|---|
| `Specialist` | 27 | — |
| `BrainRegion` | 26 | UBERON, NIFSTD/NeuroLex |
| `Network` | 5 | CogPO |
| `CellType` | 8 | NIFSTD |
| `GliaType` | 4 | NIFSTD |
| `Neurotransmitter` | 7 | ChEBI |
| `ThinkingComponent` | 17 | CogPO |
| `MindsetAxis` | 5 | — (theory refs in `comment`) |
| `ThoughtMode` | 8 | — |
| `ActionClass` | 4 | — |
| `OscillationBand` | 4 | — |
| `PlasticityMechanism` | 5 | GO (LTP, LTD, homeostatic) |
| `PathologyMode` | 5 | DOID, GO |
| `EmotionalState` | 5 | MFOEM (with valence × arousal) |
| `GoalKind` | 24 | — |
| `ConflictMonitor` | 13 | — |
| `SseEventKind` | 16 | — |
| `Layer` | 9 | — |

Total: ~187 nodes, ~150+ typed relationships.

## Files

- `src/cognitive.jsonld` — **the authoritative source.** Hand-edit this file to add/remove primitives. JSON-LD compacted; uses standard prefixes from OBO Foundry.
- `src/types.ts` — TypeScript string-literal unions and `OntologyNode` / `SpecialistNode` interfaces. Mirrors the JSON-LD; `test/coverage.test.ts` enforces consistency.
- `src/runtime.ts` — typed accessor with indexes (`ontology.specialists()`, `ontology.specialistsForRegion()`, etc.). No async I/O on hot path.
- `src/cypher.ts` — deterministic Cypher export for Neo4j 5.x.
- `scripts/build.ts` — materializes `dist/cognitive.cypher` and `dist/summary.json`.

## Usage

### From a specialist

```ts
import { ontology } from "@retune/onto";

const orchestrator = ontology.specialist("retune:specialist.Orchestrator");
console.log(orchestrator?.tagsRegion); // ["retune:region.dlpfc"]

// Inverse query: what fires in DLPFC?
for (const s of ontology.specialistsForRegion("retune:region.dlpfc")) {
  console.log(s.label);
}
```

### From a CI gate

```ts
import { ontology } from "@retune/onto";

test("every brain region has a specialist", () => {
  assert.deepEqual(ontology.unlinkedRegions(), []);
});
```

### Loading into Neo4j

```bash
pnpm --filter @retune/onto build
cypher-shell -f packages/onto/dist/cognitive.cypher
```

Then in Neo4j Browser:

```cypher
// What does the Salience Network do?
MATCH (n:Network {id: 'retune:network.salience'})-[:TAGS_REGION]->(r)
MATCH (s:Specialist)-[:PARTICIPATES_IN]->(n)
RETURN n, r, s;

// Which specialists are dopaminergic?
MATCH (s:Specialist)-[:USES_NEUROTRANSMITTER]->(:Neurotransmitter {label: 'dopamine'})
RETURN s.label;

// Which thinking components are uncovered?
MATCH (t:ThinkingComponent)
WHERE NOT (:Specialist)-[:COVERS_THINKING]->(t)
RETURN t.label;
```

### From the BrainHeatmap UI

```ts
import { ontology } from "@retune/onto";

export function BrainHeatmap() {
  const regions = ontology.brainRegions();
  return regions.map((r) => (
    <g key={r.id} id={r.id.replace("retune:region.", "")}>
      <title>{r.label}</title>
    </g>
  ));
}
```

## Adding a new primitive

1. Add the node to `src/cognitive.jsonld`. Pick the right class IRI (`retune:Class.X`).
2. Add cross-references to canonical bio ontologies where they exist (UBERON for anatomy, ChEBI for chemistry, GO for biological processes, DOID for diseases, MFOEM for emotions).
3. If it's a `Specialist`, ensure all required properties: `actsAt`, `embodiesCellType`, `usesNeurotransmitter`, `tagsRegion[]`, `actionClass`, `coversThinking[]`.
4. Mirror the IRI literal into `src/types.ts` (string-literal union).
5. Run `pnpm --filter @retune/onto test`.
6. Update `EXPECTED_COUNTS` in `test/coverage.test.ts`.
7. Update the count tables in `technical-2.0.md` §31 + completion stamp + `prd-2.0.md` completion stamp.

## Why JSON-LD as canonical

- **Interoperable** — any RDF tool (Apache Jena, RDF4J, Oxigraph) can read it.
- **Cross-referenceable** — `skos:closeMatch` to UBERON / ChEBI / GO / DOID / MFOEM means our cognitive taxonomy is hooked into the OBO Foundry web of biomedical knowledge.
- **Diffable** — line-oriented JSON; small PRs are easy to review.
- **Versioned** — `@version` + `dcterms:hasVersion` on the ontology root; SemVer.
- **No vendor lock** — JSON-LD is a W3C standard.

The Cypher export is *materialization*, not source of truth. Round-trip is one-way: JSON-LD → Cypher.

## Roadmap

- [ ] Add SHACL shapes (`shapes.shacl.ttl`) for formal validation.
- [ ] Add SPARQL example queries.
- [ ] Uplift the 8 recruitment ontologies in `packages/agent/assets/*.json` to JSON-LD with the same `@context`.
- [ ] Auto-publish the graph to a static SPARQL endpoint (Oxigraph) for external integrators.
- [ ] Generate an interactive HTML viewer (D3 force layout + clustered communities via Louvain).

## License

Same as the parent monorepo.
