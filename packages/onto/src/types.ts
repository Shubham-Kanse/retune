/**
 * Typed surface over the canonical cognitive ontology.
 * Source of truth: ./cognitive.jsonld
 *
 * These string-literal unions are derived by hand from the JSON-LD; the test
 * `test/coverage.test.ts` asserts they stay in sync. Adding a new entity?
 * Add it to cognitive.jsonld first, then mirror here, then run tests.
 */

export type IRI =
  | `retune:${string}`
  | `uberon:${string}`
  | `chebi:${string}`
  | `go:${string}`
  | `doid:${string}`
  | `mfoem:${string}`
  | `cogpo:${string}`
  | `nlx:${string}`;

export type Layer =
  | "retune:layer.substrate"
  | "retune:layer.comprehension"
  | "retune:layer.reflection"
  | "retune:layer.strategy"
  | "retune:layer.production"
  | "retune:layer.critique"
  | "retune:layer.decision"
  | "retune:layer.crossCutting"
  | "retune:layer.meta";

export type BrainRegionId =
  | "retune:region.dlpfc"
  | "retune:region.vmpfc"
  | "retune:region.vlpfc_right"
  | "retune:region.acc"
  | "retune:region.frontopolar"
  | "retune:region.broca"
  | "retune:region.premotor"
  | "retune:region.motor"
  | "retune:region.wernicke"
  | "retune:region.angular_gyrus"
  | "retune:region.tpj_right"
  | "retune:region.sts"
  | "retune:region.temporal"
  | "retune:region.insula"
  | "retune:region.dmn"
  | "retune:region.arcuate"
  | "retune:region.cerebellum"
  | "retune:region.hippocampus"
  | "retune:region.amygdala"
  | "retune:region.nucleus_accumbens"
  | "retune:region.vta"
  | "retune:region.locus_coeruleus"
  | "retune:region.ras"
  | "retune:region.thalamus"
  | "retune:region.corpus_callosum"
  | "retune:region.ofc";

export type NetworkId =
  | "retune:network.dmn"
  | "retune:network.salience"
  | "retune:network.cen"
  | "retune:network.dan"
  | "retune:network.van";

export type CellTypeId =
  | "retune:cellType.pyramidal_projection"
  | "retune:cellType.local_excitatory"
  | "retune:cellType.local_inhibitory"
  | "retune:cellType.feedforward_inhibitory"
  | "retune:cellType.modulatory"
  | "retune:cellType.monitor"
  | "retune:cellType.gating"
  | "retune:cellType.relay";

export type GliaTypeId =
  | "retune:gliaType.astrocyte"
  | "retune:gliaType.oligodendrocyte"
  | "retune:gliaType.microglia"
  | "retune:gliaType.ependymal";

export type NeurotransmitterId =
  | "retune:nt.glutamate"
  | "retune:nt.gaba"
  | "retune:nt.dopamine"
  | "retune:nt.norepinephrine"
  | "retune:nt.serotonin"
  | "retune:nt.acetylcholine"
  | "retune:nt.mixed";

export type ThinkingComponentId =
  | "retune:thinking.perception"
  | "retune:thinking.attention"
  | "retune:thinking.workingMemory"
  | "retune:thinking.semanticMemory"
  | "retune:thinking.episodicMemory"
  | "retune:thinking.proceduralMemory"
  | "retune:thinking.categorisation"
  | "retune:thinking.problemSolving"
  | "retune:thinking.mentalSimulation"
  | "retune:thinking.reasoning"
  | "retune:thinking.planning"
  | "retune:thinking.decision"
  | "retune:thinking.production"
  | "retune:thinking.critique"
  | "retune:thinking.metacognition"
  | "retune:thinking.affect"
  | "retune:thinking.actionSelection";

export type MindsetAxisId =
  | "retune:mindset.growthFixed"
  | "retune:mindset.selfEfficacy"
  | "retune:mindset.locusOfControl"
  | "retune:mindset.goalOrientation"
  | "retune:mindset.selfImage";

export type ThoughtModeId =
  | "retune:thought.verbal"
  | "retune:thought.visual"
  | "retune:thought.conceptual"
  | "retune:thought.counterfactual"
  | "retune:thought.prospective"
  | "retune:thought.retrospective"
  | "retune:thought.selfReferential"
  | "retune:thought.otherReferential";

