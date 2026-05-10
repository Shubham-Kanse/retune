-- Make optimized generation_results self-sufficient for result rendering.
ALTER TABLE public.generation_results
  ADD COLUMN IF NOT EXISTS company TEXT,
  ADD COLUMN IF NOT EXISTS role TEXT,
  ADD COLUMN IF NOT EXISTS resume_content TEXT,
  ADD COLUMN IF NOT EXISTS cover_letter_content TEXT,
  ADD COLUMN IF NOT EXISTS application_strategy TEXT;

