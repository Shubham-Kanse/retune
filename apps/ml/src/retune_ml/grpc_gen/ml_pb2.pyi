from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class Confidence(_message.Message):
    __slots__ = ("point", "lower", "upper", "coverage")
    POINT_FIELD_NUMBER: _ClassVar[int]
    LOWER_FIELD_NUMBER: _ClassVar[int]
    UPPER_FIELD_NUMBER: _ClassVar[int]
    COVERAGE_FIELD_NUMBER: _ClassVar[int]
    point: float
    lower: float
    upper: float
    coverage: float
    def __init__(self, point: _Optional[float] = ..., lower: _Optional[float] = ..., upper: _Optional[float] = ..., coverage: _Optional[float] = ...) -> None: ...

class Span(_message.Message):
    __slots__ = ("id", "kind", "text", "char_start", "char_end", "confidence", "embedding", "payload_json")
    ID_FIELD_NUMBER: _ClassVar[int]
    KIND_FIELD_NUMBER: _ClassVar[int]
    TEXT_FIELD_NUMBER: _ClassVar[int]
    CHAR_START_FIELD_NUMBER: _ClassVar[int]
    CHAR_END_FIELD_NUMBER: _ClassVar[int]
    CONFIDENCE_FIELD_NUMBER: _ClassVar[int]
    EMBEDDING_FIELD_NUMBER: _ClassVar[int]
    PAYLOAD_JSON_FIELD_NUMBER: _ClassVar[int]
    id: str
    kind: str
    text: str
    char_start: int
    char_end: int
    confidence: Confidence
    embedding: bytes
    payload_json: str
    def __init__(self, id: _Optional[str] = ..., kind: _Optional[str] = ..., text: _Optional[str] = ..., char_start: _Optional[int] = ..., char_end: _Optional[int] = ..., confidence: _Optional[_Union[Confidence, _Mapping]] = ..., embedding: _Optional[bytes] = ..., payload_json: _Optional[str] = ...) -> None: ...

class HealthRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class HealthResponse(_message.Message):
    __slots__ = ("status", "service", "version", "uptime_seconds", "models_loaded")
    STATUS_FIELD_NUMBER: _ClassVar[int]
    SERVICE_FIELD_NUMBER: _ClassVar[int]
    VERSION_FIELD_NUMBER: _ClassVar[int]
    UPTIME_SECONDS_FIELD_NUMBER: _ClassVar[int]
    MODELS_LOADED_FIELD_NUMBER: _ClassVar[int]
    status: str
    service: str
    version: str
    uptime_seconds: float
    models_loaded: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, status: _Optional[str] = ..., service: _Optional[str] = ..., version: _Optional[str] = ..., uptime_seconds: _Optional[float] = ..., models_loaded: _Optional[_Iterable[str]] = ...) -> None: ...

class EmbedRequest(_message.Message):
    __slots__ = ("texts", "model", "max_tokens")
    TEXTS_FIELD_NUMBER: _ClassVar[int]
    MODEL_FIELD_NUMBER: _ClassVar[int]
    MAX_TOKENS_FIELD_NUMBER: _ClassVar[int]
    texts: _containers.RepeatedScalarFieldContainer[str]
    model: str
    max_tokens: int
    def __init__(self, texts: _Optional[_Iterable[str]] = ..., model: _Optional[str] = ..., max_tokens: _Optional[int] = ...) -> None: ...

class EmbedResponse(_message.Message):
    __slots__ = ("embeddings", "model_version", "latency_ms")
    EMBEDDINGS_FIELD_NUMBER: _ClassVar[int]
    MODEL_VERSION_FIELD_NUMBER: _ClassVar[int]
    LATENCY_MS_FIELD_NUMBER: _ClassVar[int]
    embeddings: _containers.RepeatedScalarFieldContainer[bytes]
    model_version: str
    latency_ms: float
    def __init__(self, embeddings: _Optional[_Iterable[bytes]] = ..., model_version: _Optional[str] = ..., latency_ms: _Optional[float] = ...) -> None: ...

