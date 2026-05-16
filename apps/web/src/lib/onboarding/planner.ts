import {
  buildEducationCards,
  buildExperienceCards,
  buildExtrasCards,
  buildIdentityCard,
  buildProjectCertificationCards,
  buildSkillCards,
  buildSummaryCards,
} from "./cards";
import type { UserCareerProfile, OnboardingMeta, OnboardingQuestion } from "./types";
import { inferRolesFromProfile } from "./role-inference";

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function professionalIdentityOptions(profile: UserCareerProfile): string[] {
  const text = [
    ...profile.professionalProfile.currentTitles.value,
    ...profile.experience.value.map((e) => e.title),
    ...profile.education.value.flatMap((e) => [e.degree, e.fieldOfStudy ?? ""]),
    ...profile.skills.technical.value,
    ...profile.skills.tools.value,
    ...profile.skills.business.value,
  ].join(" ").toLowerCase();

  const defaults = ["Software Engineer", "Backend Developer", "API Engineer"];
  const contextual: string[] = [];
  if (hasAiEducation(profile)) contextual.push("AI/ML Engineer", "Applied AI Engineer", "Machine Learning Engineer");
  if (text.includes("cloud") || text.includes("aws") || text.includes("microservice")) contextual.push("Cloud Solutions Architect");
  if (text.includes("api") || text.includes("rest") || text.includes("oauth")) contextual.push("API Engineer");
  if (text.includes("ci/cd") || text.includes("docker") || text.includes("kubernetes") || text.includes("devops")) contextual.push("DevOps Specialist");

  return unique([...contextual, ...inferRolesFromProfile(profile), ...defaults]).slice(0, 5);
}

function hasAiEducation(profile: UserCareerProfile): boolean {
  return profile.education.value.some((edu) => {
    const text = [edu.degree, edu.fieldOfStudy, edu.institution].filter(Boolean).join(" ").toLowerCase();
    return /\b(ai|artificial intelligence|machine learning|ml|data science)\b/.test(text);
  });
}

function hasSoftwareExperience(profile: UserCareerProfile): boolean {
  return profile.experience.value.some((exp) => {
    const text = [exp.title, exp.company, ...exp.tools, ...exp.skills, ...exp.responsibilities].join(" ").toLowerCase();
    return /(software|developer|java|spring|api|microservice|backend|engineering)/.test(text);
  });
}

function roleInterestOptions(profile: UserCareerProfile): string[] {
  const contextual = hasAiEducation(profile)
    ? ["AI/ML Engineer", "Applied AI Engineer", "Machine Learning Engineer", "Data Scientist"]
    : [];
  return unique([...contextual, ...inferRolesFromProfile(profile), ...professionalIdentityOptions(profile)]).slice(0, 7);
}

export function planNextQuestion(profile: UserCareerProfile, meta: OnboardingMeta): OnboardingQuestion | null {
  const question = planNextQuestionInner(profile, meta);
  if (!question) return null;
  // Auto-append a Skip pill for any step that allows skipping, unless one
  // is already present. The chat route already handles `action: "skip"`.
  if (question.skipAllowed && !question.pills.some((p) => p.action === "skip")) {
    return {
      ...question,
      pills: [
        ...question.pills,
        { label: "Skip", value: "skip", action: "skip" as const, field: question.field },
      ],
    };
  }
  return question;
}

