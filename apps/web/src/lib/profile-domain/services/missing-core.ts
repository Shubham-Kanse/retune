import type { ProfileNormalized } from "../contracts";
import type { MissingFieldQuestion } from "../contracts";

function hasMeaningfulExperience(profile: Partial<ProfileNormalized>): boolean {
  return (profile.experience ?? []).some(
    (item) => !!item.company?.trim() && !!item.title?.trim() && !!item.description?.trim()
  );
}

function hasMeaningfulEducation(profile: Partial<ProfileNormalized>): boolean {
  return (profile.education ?? []).some((item) => !!item.degree?.trim() && !!item.institution?.trim());
}

function hasMeaningfulSkills(profile: Partial<ProfileNormalized>): boolean {
  const allSkills = [...(profile.skillsTier1 ?? []), ...(profile.skillsTier2 ?? []), ...(profile.skillsTier3 ?? [])];
  return allSkills.some((item) => !!item.name?.trim());
}

export function buildMissingFieldQuestions(profile: Partial<ProfileNormalized>): MissingFieldQuestion[] {
  const questions: MissingFieldQuestion[] = [];
  if (!profile.fullName?.trim()) {
    questions.push({
      field: "fullName",
      question: "What should we use as your full name on your profile and generated resume?",
      reason: "Name is missing or unreadable in the resume.",
      priority: "high",
      answerType: "text",
    });
  }
  if (!profile.currentTitle?.trim()) {
    questions.push({
      field: "currentTitle",
      question: "What is your current job title?",
      reason: "Current title was not confidently found.",
      priority: "high",
      answerType: "text",
    });
  }
  if (!profile.location?.trim()) {
    questions.push({
      field: "location",
      question: "What is your current location (city, country)?",
      reason: "Location was not found in the resume text.",
      priority: "high",
      answerType: "text",
    });
  }
  if (!profile.targetRoles || profile.targetRoles.length === 0) {
    questions.push({
      field: "targetRoles",
      question: "Which roles are you actively targeting right now?",
      reason: "Target roles are needed for matching and personalization.",
      priority: "high",
      answerType: "multi_select",
    });
  }
  if (!profile.experienceLevel?.trim()) {
    questions.push({
      field: "experienceLevel",
      question: "How many years of professional experience do you have?",
      reason: "Experience level could not be inferred with confidence.",
      priority: "high",
      answerType: "single_select",
    });
  }

  if (!hasMeaningfulExperience(profile)) {
    questions.push({
      field: "experience",
      question: "Can you add at least one recent role with impact bullets and outcomes?",
      reason: "Work history is missing or too thin for reliable matching.",
      priority: "high",
      answerType: "list",
    });
  }

  if (!hasMeaningfulSkills(profile)) {
    questions.push({
      field: "skills",
      question: "List your top technical skills and tools you use confidently.",
      reason: "Skills were sparse or not clearly extractable.",
      priority: "medium",
      answerType: "list",
    });
  }

  if (!hasMeaningfulEducation(profile)) {
    questions.push({
      field: "education",
      question: "Please share your highest education details (degree, institution, year/status).",
      reason: "Education details are missing.",
      priority: "medium",
      answerType: "text",
    });
  }

  if (!profile.summary?.trim()) {
    questions.push({
      field: "summary",
      question: "Write a 2-3 line professional summary focused on your strongest domain and impact.",
      reason: "Summary helps personalize downstream writing and matching quality.",
      priority: "low",
      answerType: "text",
    });
  }

  return questions;
}