class ExtractSpansRequest(_message.Message):
    __slots__ = ("text", "source_doc_kind", "span_kinds")
    TEXT_FIELD_NUMBER: _ClassVar[int]
    SOURCE_DOC_KIND_FIELD_NUMBER: _ClassVar[int]
    SPAN_KINDS_FIELD_NUMBER: _ClassVar[int]
    text: str
    source_doc_kind: str
    span_kinds: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, text: _Optional[str] = ..., source_doc_kind: _Optional[str] = ..., span_kinds: _Optional[_Iterable[str]] = ...) -> None: ...

class ExtractSpansResponse(_message.Message):
    __slots__ = ("spans", "model_version", "latency_ms")
    SPANS_FIELD_NUMBER: _ClassVar[int]
    MODEL_VERSION_FIELD_NUMBER: _ClassVar[int]
    LATENCY_MS_FIELD_NUMBER: _ClassVar[int]
    spans: _containers.RepeatedCompositeFieldContainer[Span]
    model_version: str
    latency_ms: float
    def __init__(self, spans: _Optional[_Iterable[_Union[Span, _Mapping]]] = ..., model_version: _Optional[str] = ..., latency_ms: _Optional[float] = ...) -> None: ...

class ClassifyDiscourseRequest(_message.Message):
    __slots__ = ("jd_text",)
    JD_TEXT_FIELD_NUMBER: _ClassVar[int]
    jd_text: str
    def __init__(self, jd_text: _Optional[str] = ...) -> None: ...

class DiscourseLabeledSentence(_message.Message):
    __slots__ = ("sentence_index", "text", "function", "function_logits", "importance")
    SENTENCE_INDEX_FIELD_NUMBER: _ClassVar[int]
    TEXT_FIELD_NUMBER: _ClassVar[int]
    FUNCTION_FIELD_NUMBER: _ClassVar[int]
    FUNCTION_LOGITS_FIELD_NUMBER: _ClassVar[int]
    IMPORTANCE_FIELD_NUMBER: _ClassVar[int]
    sentence_index: int
    text: str
    function: str
    function_logits: _containers.RepeatedScalarFieldContainer[float]
    importance: float
    def __init__(self, sentence_index: _Optional[int] = ..., text: _Optional[str] = ..., function: _Optional[str] = ..., function_logits: _Optional[_Iterable[float]] = ..., importance: _Optional[float] = ...) -> None: ...

class ClassifyDiscourseResponse(_message.Message):
    __slots__ = ("sentences", "model_version", "latency_ms")
    SENTENCES_FIELD_NUMBER: _ClassVar[int]
    MODEL_VERSION_FIELD_NUMBER: _ClassVar[int]
    LATENCY_MS_FIELD_NUMBER: _ClassVar[int]
    sentences: _containers.RepeatedCompositeFieldContainer[DiscourseLabeledSentence]
    model_version: str
    latency_ms: float
    def __init__(self, sentences: _Optional[_Iterable[_Union[DiscourseLabeledSentence, _Mapping]]] = ..., model_version: _Optional[str] = ..., latency_ms: _Optional[float] = ...) -> None: ...

class NLIRequest(_message.Message):
    __slots__ = ("premise", "hypothesis")
    PREMISE_FIELD_NUMBER: _ClassVar[int]
    HYPOTHESIS_FIELD_NUMBER: _ClassVar[int]
    premise: str
    hypothesis: str
    def __init__(self, premise: _Optional[str] = ..., hypothesis: _Optional[str] = ...) -> None: ...

class NLIResponse(_message.Message):
    __slots__ = ("label", "entailment_prob", "neutral_prob", "contradiction_prob", "model_version")
    LABEL_FIELD_NUMBER: _ClassVar[int]
    ENTAILMENT_PROB_FIELD_NUMBER: _ClassVar[int]
    NEUTRAL_PROB_FIELD_NUMBER: _ClassVar[int]
    CONTRADICTION_PROB_FIELD_NUMBER: _ClassVar[int]
    MODEL_VERSION_FIELD_NUMBER: _ClassVar[int]
    label: str
    entailment_prob: float
    neutral_prob: float
    contradiction_prob: float
    model_version: str
    def __init__(self, label: _Optional[str] = ..., entailment_prob: _Optional[float] = ..., neutral_prob: _Optional[float] = ..., contradiction_prob: _Optional[float] = ..., model_version: _Optional[str] = ...) -> None: ...