function planNextQuestionInner(profile: UserCareerProfile, meta: OnboardingMeta): OnboardingQuestion | null {
  // 1. Resume not uploaded yet
  if (!meta.resumeUploaded) {
    return {
      phase: "resume_upload",
      field: "resume",
      questionKey: "resume_upload",
      prompt: "Ask the user to upload their resume to build their Retuned profile.",
      answerType: "confirm",
      pills: [{ label: "Upload resume", value: "upload_resume", action: "navigate", field: "resume" }],
      skipAllowed: false,
      whyAsked: "I need your resume to build your profile.",
    };
  }

  // 2. Resume uploaded but not parsed yet
  if (meta.resumeUploaded && !meta.resumeParsed) {
    return {
      phase: "resume_parsing",
      field: "resume",
      questionKey: "resume_parsing",
      prompt: "Tell the user their resume is being read.",
      answerType: "confirm",
      pills: [],
      skipAllowed: false,
    };
  }

  // 3. Resume uploaded but not summarized
  if (meta.resumeParsed && !meta.resumeSummarized) {
    const lowQuality = profile.onboarding.parseQuality.score > 0 && profile.onboarding.parseQuality.score < 55;
    return {
      phase: "resume_summary",
      field: "resume_summary",
      questionKey: "resume_summary",
      prompt: lowQuality
        ? "Warn the user that extraction quality was low. Suggest uploading a different format, fixing manually, or continuing with gaps filled via chat. Then summarize what was extracted."
        : "Summarize what was extracted from the resume. Reference specific companies, titles, skills found.",
      answerType: "confirm",
      pills: [
        ...(lowQuality ? [{ label: "Upload different file", value: "reupload", action: "navigate" as const, field: "resume" }] : []),
        { label: "Looks mostly correct", value: "confirm_summary", action: "confirm_field" as const, field: "resume_summary", recommended: !lowQuality },
        { label: "Review details", value: "review_details", action: "edit_card" as const, field: "resume_summary" },
        { label: "Something is wrong", value: "something_wrong", action: "ask_text" as const, field: "resume_summary" },
      ],
      cards: buildSummaryCards(profile),
      skipAllowed: false,
      whyAsked: lowQuality ? "We had trouble reading some sections of your resume." : undefined,
    };
  }

  // 3. Identity confirmation
  if (!meta.identityConfirmed && hasIdentityData(profile)) {
    return {
      phase: "identity_confirm",
      field: "identity",
      questionKey: "identity_confirm",
      prompt: `Confirm identity: name="${profile.identity.fullName.value}", email="${profile.identity.email.value}", location="${profile.identity.location.value}". Ask if correct.`,
      answerType: "confirm",
      pills: [
        { label: "Looks correct", value: "confirm_identity", action: "confirm_field", field: "identity", recommended: true },
      ],
      cards: [buildIdentityCard(profile)],
      skipAllowed: false,
    };
  }

  // 4. Experience confirmation
  if (!meta.experienceConfirmed) {
    if (profile.experience.value.length === 0) {
      return {
        phase: "profile_gap_fill",
        field: "experience",
        questionKey: "fill_experience",
        prompt: "Ask for their most recent role, company, and brief responsibilities.",
        answerType: "text",
        pills: [],
        skipAllowed: false,
      };
    }

    return {
      phase: "experience_confirm",
      field: "experience",
      questionKey: "experience_confirm",
      prompt: "Show extracted experience and ask if correct.",
      answerType: "confirm",
      pills: [
        { label: "Looks correct", value: "confirm_experience", action: "confirm_field", field: "experience", recommended: true },
      ],
      cards: buildExperienceCards(profile),
      skipAllowed: false,
    };
  }

  // 4b. Experience metrics probing (after experience confirmed)
  if (meta.experienceConfirmed && !meta.experienceMetricsPrompted) {
    const topRoles = profile.experience.value
      .filter((e) => e.title && e.company)
      .slice(0, 2);
    if (topRoles.length > 0 && !topRoles.every((r) => r.achievements.length > 0)) {
      const roleNames = topRoles.map((r) => `${r.title} at ${r.company}`).join(", ");
      return {
        phase: "experience_metrics",
        field: "experience",
        questionKey: "experience_metrics",
        prompt: `Ask for measurable impact at their most recent roles (${roleNames}). Examples: "reduced X by 30%", "led team of 5", "shipped 4 product launches". They can skip per-role.`,
        answerType: "text",
        pills: [
          { label: "Skip metrics", value: "skip_metrics", action: "confirm_field", field: "experience" },
        ],
        skipAllowed: true,
        whyAsked: "Quantified achievements dramatically improve resume quality and callback rates.",
      };
    }
    // If all roles already have achievements, skip silently
    meta.experienceMetricsPrompted = true;
  }

  // 5. Education confirmation
  if (!meta.educationConfirmed) {
    if (profile.education.value.length === 0) {
      return {
        phase: "profile_gap_fill",
        field: "education",
        questionKey: "fill_education",
        prompt: "Ask for their highest education, or let them mark formal education as not applicable.",
        answerType: "text",
        pills: [
          { label: "Add education", value: "add_education", action: "ask_text", field: "education", recommended: true },
          { label: "No formal education", value: "not_applicable", action: "confirm_field", field: "education" },
        ],
        skipAllowed: true,
      };
    }

    return {
      phase: "education_confirm",
      field: "education",
      questionKey: "education_confirm",
      prompt: "Show extracted education and ask if correct.",
      answerType: "confirm",
      pills: [
        { label: "Looks correct", value: "confirm_education", action: "confirm_field", field: "education", recommended: true },
      ],
      cards: buildEducationCards(profile),
      skipAllowed: false,
    };
  }

  // 6. Skills confirmation
  if (!meta.skillsConfirmed) {
    if (!hasSkills(profile)) {
      return {
        phase: "profile_gap_fill",
        field: "skills",
        questionKey: "fill_skills",
        prompt: "Ask for at least 5 core skills, separated by commas.",
        answerType: "text",
        pills: [
          { label: "Add skills", value: "add_skills", action: "ask_text", field: "skills", recommended: true },
          { label: "Not sure", value: "not_sure_skills", action: "ask_text", field: "skills" },
        ],
        skipAllowed: false,
        whyAsked: "Skills are required to position future resumes correctly.",
      };
    }

    return {
      phase: "skills_confirm",
      field: "skills",
      questionKey: "skills_confirm",
      prompt: "Show extracted skills and ask if they should be kept.",
      answerType: "confirm",
      pills: [
        { label: "Keep these skills", value: "confirm_skills", action: "confirm_field", field: "skills", recommended: true },
        { label: "Edit skills", value: "edit_skills", action: "ask_text", field: "skills" },
      ],
      cards: buildSkillCards(profile),
      skipAllowed: false,
    };
  }

  // 7. Projects and certifications review
  if (!meta.projectsCertificationsReviewed) {
    const cards = buildProjectCertificationCards(profile);
    return {
      phase: "projects_certifications_review",
      field: "projects_certifications",
      questionKey: "projects_certifications_review",
      prompt: cards.length
        ? "Show extracted projects and certifications. Ask whether to keep them for future resume tailoring."
        : "Ask whether they have projects or certifications worth keeping in their Retuned profile.",
      answerType: cards.length ? "confirm" : "text",
      pills: cards.length
        ? [
            { label: "Keep these", value: "confirm_projects_certs", action: "confirm_field", field: "projects_certifications", recommended: true },
            { label: "Edit", value: "edit_projects_certs", action: "ask_text", field: "projects_certifications" },
            { label: "None relevant", value: "none_relevant", action: "confirm_field", field: "projects_certifications" },
          ]
        : [
            { label: "Add project/cert", value: "add_projects_certs", action: "ask_text", field: "projects_certifications", recommended: true },
            { label: "None for now", value: "none_for_now", action: "confirm_field", field: "projects_certifications" },
          ],
      cards,
      skipAllowed: true,
      whyAsked: "Projects and certifications are optional, but they often become strong evidence for tailored resumes.",
    };
  }

  // 7b. Extras confirmation (languages, awards, publications, volunteering)
  if (!meta.extrasConfirmed) {
    const hasExtras =
      profile.languages.value.length > 0 ||
      profile.awards.value.length > 0 ||
      profile.publications.value.length > 0 ||
      profile.volunteering.value.length > 0;
    if (hasExtras) {
      const cards = buildExtrasCards(profile);
      return {
        phase: "extras_confirm",
        field: "extras",
        questionKey: "extras_confirm",
        prompt: "Show extracted languages, awards, publications, and volunteering. Ask if correct.",
        answerType: "confirm",
        pills: [
          { label: "Keep these", value: "confirm_extras", action: "confirm_field", field: "extras", recommended: true },
          { label: "Edit", value: "edit_extras", action: "ask_text", field: "extras" },
          { label: "None relevant", value: "none_extras", action: "confirm_field", field: "extras" },
        ],
        cards,
        skipAllowed: true,
        whyAsked: "Languages, awards, and publications can strengthen niche applications.",
      };
    }
    // No extras extracted — skip silently
    meta.extrasConfirmed = true;
  }

  // 8. Professional identity
  if (!profile.professionalProfile.professionalIdentities.confirmed) {
    const options = professionalIdentityOptions(profile);
    return {
      phase: "professional_identity",
      field: "professionalProfile.professionalIdentities",
      questionKey: "professional_identity",
      prompt: "Based on the resume, suggest professional identities. Ask which feels closest.",
      answerType: "single_select",
      pills: [
        ...options.map((r, i) => ({ label: r, value: r, action: "set_field" as const, field: "professionalProfile.professionalIdentities", recommended: i === 0 })),
        { label: "Not sure", value: "not_sure", action: "set_field" as const, field: "professionalProfile.professionalIdentities" },
        { label: "Other", value: "other", action: "ask_text" as const, field: "professionalProfile.professionalIdentities" },
      ],
      skipAllowed: false,
      whyAsked: "This helps position future resumes correctly.",
    };
  }

  // 9. Career direction
  if (!profile.careerIntent.careerDirection.confirmed) {
    const crossDomain = hasAiEducation(profile) && hasSoftwareExperience(profile);
    return {
      phase: "career_direction",
      field: "careerIntent.careerDirection",
      questionKey: "career_direction",
      prompt: crossDomain
        ? "Their education points to AI/ML while their experience is software engineering. Ask if they are pursuing AI/ML, software engineering, or a hybrid direction."
        : "Ask if they want to continue in the same direction or shift.",
      answerType: "single_select",
      pills: crossDomain
        ? [
            { label: "Target AI/ML roles", value: "major_switch", action: "set_field", field: "careerIntent.careerDirection", recommended: true },
            { label: "Hybrid AI + SWE roles", value: "slight_shift", action: "set_field", field: "careerIntent.careerDirection" },
            { label: "Stay in SWE", value: "same", action: "set_field", field: "careerIntent.careerDirection" },
            { label: "Not sure yet", value: "not_sure", action: "set_field", field: "careerIntent.careerDirection" },
          ]
        : [
            { label: "Same direction", value: "same", action: "set_field", field: "careerIntent.careerDirection", recommended: true },
            { label: "Slight shift", value: "slight_shift", action: "set_field", field: "careerIntent.careerDirection" },
            { label: "Major career switch", value: "major_switch", action: "set_field", field: "careerIntent.careerDirection" },
            { label: "Not sure", value: "not_sure", action: "set_field", field: "careerIntent.careerDirection" },
          ],
      skipAllowed: true,
      whyAsked: "This changes how I frame your experience in resumes.",
    };
  }

  // 10. Interested roles
  if (!profile.careerIntent.interestedRoles.confirmed) {
    const inferred = roleInterestOptions(profile);
    const selected = new Set(profile.careerIntent.interestedRoles.value.map((role) => role.toLowerCase()));
    return {
      phase: "role_interests",
      field: "careerIntent.interestedRoles",
      questionKey: "role_interests",
      prompt: "Ask which roles Retuned should keep in mind for future resumes.",
      answerType: "multi_select",
      pills: [
        ...inferred.map(r => ({ label: r, value: r, action: "set_field" as const, field: "careerIntent.interestedRoles", selected: selected.has(r.toLowerCase()) })),
        { label: "Other", value: "other", action: "ask_text" as const, field: "careerIntent.interestedRoles" },
        { label: "Continue", value: "confirm_roles", action: "confirm_field" as const, field: "careerIntent.interestedRoles", recommended: profile.careerIntent.interestedRoles.value.length > 0 },
      ],
      skipAllowed: true,
      whyAsked: "Helps tailor keywords and achievements for the right roles.",
    };
  }

  // 11. Preferred markets
  if (!profile.careerIntent.preferredMarkets.confirmed) {
    const location = profile.identity.location.value;
    const inferredCountry = location?.split(",").pop()?.trim();
    const selected = new Set(profile.careerIntent.preferredMarkets.value.map((market) => market.toLowerCase()));
    return {
      phase: "market_preferences",
      field: "careerIntent.preferredMarkets",
      questionKey: "market_preferences",
      prompt: "Ask which job markets they're interested in.",
      answerType: "multi_select",
      pills: [
        ...(inferredCountry ? [{ label: inferredCountry, value: inferredCountry, action: "set_field" as const, field: "careerIntent.preferredMarkets", recommended: true, selected: selected.has(inferredCountry.toLowerCase()) }] : []),
        { label: "UK", value: "UK", action: "set_field" as const, field: "careerIntent.preferredMarkets", selected: selected.has("uk") },
        { label: "EU Remote", value: "EU Remote", action: "set_field" as const, field: "careerIntent.preferredMarkets", selected: selected.has("eu remote") },
        { label: "India", value: "India", action: "set_field" as const, field: "careerIntent.preferredMarkets", selected: selected.has("india") },
        { label: "Other", value: "other", action: "ask_text", field: "careerIntent.preferredMarkets" },
        { label: "Continue", value: "confirm_markets", action: "confirm_field", field: "careerIntent.preferredMarkets", recommended: profile.careerIntent.preferredMarkets.value.length > 0 },
      ],
      skipAllowed: true,
      whyAsked: "Resume format and keywords differ by market.",
    };
  }

  // 12. Work preference
  if (!profile.careerIntent.workPreference.confirmed) {
    return {
      phase: "work_preferences",
      field: "careerIntent.workPreference",
      questionKey: "work_preferences",
      prompt: "Ask what work setup they prefer.",
      answerType: "single_select",
      pills: [
        { label: "Remote", value: "remote", action: "set_field", field: "careerIntent.workPreference" },
        { label: "Hybrid", value: "hybrid", action: "set_field", field: "careerIntent.workPreference" },
        { label: "On-site", value: "onsite", action: "set_field", field: "careerIntent.workPreference" },
        { label: "Open to all", value: "open", action: "set_field", field: "careerIntent.workPreference", recommended: true },
      ],
      skipAllowed: true,
      whyAsked: "Helps match you with the right opportunities.",
    };
  }

  // 13. Seniority comfort
  if (!profile.careerIntent.seniorityComfort.confirmed) {
    const selected = new Set(profile.careerIntent.seniorityComfort.value.map((level) => level.toLowerCase()));
    const levels = ["Entry", "Associate", "Mid-level", "Senior IC", "Lead", "Manager", "Open"];
    return {
      phase: "seniority_comfort",
      field: "careerIntent.seniorityComfort",
      questionKey: "seniority_comfort",
      prompt: "Ask which seniority levels they are comfortable targeting.",
      answerType: "multi_select",
      pills: [
        ...levels.map((level) => ({ label: level, value: level, action: "set_field" as const, field: "careerIntent.seniorityComfort", selected: selected.has(level.toLowerCase()) })),
        { label: "Continue", value: "confirm_seniority", action: "confirm_field" as const, field: "careerIntent.seniorityComfort", recommended: profile.careerIntent.seniorityComfort.value.length > 0 },
      ],
      skipAllowed: true,
      whyAsked: "Seniority comfort controls how aggressively future resumes position scope and leadership.",
    };
  }

  // 14. Industries of interest
  if (!profile.careerIntent.industriesOfInterest.confirmed) {
    const profileText = [
      ...profile.professionalProfile.domainExperience.value,
      ...profile.experience.value.map((entry) => entry.industry ?? entry.domain ?? ""),
      ...profile.skills.domainSkills.value,
    ].join(" ").toLowerCase();
    const contextual = [
      profileText.includes("fintech") || profileText.includes("bank") || profileText.includes("payment") ? "Fintech" : "",
      profileText.includes("ai") || profileText.includes("machine learning") ? "AI/ML" : "",
      profileText.includes("health") ? "Healthcare" : "",
      "SaaS",
      "Consulting",
      "Open",
    ].filter(Boolean);
    const options = unique(contextual);
    const selected = new Set(profile.careerIntent.industriesOfInterest.value.map((industry) => industry.toLowerCase()));
    return {
      phase: "industries_of_interest",
      field: "careerIntent.industriesOfInterest",
      questionKey: "industries_of_interest",
      prompt: "Ask which industries Retuned should keep in mind for future resumes.",
      answerType: "multi_select",
      pills: [
        ...options.map((industry, i) => ({ label: industry, value: industry, action: "set_field" as const, field: "careerIntent.industriesOfInterest", recommended: i === 0, selected: selected.has(industry.toLowerCase()) })),
        { label: "Other", value: "other", action: "ask_text" as const, field: "careerIntent.industriesOfInterest" },
        { label: "Continue", value: "confirm_industries", action: "confirm_field" as const, field: "careerIntent.industriesOfInterest", recommended: profile.careerIntent.industriesOfInterest.value.length > 0 },
      ],
      skipAllowed: true,
      whyAsked: "Industry preference changes keywords, examples, and business framing.",
    };
  }

  // 14b. Role dealbreakers
  if (!profile.careerIntent.roleDealbreakers.confirmed) {
    const selected = new Set(profile.careerIntent.roleDealbreakers.value.map((d) => d.toLowerCase()));
    const options = ["No on-call", "No travel", "No relocation", "No consulting", "No startups", "No enterprise"];
    return {
      phase: "role_dealbreakers",
      field: "careerIntent.roleDealbreakers",
      questionKey: "role_dealbreakers",
      prompt: "Ask if there are any roles, companies, or conditions they'd never accept.",
      answerType: "multi_select",
      pills: [
        ...options.map((opt) => ({ label: opt, value: opt, action: "set_field" as const, field: "careerIntent.roleDealbreakers", selected: selected.has(opt.toLowerCase()) })),
        { label: "Other", value: "other", action: "ask_text" as const, field: "careerIntent.roleDealbreakers" },
        { label: "No dealbreakers", value: "confirm_dealbreakers", action: "confirm_field" as const, field: "careerIntent.roleDealbreakers", recommended: true },
      ],
      skipAllowed: true,
      whyAsked: "Dealbreakers help Retuned avoid positioning you for roles you'd reject.",
    };
  }

  // 15. Emphasis areas
  if (!profile.resumeWritingPreferences.emphasisAreas.confirmed) {
    const allSkills = [...profile.skills.technical.value, ...profile.skills.tools.value, ...profile.skills.business.value].slice(0, 6);
    const selected = new Set(profile.resumeWritingPreferences.emphasisAreas.value.map((area) => area.toLowerCase()));
    return {
      phase: "emphasis_preferences",
      field: "resumeWritingPreferences.emphasisAreas",
      questionKey: "emphasis_preferences",
      prompt: "Ask what future resumes should highlight most.",
      answerType: "multi_select",
      pills: [
        ...allSkills.map(s => ({ label: s, value: s, action: "set_field" as const, field: "resumeWritingPreferences.emphasisAreas", selected: selected.has(s.toLowerCase()) })),
        { label: "Business impact", value: "business_impact", action: "set_field" as const, field: "resumeWritingPreferences.emphasisAreas", selected: selected.has("business_impact") },
        { label: "Stakeholder work", value: "stakeholder_work", action: "set_field" as const, field: "resumeWritingPreferences.emphasisAreas", selected: selected.has("stakeholder_work") },
        { label: "Other", value: "other", action: "ask_text" as const, field: "resumeWritingPreferences.emphasisAreas" },
        { label: "Continue", value: "confirm_emphasis", action: "confirm_field" as const, field: "resumeWritingPreferences.emphasisAreas", recommended: profile.resumeWritingPreferences.emphasisAreas.value.length > 0 },
      ],
      skipAllowed: true,
      whyAsked: "Helps prioritize the right skills and achievements.",
    };
  }

  // 16. De-emphasis areas
  if (!profile.resumeWritingPreferences.deEmphasisAreas.confirmed) {
    const selected = new Set(profile.resumeWritingPreferences.deEmphasisAreas.value.map((area) => area.toLowerCase()));
    const options = ["Older roles", "Academic work", "Support tasks", "Management", "Legacy tools", "None"];
    return {
      phase: "de_emphasis_preferences",
      field: "resumeWritingPreferences.deEmphasisAreas",
      questionKey: "de_emphasis_preferences",
      prompt: "Ask what future resumes should avoid over-highlighting.",
      answerType: "multi_select",
      pills: [
        ...options.map((area) => ({ label: area, value: area, action: "set_field" as const, field: "resumeWritingPreferences.deEmphasisAreas", selected: selected.has(area.toLowerCase()) })),
        { label: "Continue", value: "confirm_de_emphasis", action: "confirm_field" as const, field: "resumeWritingPreferences.deEmphasisAreas", recommended: profile.resumeWritingPreferences.deEmphasisAreas.value.length > 0 },
      ],
      skipAllowed: true,
      whyAsked: "This stops future resumes from over-weighting stale or low-signal experience.",
    };
  }

  // 17. Tone preferences
  if (!profile.resumeWritingPreferences.toneSignals.confirmed) {
    const selected = new Set(profile.resumeWritingPreferences.toneSignals.value.map((t) => t.toLowerCase()));
    const options = ["Direct", "Technical", "Conversational", "Formal", "Punchy", "Story-driven"];
    return {
      phase: "tone_preferences",
      field: "resumeWritingPreferences.toneSignals",
      questionKey: "tone_preferences",
      prompt: "Ask what tone future resumes should use.",
      answerType: "multi_select",
      pills: [
        ...options.map((opt) => ({ label: opt, value: opt, action: "set_field" as const, field: "resumeWritingPreferences.toneSignals", selected: selected.has(opt.toLowerCase()) })),
        { label: "Continue", value: "confirm_tone", action: "confirm_field" as const, field: "resumeWritingPreferences.toneSignals", recommended: profile.resumeWritingPreferences.toneSignals.value.length > 0 },
      ],
      skipAllowed: true,
      whyAsked: "Tone signals control how your resume reads — technical vs conversational, punchy vs formal.",
    };
  }

  // 18. Style constraints
  if (!profile.resumeWritingPreferences.styleConstraints.confirmed) {
    const selected = new Set(profile.resumeWritingPreferences.styleConstraints.value.map((s) => s.toLowerCase()));
    const options = ["No buzzwords", "No I/we pronouns", "Active voice only", "No bullet padding", "No jargon", "Keep it concise"];
    return {
      phase: "style_constraints",
      field: "resumeWritingPreferences.styleConstraints",
      questionKey: "style_constraints",
      prompt: "Ask if there's anything to avoid in resume writing style.",
      answerType: "multi_select",
      pills: [
        ...options.map((opt) => ({ label: opt, value: opt, action: "set_field" as const, field: "resumeWritingPreferences.styleConstraints", selected: selected.has(opt.toLowerCase()) })),
        { label: "No constraints", value: "confirm_style", action: "confirm_field" as const, field: "resumeWritingPreferences.styleConstraints", recommended: true },
      ],
      skipAllowed: true,
      whyAsked: "Style constraints prevent future resumes from using patterns you dislike.",
    };
  }

  // 19. Profile ready
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hasIdentityData(p: UserCareerProfile): boolean {
  return !!(p.identity.fullName.value || p.identity.email.value || p.identity.location.value);
}

function hasSkills(p: UserCareerProfile): boolean {
  return (p.skills.technical.value.length + p.skills.tools.value.length + p.skills.business.value.length) > 0;
}
