/**
 * Translates raw cognitive trace events into human-readable narrative paragraphs.
 * Subscribes to a TraceBus and emits prose summaries as specialists complete.
 */

import type { TraceBus } from "./trace-bus";

const SPECIALIST_NARRATION: Record<string, string> = {
  title_schema_retriever: "Analyzing the job title and role requirements…",
  company_schema_retriever: "Researching company context and calibration signals…",
  jd_span_extractor: "Extracting key requirements from the job description…",
  discourse_classifier: "Understanding the JD's communication style and tone…",
  boilerplate_stripper: "Filtering noise from the job description…",
  cultural_calibrator: "Calibrating cultural fit signals…",
  voice_fingerprint_extractor: "Building your natural writing voice fingerprint…",
  honesty_calibrator: "Loading honesty calibration priors…",
  credibility_scanner: "Scanning claims for credibility…",
  gap_mapper: "Mapping your experience against the job requirements…",
  evidence_solver: "Grounding every claim in your actual profile evidence…",
  emotional_state_modeler: "Modeling the emotional context of your application…",
  narrative_arc_proposer: "Choosing the strongest narrative angle for your profile…",
  sequential_bullet_composer: "Writing your experience bullets…",
  theory_of_mind: "Modeling how a recruiter will read and evaluate your application…",
  critic_ensemble: "Running multi-perspective quality checks…",
  outcome_predictor: "Estimating your interview call probability…",
  refuse_or_ship_gate: "Making the final quality decision…",
  fairness_monitor: "Checking for fairness and bias issues…",
  voice_drift_monitor: "Verifying your voice is consistent throughout…",
  well_being_monitor: "Checking application health signals…",
};

export class SseNarrator {
  private lastSpecialist: string | null = null;
  private stopped = false;

  constructor(
    private readonly bus: TraceBus,
    private readonly onParagraph: (text: string) => void,
  ) {}

  start(): void {
    this.run().catch(() => {});
  }

  stop(): void {
    this.stopped = true;
  }

  private async run(): Promise<void> {
    for await (const frame of this.bus.subscribe()) {
      if (this.stopped) break;
      if (frame.kind !== "trace") continue;

      const specialist = frame.event.specialist;
      const stage = frame.event.micro_stage;

      // Only emit a paragraph when a specialist finishes (avoids chattering mid-tick)
      if (stage === "output" || stage === "complete" || stage === "done") {
        if (specialist !== this.lastSpecialist) {
          const narration = SPECIALIST_NARRATION[specialist];
          if (narration) {
            this.onParagraph(narration);
            this.lastSpecialist = specialist;
          }
        }
      }
    }
  }
}
