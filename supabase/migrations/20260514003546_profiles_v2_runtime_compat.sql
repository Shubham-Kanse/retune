-- Profiles v2 recreated the profiles table after the earlier compatibility
-- migration, removing columns still used by the web runtime and Drizzle schema.
-- Keep these legacy columns until the dashboard/profile APIs are fully moved to
-- the v2 names and JSONB/text[] layout.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS linkedin TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS visa_status TEXT,
  ADD COLUMN IF NOT EXISTS relocation_preferences TEXT,
  ADD COLUMN IF NOT EXISTS target_roles TEXT NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS experience_level TEXT,
  ADD COLUMN IF NOT EXISTS current_title TEXT,
  ADD COLUMN IF NOT EXISTS skills_tier1 TEXT,
  ADD COLUMN IF NOT EXISTS skills_tier2 TEXT,
  ADD COLUMN IF NOT EXISTS skills_tier3 TEXT,
  ADD COLUMN IF NOT EXISTS voice_notes TEXT,
  ADD COLUMN IF NOT EXISTS professional_identities JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS career_direction TEXT,
  ADD COLUMN IF NOT EXISTS preferred_markets JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS work_preference TEXT,
  ADD COLUMN IF NOT EXISTS emphasis_areas JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS onboarding_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS completeness_score INTEGER NOT NULL DEFAULT 0;

UPDATE public.profiles
SET
  linkedin = COALESCE(linkedin, linkedin_url),
  location = COALESCE(NULLIF(location, ''), NULLIF(CONCAT_WS(', ', city, country), ''), ''),
  skills_tier1 = COALESCE(skills_tier1, to_json(technical_skills)::text),
  skills_tier2 = COALESCE(skills_tier2, '[]'),
  skills_tier3 = COALESCE(skills_tier3, to_json(professional_skills)::text),
  voice_notes = COALESCE(voice_notes, professional_summary);
