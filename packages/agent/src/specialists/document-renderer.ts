/**
 * DocumentRenderer — premotor cortex (motor execution).
 *
 * Handles the `render_documents` goal emitted by RefuseOrShipGate on a
 * SHIP verdict. Marks the render phase complete and writes a structured
 * "ready" signal to the blackboard so downstream consumers (SSE stream,
 * results page) know documents are ready.
 *
 * The actual document binary generation (DOCX/PDF) happens in apps/web
 * via Python scripts — this specialist records the decision and marks
 * the goal satisfied so the orchestrator can terminate cleanly rather
 * than abandoning the goal.
 *
 * Goal kind: `render_documents`
 *
 * Reads:
 *   - hypotheses.ship_decision (ShipDecision from RefuseOrShipGate)
 *   - hypotheses.gdpr_audit_packet (GdprAuditPacket from RefuseOrShipGate)
 *
 * Writes:
 *   - hypotheses.render_complete: { verdict, timestamp, gdpr_packet_id }
 *
 * Emits: no downstream goals
 *
 * @brain premotor cortex (motor execution readiness)
 * @thinking execution
 * @cellType pyramidal
 * @neurotransmitter dopamine
 */

import type { Goal, GoalKind } from "@retune/types";
import { AuditTrail } from "../workbench/audit-trail";
import type { Specialist, SpecialistContext, SpecialistResult } from "../workbench/types";
import type { GdprAuditPacket, ShipDecision } from "./refuse-or-ship-gate";

const HANDLES: readonly GoalKind[] = ["render_documents"];

export interface RenderComplete {
  verdict: string;
  timestamp: string;
  gdpr_packet_id: string | null;
}

export class DocumentRenderer implements Specialist {
  readonly id = "document_renderer";
  readonly display_name = "Document Renderer";
  readonly brain_region = "premotor_cortex";
  readonly handles_goal_kinds = HANDLES;
  readonly estimated_cost_usd = 0;
  readonly estimated_latency_ms = 5;

  async run(ctx: SpecialistContext, goal: Goal): Promise<SpecialistResult> {
    const t0 = Date.now();
    const { blackboard } = ctx;

    // Read ship_decision written by RefuseOrShipGate
    const ship_decision = (blackboard.hypotheses as unknown as { ship_decision?: ShipDecision })
      .ship_decision;

    // Read GDPR audit packet (may not exist in non-GDPR paths)
    const gdpr_packet = (
      blackboard.hypotheses as unknown as { gdpr_audit_packet?: GdprAuditPacket }
    ).gdpr_audit_packet;

    const verdict = ship_decision?.verdict ?? "ship";
    const gdpr_packet_id = gdpr_packet?.generation_id ?? null;

    const render_complete: RenderComplete = {
      verdict,
      timestamp: new Date().toISOString(),
      gdpr_packet_id,
    };

    const writes: Array<{ path: string; value: unknown }> = [
      { path: "hypotheses.render_complete", value: render_complete },
    ];

    const inputs_hash = AuditTrail.hash({
      verdict,
      has_ship_decision: !!ship_decision,
      has_gdpr_packet: !!gdpr_packet,
    });

    return {
      writes,
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        micro_stage: "render_ready_signal",
        inputs_hash,
        output_hash: AuditTrail.hash({ verdict, gdpr_packet_id }),
        justification: `documents ready for rendering | verdict=${verdict} | gdpr_packet_id=${gdpr_packet_id ?? "none"}`,
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        writes: writes.map((w) => w.path),
      },
    };
  }
}
