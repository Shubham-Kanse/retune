import assert from "node:assert/strict";
import test from "node:test";
import { GoalStack } from "../src/workbench/goal-stack";
import { seed_initial_goals } from "../src/workbench/seed-goals";

test("seed_initial_goals seeds hydrate_candidate_memory with career_profile + career_understanding", () => {
  const goals = new GoalStack();
  const careerProfile = { schemaVersion: "career-profile-v1", id: "p1" };
  const careerUnderstanding = {
    schemaVersion: "career-understanding-v1",
    id: "cu-1",
  };

  seed_initial_goals(goals, {
    profile_text: "Some profile markdown.",
    career_profile: careerProfile,
    career_understanding: careerUnderstanding,
  });

  const all = goals.list();
  const hydrate = all.find((g) => g.kind === "hydrate_candidate_memory");
  assert.ok(hydrate, "hydrate_candidate_memory goal must be seeded");
  const payload = hydrate.payload as Record<string, unknown>;
  assert.deepEqual(payload.career_profile, careerProfile);
  assert.deepEqual(payload.career_understanding, careerUnderstanding);
  assert.equal(payload.profile_text, "Some profile markdown.");
});

test("seed_initial_goals omits career_understanding cleanly when not provided", () => {
  const goals = new GoalStack();
  seed_initial_goals(goals, {
    profile_text: "x",
    career_profile: { schemaVersion: "career-profile-v1" },
  });
  const hydrate = goals.list().find((g) => g.kind === "hydrate_candidate_memory");
  assert.ok(hydrate);
  const payload = hydrate.payload as Record<string, unknown>;
  assert.equal(payload.career_understanding, undefined);
});

test("seed_initial_goals supports profile_text only", () => {
  const goals = new GoalStack();
  seed_initial_goals(goals, { profile_text: "markdown only" });
  const hydrate = goals.list().find((g) => g.kind === "hydrate_candidate_memory");
  assert.ok(hydrate);
  const payload = hydrate.payload as Record<string, unknown>;
  assert.equal(payload.profile_text, "markdown only");
});