class ReaderSimRequest(_message.Message):
    __slots__ = ("bullet_text", "role_family", "prefix_token_budget")
    BULLET_TEXT_FIELD_NUMBER: _ClassVar[int]
    ROLE_FAMILY_FIELD_NUMBER: _ClassVar[int]
    PREFIX_TOKEN_BUDGET_FIELD_NUMBER: _ClassVar[int]
    bullet_text: str
    role_family: str
    prefix_token_budget: int
    def __init__(self, bullet_text: _Optional[str] = ..., role_family: _Optional[str] = ..., prefix_token_budget: _Optional[int] = ...) -> None: ...

class ReaderSimResponse(_message.Message):
    __slots__ = ("predicted_takeaway", "confidence", "model_version")
    PREDICTED_TAKEAWAY_FIELD_NUMBER: _ClassVar[int]
    CONFIDENCE_FIELD_NUMBER: _ClassVar[int]
    MODEL_VERSION_FIELD_NUMBER: _ClassVar[int]
    predicted_takeaway: str
    confidence: float
    model_version: str
    def __init__(self, predicted_takeaway: _Optional[str] = ..., confidence: _Optional[float] = ..., model_version: _Optional[str] = ...) -> None: ...

class ProposeArcsRequest(_message.Message):
    __slots__ = ("blackboard_snapshot_json", "k_candidates")
    BLACKBOARD_SNAPSHOT_JSON_FIELD_NUMBER: _ClassVar[int]
    K_CANDIDATES_FIELD_NUMBER: _ClassVar[int]
    blackboard_snapshot_json: str
    k_candidates: int
    def __init__(self, blackboard_snapshot_json: _Optional[str] = ..., k_candidates: _Optional[int] = ...) -> None: ...

class ArcCandidate(_message.Message):
    __slots__ = ("archetype", "thesis", "lead_evidence_span_ids", "feasibility")
    ARCHETYPE_FIELD_NUMBER: _ClassVar[int]
    THESIS_FIELD_NUMBER: _ClassVar[int]
    LEAD_EVIDENCE_SPAN_IDS_FIELD_NUMBER: _ClassVar[int]
    FEASIBILITY_FIELD_NUMBER: _ClassVar[int]
    archetype: str
    thesis: str
    lead_evidence_span_ids: _containers.RepeatedScalarFieldContainer[str]
    feasibility: Confidence
    def __init__(self, archetype: _Optional[str] = ..., thesis: _Optional[str] = ..., lead_evidence_span_ids: _Optional[_Iterable[str]] = ..., feasibility: _Optional[_Union[Confidence, _Mapping]] = ...) -> None: ...

class ProposeArcsResponse(_message.Message):
    __slots__ = ("candidates", "model_version")
    CANDIDATES_FIELD_NUMBER: _ClassVar[int]
    MODEL_VERSION_FIELD_NUMBER: _ClassVar[int]
    candidates: _containers.RepeatedCompositeFieldContainer[ArcCandidate]
    model_version: str
    def __init__(self, candidates: _Optional[_Iterable[_Union[ArcCandidate, _Mapping]]] = ..., model_version: _Optional[str] = ...) -> None: ...

class Requirement(_message.Message):
    __slots__ = ("id", "text", "group", "weight", "must_have")
    ID_FIELD_NUMBER: _ClassVar[int]
    TEXT_FIELD_NUMBER: _ClassVar[int]
    GROUP_FIELD_NUMBER: _ClassVar[int]
    WEIGHT_FIELD_NUMBER: _ClassVar[int]
    MUST_HAVE_FIELD_NUMBER: _ClassVar[int]
    id: str
    text: str
    group: str
    weight: float
    must_have: bool
    def __init__(self, id: _Optional[str] = ..., text: _Optional[str] = ..., group: _Optional[str] = ..., weight: _Optional[float] = ..., must_have: bool = ...) -> None: ...

