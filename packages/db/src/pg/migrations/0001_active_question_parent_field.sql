-- Retune migration 0001 — parent_goal_field on active_questions.
--
-- Why: commit #4 lands the answer-processing activity, which routes a
-- user answer back into a parent goal's payload. Commit #4's routing
-- uses a target_field heuristic (role_schema → jd_title, company_schema
-- → company). Commit #5 specialists need arbitrary routing; this column
-- makes the routing explicit per-question rather than baked into the
-- activity code.
--
-- Also adds a covering index for the workflow's "any pending answers?"
-- poll: (generation_id) WHERE answered_at IS NULL.
--
-- Backwards-compatible: column is nullable with no default, so existing
-- rows are untouched and the heuristic fallback handles them.

ALTER TABLE active_questions
  ADD COLUMN IF NOT EXISTS parent_goal_field varchar(128);

CREATE INDEX IF NOT EXISTS active_questions_pending_ix
  ON active_questions (generation_id)
  WHERE answered_at IS NULL;
