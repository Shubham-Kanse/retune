import type { UserCareerProfile, OnboardingMeta, OnboardingQuestion, DisplayCard } from "./types";
import { inferRolesFromProfile } from "./role-inference";

export function planNextQuestion(profile: UserCareerProfile, meta: OnboardingMeta): OnboardingQuestion | null {
  // 1. Resume not uploaded yet
  if (!meta.resumeUploaded) {
    return {
      phase: "resume_upload",
      field: "meta.resumeUploaded",
      questionKey: "resume_upload",
      prompt: "Ask the user to upload their resume.",
      answerType: "single_select",
      pills: [{ label: "Upload resume", value: "upload", action: "navigate" }],
      skipAllowed: false,
      whyAsked: "I need your resume to build your profile.",
    };
  }

  // 2. Resume uploaded but not summarized
  if (meta.resumeParsed && !meta.resumeSummarized) {
    return {
      phase: "resume_summary",
      field: "meta.resumeSummarized",
      questionKey: "resume_summary",
      prompt: "Summarize what was extracted from the resume. Reference specific companies, titles, skills found.",
      answerType: "confirm",
      pills: [
        { label: "Looks good, continue", value: "confirm", action: "confirm_field", recommended: true },
        { label: "Something's wrong", value: "edit", action: "ask_text" },
      ],
      cards: buildSummaryCards(profile),
      skipAllowed: false,
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
        { label: "Looks correct", value: "confirm", action: "confirm_field", recommended: true },
        { label: "Edit details", value: "edit", action: "ask_text" },
      ],
      cards: [{
        type: "identity",
        title: profile.identity.fullName.value || "Your details",
        subtitle: profile.identity.location.value || undefined,
        metadata: [profile.identity.email.value, profile.identity.phone.value].filter(Boolean),
        status: "extracted",
      }],
      skipAllowed: false,
    };
  }

  // 4. Experience confirmation
  if (!meta.experienceConfirmed && profile.experience.value.length > 0) {
    return {
      phase: "experience_confirm",
      field: "experience",
      questionKey: "experience_confirm",
      prompt: "Show extracted experience and ask if correct.",
      answerType: "confirm",
      pills: [
        { label: "Looks correct", value: "confirm", action: "confirm_field", recommended: true },
        { label: "Edit", value: "edit", action: "ask_text" },
        { label: "Add another role", value: "add", action: "ask_text" },
      ],
      cards: profile.experience.value.map(e => ({
        type: "experience" as const,
        id: e.id,
        title: e.title,
        subtitle: `${e.company} · ${e.startDate ?? "?"}–${e.endDate ?? "Present"}`,
        metadata: e.tools.slice(0, 5),
        confidence: e.confidence,
        status: "extracted" as const,
      })),
      skipAllowed: false,
    };
  }

  // 5. Education confirmation
  if (!meta.educationConfirmed && profile.education.value.length > 0) {
    return {
      phase: "education_confirm",
      field: "education",
      questionKey: "education_confirm",
      prompt: "Show extracted education and ask if correct.",
      answerType: "confirm",
      pills: [
        { label: "Looks correct", value: "confirm", action: "confirm_field", recommended: true },
        { label: "Edit", value: "edit", action: "ask_text" },
      ],
      cards: profile.education.value.map(e => ({
        type: "education" as const,
        id: e.id,
        title: e.degree,
        subtitle: `${e.institution}${e.graduationYear ? " · " + e.graduationYear : ""}`,
        status: "extracted" as const,
      })),
      skipAllowed: false,
    };
  }

  // 6. Skills confirmation
  if (!meta.skillsConfirmed && hasSkills(profile)) {
    const allSkills = [...profile.skills.technical.value, ...profile.skills.tools.value, ...profile.skills.business.value].slice(0, 15);
    return {
      phase: "skills_confirm",
      field: "skills",
      questionKey: "skills_confirm",
      prompt: "Show extracted skills and ask if they should be kept.",
      answerType: "confirm",
      pills: [
        { label: "Keep all", value: "confirm", action: "confirm_field", recommended: true },
        { label: "Edit skills", value: "edit", action: "ask_text" },
      ],
      cards: [{
        type: "skill_group",
        title: "Skills found",
        metadata: allSkills,
        status: "extracted",
      }],
      skipAllowed: false,
    };
  }

  // 7. Professional identity
  if (!profile.professionalProfile.professionalIdentities.confirmed) {
    const inferred = inferRolesFromProfile(profile);
    return {
      phase: "professional_identity",
      field: "professionalProfile.professionalIdentities",
      questionKey: "professional_identity",
      prompt: "Based on the resume, suggest professional identities. Ask which feels closest.",
      answerType: "single_select",
      pills: [
        ...inferred.map(r => ({ label: r, value: r, action: "set_field" as const })),
        { label: "Other", value: "other", action: "ask_text" as const },
      ],
      skipAllowed: false,
      whyAsked: "This helps position future resumes correctly.",
    };
  }

  // 8. Career direction
  if (!profile.careerIntent.careerDirection.confirmed) {
    return {
      phase: "career_direction",
      field: "careerIntent.careerDirection",
      questionKey: "career_direction",
      prompt: "Ask if they want to continue in the same direction or shift.",
      answerType: "single_select",
      pills: [
        { label: "Same direction", value: "same", action: "set_field", recommended: true },
        { label: "Slight shift", value: "slight_shift", action: "set_field" },
        { label: "Major career switch", value: "major_switch", action: "set_field" },
        { label: "Not sure", value: "not_sure", action: "set_field" },
      ],
      skipAllowed: true,
      whyAsked: "This changes how I frame your experience in resumes.",
    };
  }

  // 9. Interested roles
  if (!profile.careerIntent.interestedRoles.confirmed) {
    const inferred = inferRolesFromProfile(profile);
    return {
      phase: "role_interests",
      field: "careerIntent.interestedRoles",
      questionKey: "role_interests",
      prompt: "Ask which roles Retuned should keep in mind for future resumes.",
      answerType: "multi_select",
      pills: [
        ...inferred.map(r => ({ label: r, value: r, action: "set_field" as const })),
        { label: "Other", value: "other", action: "ask_text" as const },
      ],
      skipAllowed: true,
      whyAsked: "Helps tailor keywords and achievements for the right roles.",
    };
  }

  // 10. Preferred markets
  if (!profile.careerIntent.preferredMarkets.confirmed) {
    const location = profile.identity.location.value;
    const inferredCountry = location?.split(",").pop()?.trim();
    return {
      phase: "market_preferences",
      field: "careerIntent.preferredMarkets",
      questionKey: "market_preferences",
      prompt: "Ask which job markets they're interested in.",
      answerType: "multi_select",
      pills: [
        ...(inferredCountry ? [{ label: inferredCountry, value: inferredCountry, action: "set_field" as const, recommended: true }] : []),
        { label: "UK", value: "UK", action: "set_field" },
        { label: "EU Remote", value: "EU Remote", action: "set_field" },
        { label: "US", value: "US", action: "set_field" },
        { label: "Other", value: "other", action: "ask_text" },
      ],
      skipAllowed: true,
      whyAsked: "Resume format and keywords differ by market.",
    };
  }

  // 11. Work preference
  if (!profile.careerIntent.workPreference.confirmed) {
    return {
      phase: "work_preferences",
      field: "careerIntent.workPreference",
      questionKey: "work_preferences",
      prompt: "Ask what work setup they prefer.",
      answerType: "single_select",
      pills: [
        { label: "Remote", value: "remote", action: "set_field" },
        { label: "Hybrid", value: "hybrid", action: "set_field" },
        { label: "On-site", value: "onsite", action: "set_field" },
        { label: "Open to all", value: "open", action: "set_field", recommended: true },
      ],
      skipAllowed: true,
      whyAsked: "Helps match you with the right opportunities.",
    };
  }

  // 12. Emphasis areas
  if (!profile.resumeWritingPreferences.emphasisAreas.confirmed) {
    const allSkills = [...profile.skills.technical.value, ...profile.skills.tools.value, ...profile.skills.business.value].slice(0, 6);
    return {
      phase: "emphasis_preferences",
      field: "resumeWritingPreferences.emphasisAreas",
      questionKey: "emphasis_preferences",
      prompt: "Ask what future resumes should highlight most.",
      answerType: "multi_select",
      pills: [
        ...allSkills.map(s => ({ label: s, value: s, action: "set_field" as const })),
        { label: "Other", value: "other", action: "ask_text" as const },
      ],
      skipAllowed: true,
      whyAsked: "Helps prioritize the right skills and achievements.",
    };
  }

  // 13. Profile ready
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hasIdentityData(p: UserCareerProfile): boolean {
  return !!(p.identity.fullName.value || p.identity.email.value || p.identity.location.value);
}