class EvidenceCandidate(_message.Message):
    __slots__ = ("span_id", "covers_requirement_ids", "confidence", "recency", "arc_alignment")
    SPAN_ID_FIELD_NUMBER: _ClassVar[int]
    COVERS_REQUIREMENT_IDS_FIELD_NUMBER: _ClassVar[int]
    CONFIDENCE_FIELD_NUMBER: _ClassVar[int]
    RECENCY_FIELD_NUMBER: _ClassVar[int]
    ARC_ALIGNMENT_FIELD_NUMBER: _ClassVar[int]
    span_id: str
    covers_requirement_ids: _containers.RepeatedScalarFieldContainer[str]
    confidence: float
    recency: float
    arc_alignment: float
    def __init__(self, span_id: _Optional[str] = ..., covers_requirement_ids: _Optional[_Iterable[str]] = ..., confidence: _Optional[float] = ..., recency: _Optional[float] = ..., arc_alignment: _Optional[float] = ...) -> None: ...

class SolveEvidenceRequest(_message.Message):
    __slots__ = ("requirements", "candidates", "length_budget_bullets", "narrative_arc_archetype")
    REQUIREMENTS_FIELD_NUMBER: _ClassVar[int]
    CANDIDATES_FIELD_NUMBER: _ClassVar[int]
    LENGTH_BUDGET_BULLETS_FIELD_NUMBER: _ClassVar[int]
    NARRATIVE_ARC_ARCHETYPE_FIELD_NUMBER: _ClassVar[int]
    requirements: _containers.RepeatedCompositeFieldContainer[Requirement]
    candidates: _containers.RepeatedCompositeFieldContainer[EvidenceCandidate]
    length_budget_bullets: int
    narrative_arc_archetype: str
    def __init__(self, requirements: _Optional[_Iterable[_Union[Requirement, _Mapping]]] = ..., candidates: _Optional[_Iterable[_Union[EvidenceCandidate, _Mapping]]] = ..., length_budget_bullets: _Optional[int] = ..., narrative_arc_archetype: _Optional[str] = ...) -> None: ...

class SolveEvidenceResponse(_message.Message):
    __slots__ = ("assignment", "objective_value", "feasible", "solver_version")
    class AssignmentEntry(_message.Message):
        __slots__ = ("key", "value")
        KEY_FIELD_NUMBER: _ClassVar[int]
        VALUE_FIELD_NUMBER: _ClassVar[int]
        key: str
        value: str
        def __init__(self, key: _Optional[str] = ..., value: _Optional[str] = ...) -> None: ...
    ASSIGNMENT_FIELD_NUMBER: _ClassVar[int]
    OBJECTIVE_VALUE_FIELD_NUMBER: _ClassVar[int]
    FEASIBLE_FIELD_NUMBER: _ClassVar[int]
    SOLVER_VERSION_FIELD_NUMBER: _ClassVar[int]
    assignment: _containers.ScalarMap[str, str]
    objective_value: float
    feasible: bool
    solver_version: str
    def __init__(self, assignment: _Optional[_Mapping[str, str]] = ..., objective_value: _Optional[float] = ..., feasible: bool = ..., solver_version: _Optional[str] = ...) -> None: ...

class ComposeBulletRequest(_message.Message):
    __slots__ = ("blackboard_snapshot_json", "section_id", "lead_evidence_span_id", "template_family", "verb_quality_tier", "slot_fill_json")
    BLACKBOARD_SNAPSHOT_JSON_FIELD_NUMBER: _ClassVar[int]
    SECTION_ID_FIELD_NUMBER: _ClassVar[int]
    LEAD_EVIDENCE_SPAN_ID_FIELD_NUMBER: _ClassVar[int]
    TEMPLATE_FAMILY_FIELD_NUMBER: _ClassVar[int]
    VERB_QUALITY_TIER_FIELD_NUMBER: _ClassVar[int]
    SLOT_FILL_JSON_FIELD_NUMBER: _ClassVar[int]
    blackboard_snapshot_json: str
    section_id: str
    lead_evidence_span_id: str
    template_family: str
    verb_quality_tier: str
    slot_fill_json: str
    def __init__(self, blackboard_snapshot_json: _Optional[str] = ..., section_id: _Optional[str] = ..., lead_evidence_span_id: _Optional[str] = ..., template_family: _Optional[str] = ..., verb_quality_tier: _Optional[str] = ..., slot_fill_json: _Optional[str] = ...) -> None: ...

