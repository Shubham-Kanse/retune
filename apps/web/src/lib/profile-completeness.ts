import type { CandidateProfile } from "@retune/db";

export function calculateProfileCompleteness(profile: CandidateProfile | null): number {
  if (!profile) return 0;

  let score = 0;
  const totalFields = 0;

  // Required fields (must-haves for quality resume generation)
  const requiredFields = [
    profile.fullName?.trim(),
    profile.email?.trim(),
    profile.location?.trim(),
    profile.targetRoles?.length > 0,
    profile.experience?.length > 0,
  ];

  // Strong fields (highly recommended)
  const strongFields = [
    profile.phone?.trim(),
    profile.linkedin?.trim(),
    profile.education?.length > 0,
    profile.skillsTier1?.length > 0,
  ];

  // Total possible points
  const requiredCount = requiredFields.filter(Boolean).length;
  const strongCount = strongFields.filter(Boolean).length;

  // Scoring: Required fields = 60%, Strong fields = 40%
  score += (requiredCount / 5) * 60; // 5 required fields
  score += (strongCount / 4) * 40; // 4 strong fields

  return Math.min(100, Math.round(score));
}

export function getProfileCompletenessStatus(percentage: number): {
  label: string;
  color: string;
  canGenerate: boolean;
} {
  if (percentage >= 80) {
    return { label: "Complete", color: "text-emerald-500", canGenerate: true };
  }
  if (percentage >= 60) {
    return { label: "Good", color: "text-amber-500", canGenerate: false };
  }
  if (percentage >= 40) {
    return { label: "Fair", color: "text-orange-500", canGenerate: false };
  }
  return { label: "Incomplete", color: "text-red-500", canGenerate: false };
}

export function getProfileCompletenessMessage(percentage: number): string {
  if (percentage >= 80) {
    return "Your profile is complete. Ready to generate!";
  }
  if (percentage >= 60) {
    return `Your profile is ${percentage}% complete. Add more details for better results.`;
  }
  return `Complete your profile (${percentage}% done) to generate resumes. Need: name, email, location, target roles, and work experience.`;
}

export function getMissingProfileFields(
  profile: {
    fullName?: string;
    email?: string;
    location?: string;
    targetRoles?: string[];
    experience?: unknown[];
    phone?: string;
    linkedin?: string;
    education?: unknown[];
    skillsTier1?: unknown[];
  } | null,
): string[] {
  if (!profile) return ["name", "email", "location", "target roles", "experience"];
  const missing: string[] = [];
  if (!profile.fullName?.trim()) missing.push("name");
  if (!profile.email?.trim()) missing.push("email");
  if (!profile.location?.trim()) missing.push("location");
  if (!profile.targetRoles?.length) missing.push("target roles");
  if (!profile.experience?.length) missing.push("experience");
  if (!profile.skillsTier1?.length) missing.push("skills");
  return missing;
}
