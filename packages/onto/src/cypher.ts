/**
 * Deterministic Cypher export of the cognitive ontology.
 *
 * Reads ./cognitive.jsonld and emits MERGE/CREATE statements suitable for
 * Neo4j 5.x. Use:
 *
 *   import { toCypher } from "@retune/onto/cypher";
 *   const stmts = toCypher();
 *   await neo4j.session().run(stmts);
 *
 * Or pipe to a .cypher file via:
 *
 *   pnpm --filter @retune/onto build  # writes ./dist/cognitive.cypher
 *
 * Stable output: nodes ordered by id, relationships ordered by (from, type, to).
 * Re-running on unchanged JSON-LD produces byte-identical Cypher.
 */

import { ontology } from "./runtime.js";
import type { OntologyNode } from "./types.js";

function escape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function shortLabel(typeIri: string): string {
  // "retune:Class.Specialist" -> "Specialist"
  const dot = typeIri.lastIndexOf(".");
  return dot >= 0 ? typeIri.slice(dot + 1) : typeIri;
}

function nodeToCypher(n: OntologyNode): string {
  const lbl = shortLabel(n.type);
  const props: string[] = [`id: '${escape(n.id)}'`];
  if (n.label) props.push(`label: '${escape(n.label)}'`);
  if (n.definition) props.push(`definition: '${escape(n.definition)}'`);
  if (n.comment) props.push(`comment: '${escape(n.comment)}'`);
  if (n.documentedAt) props.push(`documentedAt: '${escape(n.documentedAt)}'`);
  if (n.exactMatch?.length) {
    props.push(`exactMatch: [${n.exactMatch.map((m) => `'${escape(m)}'`).join(", ")}]`);
  }
  if (n.closeMatch?.length) {
    props.push(`closeMatch: [${n.closeMatch.map((m) => `'${escape(m)}'`).join(", ")}]`);
  }
  return `MERGE (:${lbl} { ${props.join(", ")} });`;
}

function relStmt(fromId: string, type: string, toId: string): string {
  return `MATCH (a {id:'${escape(fromId)}'}), (b {id:'${escape(toId)}'}) MERGE (a)-[:${type}]->(b);`;
}

export function toCypher(): string {
  const out: string[] = [];

  out.push("// ----- nodes -----");
  const allNodes: OntologyNode[] = [];
  for (const cls of [
    "retune:Class.Layer",
    "retune:Class.BrainRegion",
    "retune:Class.Network",
    "retune:Class.CellType",
    "retune:Class.GliaType",
    "retune:Class.Neurotransmitter",
    "retune:Class.ThinkingComponent",
    "retune:Class.MindsetAxis",
    "retune:Class.ThoughtMode",
    "retune:Class.ActionClass",
    "retune:Class.OscillationBand",
    "retune:Class.PlasticityMechanism",
    "retune:Class.PathologyMode",
    "retune:Class.EmotionalState",
    "retune:Class.GoalKind",
    "retune:Class.ConflictMonitor",
    "retune:Class.SseEventKind",
    "retune:Class.Specialist",
  ] as const) {
    const list = [...ontology.nodesOfClass(cls)].sort((a, b) => a.id.localeCompare(b.id));
    for (const n of list) allNodes.push(n);
  }
  for (const n of allNodes) out.push(nodeToCypher(n));

  out.push("");
  out.push("// ----- relationships -----");
  const rels: Array<[string, string, string]> = [];
  for (const n of allNodes) {
    if (n.actsAt) rels.push([n.id, "ACTS_AT", n.actsAt]);
    if (n.embodiesCellType) rels.push([n.id, "EMBODIES_CELL_TYPE", n.embodiesCellType]);
    if (n.usesNeurotransmitter) rels.push([n.id, "USES_NEUROTRANSMITTER", n.usesNeurotransmitter]);
    if (n.actionClass) rels.push([n.id, "ACTION_CLASS", n.actionClass]);
    for (const r of n.tagsRegion ?? []) rels.push([n.id, "TAGS_REGION", r]);
    for (const t of n.coversThinking ?? []) rels.push([n.id, "COVERS_THINKING", t]);
    for (const net of n.participatesIn ?? []) rels.push([n.id, "PARTICIPATES_IN", net]);
    for (const g of n.emitsGoal ?? []) rels.push([n.id, "EMITS_GOAL", g]);
    for (const c of n.emitsConflict ?? []) rels.push([n.id, "EMITS_CONFLICT", c]);
    for (const e of n.emitsEvent ?? []) rels.push([n.id, "EMITS_EVENT", e]);
  }
  rels.sort((a, b) => {
    const k0 = a[0].localeCompare(b[0]);
    if (k0 !== 0) return k0;
    const k1 = a[1].localeCompare(b[1]);
    if (k1 !== 0) return k1;
    return a[2].localeCompare(b[2]);
  });
  for (const [from, t, to] of rels) out.push(relStmt(from, t, to));

  return out.join("\n") + "\n";
}