function hasSkills(p: UserCareerProfile): boolean {
  return (p.skills.technical.value.length + p.skills.tools.value.length + p.skills.business.value.length) > 0;
}

function buildSummaryCards(p: UserCareerProfile): DisplayCard[] {
  const cards: DisplayCard[] = [];
  if (hasIdentityData(p)) {
    cards.push({ type: "identity", title: p.identity.fullName.value || "Identity", subtitle: p.identity.location.value || undefined, metadata: [p.identity.email.value].filter(Boolean), status: "extracted" });
  }
  if (p.experience.value.length > 0) {
    cards.push({ type: "experience", title: `${p.experience.value.length} role(s) found`, subtitle: p.experience.value.map(e => `${e.title} at ${e.company}`).join(", "), status: "extracted" });
  }
  if (p.education.value.length > 0) {
    cards.push({ type: "education", title: `${p.education.value.length} education entry(ies)`, subtitle: p.education.value.map(e => `${e.degree} from ${e.institution}`).join(", "), status: "extracted" });
  }
  const skillCount = p.skills.technical.value.length + p.skills.tools.value.length + p.skills.business.value.length;
  if (skillCount > 0) {
    cards.push({ type: "skill_group", title: `${skillCount} skills found`, metadata: [...p.skills.technical.value, ...p.skills.tools.value].slice(0, 8), status: "extracted" });
  }
  return cards;
}
