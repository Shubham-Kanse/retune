/**
 * Runtime accessor over the cognitive ontology.
 *
 * Loads ./cognitive.jsonld as the authoritative source, builds typed indexes
 * (by id, by class, by relation), and exposes typed queries for downstream
 * code (specialist registry, BrainHeatmap, CI gates).
 *
 * Design: read-once at module init, immutable snapshots. No async I/O on the
 * hot path. The JSON-LD file is bundled with the package.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  BrainRegionId,
  CellTypeId,
  IRI,
  Layer,
  NetworkId,
  NeurotransmitterId,
  OntologyDocument,
  OntologyNode,
  SpecialistId,
  SpecialistNode,
  ThinkingComponentId,
} from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const raw = readFileSync(resolve(__dirname, "cognitive.jsonld"), "utf8");
const doc: OntologyDocument = JSON.parse(raw) as OntologyDocument;

const byId = new Map<IRI, OntologyNode>();
const byClass = new Map<IRI, OntologyNode[]>();

for (const node of doc["@graph"]) {
  byId.set(node.id, node);
  const cls = node.type;
  const list = byClass.get(cls) ?? [];
  list.push(node);
  byClass.set(cls, list);
}

export const ontology = {
  version: doc.version,

  node(id: IRI): OntologyNode | undefined {
    return byId.get(id);
  },

  nodesOfClass(cls: IRI): readonly OntologyNode[] {
    return byClass.get(cls) ?? [];
  },

  specialists(): readonly SpecialistNode[] {
    return (byClass.get("retune:Class.Specialist") ??
      []) as readonly OntologyNode[] as readonly SpecialistNode[];
  },

  specialist(id: SpecialistId): SpecialistNode | undefined {
    return byId.get(id) as OntologyNode | undefined as SpecialistNode | undefined;
  },

  brainRegions(): readonly OntologyNode[] {
    return byClass.get("retune:Class.BrainRegion") ?? [];
  },

  networks(): readonly OntologyNode[] {
    return byClass.get("retune:Class.Network") ?? [];
  },

  thinkingComponents(): readonly OntologyNode[] {
    return byClass.get("retune:Class.ThinkingComponent") ?? [];
  },

  cellTypes(): readonly OntologyNode[] {
    return byClass.get("retune:Class.CellType") ?? [];
  },

  gliaTypes(): readonly OntologyNode[] {
    return byClass.get("retune:Class.GliaType") ?? [];
  },

  neurotransmitters(): readonly OntologyNode[] {
    return byClass.get("retune:Class.Neurotransmitter") ?? [];
  },

  mindsetAxes(): readonly OntologyNode[] {
    return byClass.get("retune:Class.MindsetAxis") ?? [];
  },

  thoughtModes(): readonly OntologyNode[] {
    return byClass.get("retune:Class.ThoughtMode") ?? [];
  },

  actionClasses(): readonly OntologyNode[] {
    return byClass.get("retune:Class.ActionClass") ?? [];
  },

  oscillationBands(): readonly OntologyNode[] {
    return byClass.get("retune:Class.OscillationBand") ?? [];
  },

  plasticityMechanisms(): readonly OntologyNode[] {
    return byClass.get("retune:Class.PlasticityMechanism") ?? [];
  },

  pathologyModes(): readonly OntologyNode[] {
    return byClass.get("retune:Class.PathologyMode") ?? [];
  },

  emotionalStates(): readonly OntologyNode[] {
    return byClass.get("retune:Class.EmotionalState") ?? [];
  },

  goalKinds(): readonly OntologyNode[] {
    return byClass.get("retune:Class.GoalKind") ?? [];
  },

  conflictMonitors(): readonly OntologyNode[] {
    return byClass.get("retune:Class.ConflictMonitor") ?? [];
  },

  sseEventKinds(): readonly OntologyNode[] {
    return byClass.get("retune:Class.SseEventKind") ?? [];
  },

  layers(): readonly OntologyNode[] {
    return byClass.get("retune:Class.Layer") ?? [];
  },

  /**
   * Inverse query: "which specialists tag this brain region?"
   */
  specialistsForRegion(region: BrainRegionId): readonly SpecialistNode[] {
    return ontology.specialists().filter((s) => s.tagsRegion.includes(region));
  },

  /**
   * Inverse query: "which specialists cover this thinking component?"
   */
  specialistsForThinking(t: ThinkingComponentId): readonly SpecialistNode[] {
    return ontology.specialists().filter((s) => s.coversThinking.includes(t));
  },

  /**
   * Inverse query: "which specialists embody this cell type?"
   */
  specialistsForCellType(c: CellTypeId): readonly SpecialistNode[] {
    return ontology.specialists().filter((s) => s.embodiesCellType === c);
  },

  /**
   * Inverse query: "which specialists use this neurotransmitter?"
   */
  specialistsForNeurotransmitter(n: NeurotransmitterId): readonly SpecialistNode[] {
    return ontology.specialists().filter((s) => s.usesNeurotransmitter === n);
  },

  /**
   * Inverse query: "which specialists participate in this functional network?"
   */
  specialistsInNetwork(n: NetworkId): readonly SpecialistNode[] {
    return ontology.specialists().filter((s) => (s.participatesIn ?? []).includes(n));
  },

  /**
   * Inverse query: "which specialists belong to this layer?"
   */
  specialistsAtLayer(l: Layer): readonly SpecialistNode[] {
    return ontology.specialists().filter((s) => s.actsAt === l);
  },

  /**
   * Coverage check: every X has at least one specialist linked.
   * Returns the list of un-linked node ids (empty = healthy).
   */
  unlinkedRegions(): readonly BrainRegionId[] {
    return ontology
      .brainRegions()
      .map((r) => r.id as BrainRegionId)
      .filter((rid) => ontology.specialistsForRegion(rid).length === 0);
  },

  unlinkedThinkingComponents(): readonly ThinkingComponentId[] {
    return ontology
      .thinkingComponents()
      .map((t) => t.id as ThinkingComponentId)
      .filter((tid) => ontology.specialistsForThinking(tid).length === 0);
  },

  unlinkedCellTypes(): readonly CellTypeId[] {
    return ontology
      .cellTypes()
      .map((c) => c.id as CellTypeId)
      .filter((cid) => ontology.specialistsForCellType(cid).length === 0);
  },

  unlinkedNeurotransmitters(): readonly NeurotransmitterId[] {
    return ontology
      .neurotransmitters()
      .map((n) => n.id as NeurotransmitterId)
      .filter((nid) => ontology.specialistsForNeurotransmitter(nid).length === 0);
  },
} as const;

export type Ontology = typeof ontology;