class ComposeBulletResponse(_message.Message):
    __slots__ = ("text", "honesty_score", "coherence_score", "voice_drift_cosine", "model_version")
    TEXT_FIELD_NUMBER: _ClassVar[int]
    HONESTY_SCORE_FIELD_NUMBER: _ClassVar[int]
    COHERENCE_SCORE_FIELD_NUMBER: _ClassVar[int]
    VOICE_DRIFT_COSINE_FIELD_NUMBER: _ClassVar[int]
    MODEL_VERSION_FIELD_NUMBER: _ClassVar[int]
    text: str
    honesty_score: Confidence
    coherence_score: Confidence
    voice_drift_cosine: float
    model_version: str
    def __init__(self, text: _Optional[str] = ..., honesty_score: _Optional[_Union[Confidence, _Mapping]] = ..., coherence_score: _Optional[_Union[Confidence, _Mapping]] = ..., voice_drift_cosine: _Optional[float] = ..., model_version: _Optional[str] = ...) -> None: ...

class CritiqueRequest(_message.Message):
    __slots__ = ("draft_json", "blackboard_snapshot_json", "persona")
    DRAFT_JSON_FIELD_NUMBER: _ClassVar[int]
    BLACKBOARD_SNAPSHOT_JSON_FIELD_NUMBER: _ClassVar[int]
    PERSONA_FIELD_NUMBER: _ClassVar[int]
    draft_json: str
    blackboard_snapshot_json: str
    persona: str
    def __init__(self, draft_json: _Optional[str] = ..., blackboard_snapshot_json: _Optional[str] = ..., persona: _Optional[str] = ...) -> None: ...

class CritiqueRejection(_message.Message):
    __slots__ = ("reason", "severity", "falsifiable_by", "target_path")
    REASON_FIELD_NUMBER: _ClassVar[int]
    SEVERITY_FIELD_NUMBER: _ClassVar[int]
    FALSIFIABLE_BY_FIELD_NUMBER: _ClassVar[int]
    TARGET_PATH_FIELD_NUMBER: _ClassVar[int]
    reason: str
    severity: str
    falsifiable_by: str
    target_path: str
    def __init__(self, reason: _Optional[str] = ..., severity: _Optional[str] = ..., falsifiable_by: _Optional[str] = ..., target_path: _Optional[str] = ...) -> None: ...

class CritiqueResponse(_message.Message):
    __slots__ = ("ship_recommendation", "rejections", "model_version")
    SHIP_RECOMMENDATION_FIELD_NUMBER: _ClassVar[int]
    REJECTIONS_FIELD_NUMBER: _ClassVar[int]
    MODEL_VERSION_FIELD_NUMBER: _ClassVar[int]
    ship_recommendation: bool
    rejections: _containers.RepeatedCompositeFieldContainer[CritiqueRejection]
    model_version: str
    def __init__(self, ship_recommendation: bool = ..., rejections: _Optional[_Iterable[_Union[CritiqueRejection, _Mapping]]] = ..., model_version: _Optional[str] = ...) -> None: ...

class PredictOutcomeRequest(_message.Message):
    __slots__ = ("blackboard_snapshot_json", "persona")
    BLACKBOARD_SNAPSHOT_JSON_FIELD_NUMBER: _ClassVar[int]
    PERSONA_FIELD_NUMBER: _ClassVar[int]
    blackboard_snapshot_json: str
    persona: str
    def __init__(self, blackboard_snapshot_json: _Optional[str] = ..., persona: _Optional[str] = ...) -> None: ...

