/**
 * Generation SOTA module (003 upgrade).
 *
 * Houses every specialist, builder, and helper introduced by the SOTA
 * generation rebuild. Existing v2 specialists keep their location in
 * `src/specialists/`; this directory holds new code so the boundaries
 * stay obvious during the migration.
 *
 * @brain dorsolateral PFC (executive composition) + medial PFC (self-model)
 */

export {
  buildCandidateModelDeterministic,
  type BuildCandidateModelInput,
  type BuildCandidateModelResult,
} from "./memory/build-candidate-model";
export {
  buildClaimLedgerFromCandidateModel,
  findUnsafeClaims,
  lockClaimLedger,
} from "./memory/build-claim-ledger";
export { CandidateMemoryHydrator } from "./memory/candidate-memory-hydrator";
export { ClaimLedgerLocker } from "./memory/claim-ledger-locker";
export {
  buildJobModelDeterministic,
  type BuildJobModelInput,
  type BuildJobModelResult,
} from "./job/build-job-model";
export { JobModelBuilder } from "./job/job-model-builder";
export {
  CompanyContextResearcher,
  _resetCompanyResearchCache,
  type CompanyContextResearcherOptions,
} from "./job/company-context-researcher";
export { ProofGapInterviewer } from "./interview/proof-gap-interviewer";
export { DraftTournamentRunner } from "./drafting/draft-tournament-runner";
export { ApplicationPackageRenderer } from "./render/application-package-renderer";
export {
  rankVariantsByLearning,
  type RankerInput,
  type RankedVariant,
  type RankerOutput,
} from "./learning/outcome-learning-ranker";
