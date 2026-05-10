/**
 * Tests for record_gdpr_packet, load_gdpr_packet, and record_conflict
 * persistence methods (technical-2.0 §10.3, §10.4).
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { build_pglite_harness } from "./helpers/pglite-harness";

test("record_gdpr_packet → load_gdpr_packet round-trip", async () => {
  const h = await build_pglite_harness();
  try {
    const generation_id = randomUUID();

    // Seed a generation row (FK target).
    const { generations } = await import("@retune/db/pg");
    await h.db.insert(generations).values({
      id: generation_id,
      user_id: h.user_id,
      ontology_version: "0.0.1",
    });

    const packet = {
      verdict: "ship",
      pipeline_stages: [{ stage: "gate", specialist_id: "refuse_or_ship_gate" }],
      decision_factors: [{ factor: "ATS coverage", value: 0.92 }],
    };

    await h.persistence.record_gdpr_packet({
      generation_id,
      user_id: h.user_id,
      verdict: "ship",
      packet,
    });

    const loaded = await h.persistence.load_gdpr_packet(generation_id);
    assert.ok(loaded);
    assert.equal(loaded.verdict, "ship");
    assert.deepEqual(loaded.packet, packet);

    // Idempotent — second insert is a no-op.
    await h.persistence.record_gdpr_packet({
      generation_id,
      user_id: h.user_id,
      verdict: "refuse",
      packet: { overwrite: true },
    });
    const reloaded = await h.persistence.load_gdpr_packet(generation_id);
    assert.equal(reloaded?.verdict, "ship", "idempotent: first write wins");
  } finally {
    await h.close();
  }
});

test("load_gdpr_packet returns null for unknown generation", async () => {
  const h = await build_pglite_harness();
  try {
    const result = await h.persistence.load_gdpr_packet(randomUUID());
    assert.equal(result, null);
  } finally {
    await h.close();
  }
});

test("record_conflict persists to queryable rows", async () => {
  const h = await build_pglite_harness();
  try {
    const generation_id = randomUUID();
    const conflict_id = randomUUID();

    const { generations, conflicts } = await import("@retune/db/pg");
    const { eq } = await import("drizzle-orm");
    await h.db.insert(generations).values({
      id: generation_id,
      user_id: h.user_id,
      ontology_version: "0.0.1",
    });

    await h.persistence.record_conflict({
      generation_id,
      conflict: {
        id: conflict_id,
        monitor: "voice_drift",
        severity: "medium",
        payload: { type: "voice_drift", cosine: 0.28 },
      },
    });

    const rows = await h.db
      .select()
      .from(conflicts)
      .where(eq(conflicts.generation_id, generation_id));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.monitor, "voice_drift");
    assert.equal(rows[0]?.severity, "medium");
    assert.equal(rows[0]?.kind, "voice_drift");

    // Idempotent — same conflict_id insert is a no-op.
    await h.persistence.record_conflict({
      generation_id,
      conflict: {
        id: conflict_id,
        monitor: "fabrication",
        severity: "critical",
        payload: { type: "fabrication" },
      },
    });
    const rows2 = await h.db
      .select()
      .from(conflicts)
      .where(eq(conflicts.generation_id, generation_id));
    assert.equal(rows2.length, 1, "idempotent: duplicate id ignored");
  } finally {
    await h.close();
  }
});