class PredictOutcomeResponse(_message.Message):
    __slots__ = ("callback_probability", "blocking_factors", "counterfactuals", "model_version")
    CALLBACK_PROBABILITY_FIELD_NUMBER: _ClassVar[int]
    BLOCKING_FACTORS_FIELD_NUMBER: _ClassVar[int]
    COUNTERFACTUALS_FIELD_NUMBER: _ClassVar[int]
    MODEL_VERSION_FIELD_NUMBER: _ClassVar[int]
    callback_probability: Confidence
    blocking_factors: _containers.RepeatedScalarFieldContainer[str]
    counterfactuals: _containers.RepeatedScalarFieldContainer[str]
    model_version: str
    def __init__(self, callback_probability: _Optional[_Union[Confidence, _Mapping]] = ..., blocking_factors: _Optional[_Iterable[str]] = ..., counterfactuals: _Optional[_Iterable[str]] = ..., model_version: _Optional[str] = ...) -> None: ...

class AuditFairnessRequest(_message.Message):
    __slots__ = ("blackboard_snapshot_json", "perturbations")
    BLACKBOARD_SNAPSHOT_JSON_FIELD_NUMBER: _ClassVar[int]
    PERTURBATIONS_FIELD_NUMBER: _ClassVar[int]
    blackboard_snapshot_json: str
    perturbations: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, blackboard_snapshot_json: _Optional[str] = ..., perturbations: _Optional[_Iterable[str]] = ...) -> None: ...

class FairnessFinding(_message.Message):
    __slots__ = ("protected_class_proxy", "prediction_delta_pp", "exceeds_threshold")
    PROTECTED_CLASS_PROXY_FIELD_NUMBER: _ClassVar[int]
    PREDICTION_DELTA_PP_FIELD_NUMBER: _ClassVar[int]
    EXCEEDS_THRESHOLD_FIELD_NUMBER: _ClassVar[int]
    protected_class_proxy: str
    prediction_delta_pp: float
    exceeds_threshold: bool
    def __init__(self, protected_class_proxy: _Optional[str] = ..., prediction_delta_pp: _Optional[float] = ..., exceeds_threshold: bool = ...) -> None: ...

class AuditFairnessResponse(_message.Message):
    __slots__ = ("passed", "findings", "model_version")
    PASSED_FIELD_NUMBER: _ClassVar[int]
    FINDINGS_FIELD_NUMBER: _ClassVar[int]
    MODEL_VERSION_FIELD_NUMBER: _ClassVar[int]
    passed: bool
    findings: _containers.RepeatedCompositeFieldContainer[FairnessFinding]
    model_version: str
    def __init__(self, passed: bool = ..., findings: _Optional[_Iterable[_Union[FairnessFinding, _Mapping]]] = ..., model_version: _Optional[str] = ...) -> None: ...

class SimulateATSRequest(_message.Message):
    __slots__ = ("vendor", "resume_text")
    VENDOR_FIELD_NUMBER: _ClassVar[int]
    RESUME_TEXT_FIELD_NUMBER: _ClassVar[int]
    vendor: str
    resume_text: str
    def __init__(self, vendor: _Optional[str] = ..., resume_text: _Optional[str] = ...) -> None: ...

class SimulateATSResponse(_message.Message):
    __slots__ = ("extracted_keywords", "format_issues", "pseudo_rank_score", "vendor_version")
    EXTRACTED_KEYWORDS_FIELD_NUMBER: _ClassVar[int]
    FORMAT_ISSUES_FIELD_NUMBER: _ClassVar[int]
    PSEUDO_RANK_SCORE_FIELD_NUMBER: _ClassVar[int]
    VENDOR_VERSION_FIELD_NUMBER: _ClassVar[int]
    extracted_keywords: _containers.RepeatedScalarFieldContainer[str]
    format_issues: _containers.RepeatedScalarFieldContainer[str]
    pseudo_rank_score: float
    vendor_version: str
    def __init__(self, extracted_keywords: _Optional[_Iterable[str]] = ..., format_issues: _Optional[_Iterable[str]] = ..., pseudo_rank_score: _Optional[float] = ..., vendor_version: _Optional[str] = ...) -> None: ...