export type ActionClassId =
  | "retune:action.reflexive"
  | "retune:action.habitual"
  | "retune:action.goalDirected"
  | "retune:action.communicative";

export type OscillationBandId =
  | "retune:osc.delta"
  | "retune:osc.theta"
  | "retune:osc.alpha"
  | "retune:osc.gamma";

export type PlasticityMechanismId =
  | "retune:plasticity.ltp"
  | "retune:plasticity.ltd"
  | "retune:plasticity.stdp"
  | "retune:plasticity.homeostatic"
  | "retune:plasticity.consolidation";

export type PathologyModeId =
  | "retune:pathology.seizure"
  | "retune:pathology.tonicInhibition"
  | "retune:pathology.synapticLoss"
  | "retune:pathology.excitotoxicity"
  | "retune:pathology.hallucination";

export type EmotionalStateId =
  | "retune:emotion.calm"
  | "retune:emotion.engaged"
  | "retune:emotion.uncertain"
  | "retune:emotion.strained"
  | "retune:emotion.distressed";

export type SpecialistId =
  | "retune:specialist.Orchestrator"
  | "retune:specialist.BudgetController"
  | "retune:specialist.JdSpanExtractor"
  | "retune:specialist.TitleSchemaRetriever"
  | "retune:specialist.CompanySchemaRetriever"
  | "retune:specialist.DiscourseClassifier"
  | "retune:specialist.BoilerplateStripper"
  | "retune:specialist.CulturalCalibrator"
  | "retune:specialist.VoiceFingerprintExtractor"
  | "retune:specialist.HonestyCalibrator"
  | "retune:specialist.CredibilityScanner"
  | "retune:specialist.GapMapper"
  | "retune:specialist.EvidenceSolver"
  | "retune:specialist.NarrativeArcProposer"
  | "retune:specialist.SequentialBulletComposer"
  | "retune:specialist.TheoryOfMindSpecialist"
  | "retune:specialist.CriticEnsemble"
  | "retune:specialist.OutcomePredictor"
  | "retune:specialist.RefuseOrShipGate"
  | "retune:specialist.FairnessMonitor"
  | "retune:specialist.VoiceDriftMonitor"
  | "retune:specialist.WellBeingMonitor"
  | "retune:specialist.EmotionalStateModeler"
  | "retune:specialist.MoodFingerprint"
  | "retune:specialist.MotivationModulator"
  | "retune:specialist.ActiveQuestionHandler"
  | "retune:specialist.Narrator";

export interface OntologyNode {
  readonly id: IRI;
  readonly type: IRI;
  readonly label?: string;
  readonly definition?: string;
  readonly comment?: string;
  readonly exactMatch?: readonly IRI[];
  readonly closeMatch?: readonly IRI[];
  readonly broader?: IRI;
  readonly tagsRegion?: readonly BrainRegionId[];
  readonly usesNeurotransmitter?: NeurotransmitterId;
  readonly embodiesCellType?: CellTypeId;
  readonly coversThinking?: readonly ThinkingComponentId[];
  readonly participatesIn?: readonly NetworkId[];
  readonly actsAt?: Layer;
  readonly actionClass?: ActionClassId;
  readonly emitsGoal?: readonly IRI[];
  readonly emitsConflict?: readonly IRI[];
  readonly emitsEvent?: readonly IRI[];
  readonly surfacedBy?: readonly string[];
  readonly auditedBy?: readonly string[];
  readonly documentedAt?: string;
}

export interface SpecialistNode extends OntologyNode {
  readonly id: SpecialistId;
  readonly type: "retune:Class.Specialist";
  readonly actsAt: Layer;
  readonly embodiesCellType: CellTypeId;
  readonly usesNeurotransmitter: NeurotransmitterId;
  readonly tagsRegion: readonly BrainRegionId[];
  readonly actionClass: ActionClassId;
  readonly coversThinking: readonly ThinkingComponentId[];
}

export interface OntologyDocument {
  readonly "@context": Record<string, unknown>;
  readonly "@id": string;
  readonly "@type": string;
  readonly version: string;
  readonly label: string;
  readonly comment: string;
  readonly "@graph": readonly OntologyNode[];
}
