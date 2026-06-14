/**
 * Comprehension layer — public surface.
 *
 */

export { TitleSchemaRetriever } from "./title";
export { CompanySchemaRetriever } from "./company";
export { JdSpanExtractor, type ExtractedSpansSink, StubJdSpanExtractor } from "./spans";
export {
  BoilerplateStripper,
  CULTURAL_VECTOR_DIM,
  CulturalCalibrator,
  DiscourseClassifier,
  StubDiscourseClassifier,
  STRIPPED_IMPORTANCE,
} from "./discourse";
export {
  VOICE_FINGERPRINT_DIM,
  VoiceFingerprintExtractor,
  type VoiceFingerprintSink,
} from "./voice";
export {
  HONESTY_CLAIM_KINDS,
  HonestyCalibrator,
  type HonestyCalibrationStore,
} from "./honesty";
export { CredibilityScanner } from "./credibility";
