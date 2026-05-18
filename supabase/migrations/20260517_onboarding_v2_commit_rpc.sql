-- Atomic commit for onboarding v2 profile data.
-- A PL/pgSQL function runs inside the caller's transaction, so any failed
-- write rolls back the profile rows, metadata row, user completion flag, and
-- session status together.

CREATE OR REPLACE FUNCTION public.commit_onboarding_v2_profile(
  p_user_id UUID,
  p_session JSONB,
  p_llm_stats JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_uid UUID;
  v_ext JSONB := p_session #> '{dual_extraction,pure_extraction}';
  v_identity JSONB := p_session #> '{dual_extraction,pure_extraction,identity}';
  v_question_map JSONB := COALESCE(p_session -> 'question_map', '{}'::jsonb);
  v_confirmation JSONB := COALESCE(p_session -> 'confirmation', '{}'::jsonb);
  v_completeness JSONB := COALESCE(p_session -> 'completeness', '{}'::jsonb);
  v_inference JSONB := COALESCE(p_session -> 'inference', '{}'::jsonb);
  v_audit JSONB := COALESCE(p_session -> 'audit', '{}'::jsonb);
  v_voice JSONB := COALESCE(p_session -> 'voice_profile', '{}'::jsonb);
  v_extraction JSONB := COALESCE(p_session -> 'extraction', '{}'::jsonb);
  v_upload JSONB := COALESCE(p_session -> 'upload', '{}'::jsonb);
  v_now TIMESTAMPTZ := now();
  v_session_id UUID := NULLIF(p_session ->> 'session_id', '')::uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'missing_user_id';
  END IF;

  IF to_regnamespace('auth') IS NOT NULL THEN
    IF to_regprocedure('auth.uid()') IS NOT NULL THEN
      EXECUTE 'select auth.uid()' INTO v_auth_uid;
      IF v_auth_uid IS NOT NULL AND v_auth_uid <> p_user_id THEN
        RAISE EXCEPTION 'forbidden_onboarding_commit';
      END IF;
    END IF;
  END IF;

  IF p_session IS NULL OR jsonb_typeof(p_session) <> 'object' THEN
    RAISE EXCEPTION 'invalid_session_payload';
  END IF;

  IF COALESCE(NULLIF(v_audit ->> 'ready_to_commit', '')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'audit_not_ready';
  END IF;

  IF v_ext IS NULL OR jsonb_typeof(v_ext) <> 'object' THEN
    RAISE EXCEPTION 'missing_extraction_payload';
  END IF;

  INSERT INTO user_profiles_v2 (
    user_id,
    full_name,
    email,
    phone,
    location,
    linkedin_url,
    github_url,
    portfolio_url,
    confirmed_role_family,
    confirmed_seniority,
    confirmed_industry,
    target_role,
    target_role_specificity,
    resume_frame,
    underrepresented_skills,
    deemphasis_preferences,
    career_transition_framing,
    gap_handling,
    achievement_depth,
    completeness_path,
    completeness_score,
    profile_quality_score,
    career_transition_detected,
    new_grad,
    work_pattern,
    resume_stale,
    employment_gaps_present,
    inferred_summary,
    updated_at
  )
  VALUES (
    p_user_id,
    v_identity ->> 'full_name',
    v_identity ->> 'email',
    v_identity ->> 'phone',
    v_identity ->> 'location',
    v_identity ->> 'linkedin_url',
    v_identity ->> 'github_url',
    v_identity ->> 'portfolio_url',
    v_confirmation ->> 'confirmed_role_family',
    v_confirmation ->> 'confirmed_seniority',
    v_confirmation ->> 'confirmed_industry',
    v_question_map #>> '{target_role,value}',
    v_question_map #>> '{target_role_specificity,value}',
    v_question_map #>> '{resume_frame,value}',
    COALESCE(v_question_map #> '{underrepresented_skills,value}', '[]'::jsonb),
    COALESCE(v_question_map #> '{deemphasis_preferences,value}', '[]'::jsonb),
    v_question_map #>> '{career_transition_framing,value}',
    v_question_map #>> '{gap_handling,value}',
    v_question_map #> '{achievement_depth,value}',
    v_completeness ->> 'completeness_path',
    NULLIF(v_completeness ->> 'completeness_score', '')::integer,
    NULLIF(v_audit ->> 'profile_quality_score', '')::integer,
    COALESCE(NULLIF(v_inference ->> 'career_transition_detected', '')::boolean, false),
    COALESCE(NULLIF(v_inference ->> 'new_grad', '')::boolean, false),
    v_inference ->> 'work_pattern',
    COALESCE(NULLIF(v_completeness ->> 'resume_stale', '')::boolean, false),
    COALESCE(NULLIF(v_completeness ->> 'employment_gaps_present', '')::boolean, false),
    p_session #>> '{dual_extraction,inferred_summary}',
    v_now
  )
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    location = EXCLUDED.location,
    linkedin_url = EXCLUDED.linkedin_url,
    github_url = EXCLUDED.github_url,
    portfolio_url = EXCLUDED.portfolio_url,
    confirmed_role_family = EXCLUDED.confirmed_role_family,
    confirmed_seniority = EXCLUDED.confirmed_seniority,
    confirmed_industry = EXCLUDED.confirmed_industry,
    target_role = EXCLUDED.target_role,
    target_role_specificity = EXCLUDED.target_role_specificity,
    resume_frame = EXCLUDED.resume_frame,
    underrepresented_skills = EXCLUDED.underrepresented_skills,
    deemphasis_preferences = EXCLUDED.deemphasis_preferences,
    career_transition_framing = EXCLUDED.career_transition_framing,
    gap_handling = EXCLUDED.gap_handling,
    achievement_depth = EXCLUDED.achievement_depth,
    completeness_path = EXCLUDED.completeness_path,
    completeness_score = EXCLUDED.completeness_score,
    profile_quality_score = EXCLUDED.profile_quality_score,
    career_transition_detected = EXCLUDED.career_transition_detected,
    new_grad = EXCLUDED.new_grad,
    work_pattern = EXCLUDED.work_pattern,
    resume_stale = EXCLUDED.resume_stale,
    employment_gaps_present = EXCLUDED.employment_gaps_present,
    inferred_summary = EXCLUDED.inferred_summary,
    updated_at = EXCLUDED.updated_at;

  DELETE FROM user_experience_v2 WHERE user_id = p_user_id;
  INSERT INTO user_experience_v2 (
    user_id, sort_order, title, company, location, start_date, end_date, is_current, bullets, source
  )
  SELECT
    p_user_id,
    ordinality::integer - 1,
    item ->> 'title',
    item ->> 'company',
    item ->> 'location',
    item ->> 'start_date',
    item ->> 'end_date',
    COALESCE(NULLIF(item ->> 'is_current', '')::boolean, false),
    COALESCE(item -> 'bullets', '[]'::jsonb),
    'extracted'
  FROM jsonb_array_elements(COALESCE(v_ext -> 'experience', '[]'::jsonb)) WITH ORDINALITY AS e(item, ordinality);

  DELETE FROM user_education_v2 WHERE user_id = p_user_id;
  INSERT INTO user_education_v2 (
    user_id, sort_order, institution, degree, field, start_date, end_date, gpa, honours, source
  )
  SELECT
    p_user_id,
    ordinality::integer - 1,
    item ->> 'institution',
    item ->> 'degree',
    item ->> 'field',
    item ->> 'start_date',
    item ->> 'end_date',
    item ->> 'gpa',
    item ->> 'honours',
    'extracted'
  FROM jsonb_array_elements(COALESCE(v_ext -> 'education', '[]'::jsonb)) WITH ORDINALITY AS e(item, ordinality);

  INSERT INTO user_skills_v2 (user_id, raw_list, grouped, source, updated_at)
  VALUES (
    p_user_id,
    COALESCE(v_ext #> '{skills,raw_list}', '[]'::jsonb),
    COALESCE(v_ext #> '{skills,grouped}', '{}'::jsonb),
    'extracted',
    v_now
  )
  ON CONFLICT (user_id) DO UPDATE SET
    raw_list = EXCLUDED.raw_list,
    grouped = EXCLUDED.grouped,
    source = EXCLUDED.source,
    updated_at = EXCLUDED.updated_at;

  DELETE FROM user_projects_v2 WHERE user_id = p_user_id;
  INSERT INTO user_projects_v2 (user_id, sort_order, name, description, technologies, url, source)
  SELECT
    p_user_id,
    ordinality::integer - 1,
    item ->> 'name',
    item ->> 'description',
    COALESCE(item -> 'technologies', '[]'::jsonb),
    item ->> 'url',
    'extracted'
  FROM jsonb_array_elements(COALESCE(v_ext -> 'projects', '[]'::jsonb)) WITH ORDINALITY AS e(item, ordinality);

  DELETE FROM user_certifications_v2 WHERE user_id = p_user_id;
  INSERT INTO user_certifications_v2 (user_id, name, issuer, date, source)
  SELECT
    p_user_id,
    item ->> 'name',
    item ->> 'issuer',
    item ->> 'date',
    'extracted'
  FROM jsonb_array_elements(COALESCE(v_ext -> 'certifications', '[]'::jsonb)) AS e(item);

  INSERT INTO user_extras_v2 (user_id, languages, awards, publications, volunteering)
  VALUES (
    p_user_id,
    COALESCE(v_ext -> 'languages', '[]'::jsonb),
    COALESCE(v_ext -> 'awards', '[]'::jsonb),
    COALESCE(v_ext -> 'publications', '[]'::jsonb),
    COALESCE(v_ext -> 'volunteering', '[]'::jsonb)
  )
  ON CONFLICT (user_id) DO UPDATE SET
    languages = EXCLUDED.languages,
    awards = EXCLUDED.awards,
    publications = EXCLUDED.publications,
    volunteering = EXCLUDED.volunteering;

  INSERT INTO user_voice_profiles_v2 (
    user_id,
    natural_voice_sample,
    tone_preferences,
    tone_aversions,
    self_description_style,
    sentence_structure,
    vocabulary_register,
    leading_pattern,
    phrases_to_use,
    phrases_to_avoid,
    tone_calibration_summary,
    aversion_to_ai_language,
    voice_profile_confidence,
    voice_profile_source,
    updated_at
  )
  VALUES (
    p_user_id,
    v_voice ->> 'natural_voice_sample',
    COALESCE(v_voice -> 'tone_preferences', '[]'::jsonb),
    COALESCE(v_voice -> 'tone_aversions', '[]'::jsonb),
    v_voice ->> 'self_description_style',
    v_voice ->> 'sentence_structure',
    v_voice ->> 'vocabulary_register',
    v_voice ->> 'leading_pattern',
    COALESCE(v_voice -> 'phrases_to_use', '[]'::jsonb),
    COALESCE(v_voice -> 'phrases_to_avoid', '[]'::jsonb),
    v_voice ->> 'tone_calibration_summary',
    COALESCE(NULLIF(v_voice ->> 'aversion_to_ai_language', '')::boolean, false),
    v_voice ->> 'voice_profile_confidence',
    v_voice ->> 'voice_profile_source',
    v_now
  )
  ON CONFLICT (user_id) DO UPDATE SET
    natural_voice_sample = EXCLUDED.natural_voice_sample,
    tone_preferences = EXCLUDED.tone_preferences,
    tone_aversions = EXCLUDED.tone_aversions,
    self_description_style = EXCLUDED.self_description_style,
    sentence_structure = EXCLUDED.sentence_structure,
    vocabulary_register = EXCLUDED.vocabulary_register,
    leading_pattern = EXCLUDED.leading_pattern,
    phrases_to_use = EXCLUDED.phrases_to_use,
    phrases_to_avoid = EXCLUDED.phrases_to_avoid,
    tone_calibration_summary = EXCLUDED.tone_calibration_summary,
    aversion_to_ai_language = EXCLUDED.aversion_to_ai_language,
    voice_profile_confidence = EXCLUDED.voice_profile_confidence,
    voice_profile_source = EXCLUDED.voice_profile_source,
    updated_at = EXCLUDED.updated_at;

  INSERT INTO user_onboarding_metadata_v2 (
    user_id,
    session_id,
    field_sources,
    field_confidences,
    low_confidence_fields,
    needs_review_fields,
    correction_rounds,
    correction_unresolved,
    extraction_confidence,
    extraction_method,
    upload_file_name,
    total_llm_calls,
    total_llm_cost_usd,
    onboarding_started_at,
    onboarding_completed_at
  )
  VALUES (
    p_user_id,
    v_session_id,
    jsonb_build_object(
      'confirmation', 'user_confirmed',
      'question_map', 'user_supplied',
      'voice_profile', COALESCE(v_voice ->> 'voice_profile_source', 'default')
    ),
    jsonb_build_object(
      'extraction', v_extraction ->> 'extraction_quality',
      'target_role', v_question_map #>> '{target_role,confidence}',
      'resume_frame', v_question_map #>> '{resume_frame,confidence}',
      'voice_profile', v_voice ->> 'voice_profile_confidence'
    ),
    COALESCE(
      (
        SELECT jsonb_agg(field)
        FROM (
          SELECT 'extraction' AS field WHERE v_extraction ->> 'extraction_quality' = 'low'
          UNION ALL SELECT 'target_role' WHERE v_question_map #>> '{target_role,confidence}' = 'low'
          UNION ALL SELECT 'resume_frame' WHERE v_question_map #>> '{resume_frame,confidence}' = 'low'
          UNION ALL SELECT 'voice_profile' WHERE v_voice ->> 'voice_profile_confidence' = 'low'
        ) low
      ),
      '[]'::jsonb
    ),
    COALESCE(v_completeness -> 'missing_critical_fields', '[]'::jsonb),
    COALESCE(NULLIF(v_confirmation ->> 'correction_rounds', '')::integer, 0),
    COALESCE(NULLIF(v_confirmation ->> 'correction_unresolved', '')::boolean, false),
    v_extraction ->> 'extraction_quality',
    v_extraction ->> 'extraction_method',
    v_upload ->> 'file_name',
    COALESCE(NULLIF(p_llm_stats ->> 'calls', '')::integer, 0),
    COALESCE(NULLIF(p_llm_stats ->> 'costUsd', '')::numeric, 0),
    NULLIF(p_session ->> 'onboarding_started_at', '')::timestamptz,
    v_now
  )
  ON CONFLICT (user_id) DO UPDATE SET
    session_id = EXCLUDED.session_id,
    field_sources = EXCLUDED.field_sources,
    field_confidences = EXCLUDED.field_confidences,
    low_confidence_fields = EXCLUDED.low_confidence_fields,
    needs_review_fields = EXCLUDED.needs_review_fields,
    correction_rounds = EXCLUDED.correction_rounds,
    correction_unresolved = EXCLUDED.correction_unresolved,
    extraction_confidence = EXCLUDED.extraction_confidence,
    extraction_method = EXCLUDED.extraction_method,
    upload_file_name = EXCLUDED.upload_file_name,
    total_llm_calls = EXCLUDED.total_llm_calls,
    total_llm_cost_usd = EXCLUDED.total_llm_cost_usd,
    onboarding_started_at = EXCLUDED.onboarding_started_at,
    onboarding_completed_at = EXCLUDED.onboarding_completed_at;

  UPDATE users
  SET onboarding_completed = true,
      onboarding_completed_at = v_now
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  UPDATE onboarding_v2_sessions
  SET session_state = jsonb_set(
        jsonb_set(p_session, '{onboarding_status}', to_jsonb('committed'::text), true),
        '{onboarding_completed_at}',
        to_jsonb(v_now),
        true
      ),
      onboarding_status = 'committed',
      completed_at = v_now,
      updated_at = v_now,
      version = version + 1
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.commit_onboarding_v2_profile(UUID, JSONB, JSONB) TO authenticated;
