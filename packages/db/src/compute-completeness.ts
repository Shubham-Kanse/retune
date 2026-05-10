export function computeCompletenessScore(profileData: Record<string, unknown>): number {
  let score = 0;
  if (profileData.fullName) score += 10;
  if (profileData.email) score += 10;
  if (profileData.phone) score += 5;
  if (profileData.linkedin) score += 5;
  if (profileData.location) score += 10;
  if (profileData.currentTitle) score += 5;
  if ((profileData.targetRoles as unknown[] | undefined)?.length) score += 10;
  if ((profileData.experience as unknown[] | undefined)?.length) score += 20;
  if ((profileData.education as unknown[] | undefined)?.length) score += 10;
  if ((profileData.skillsTier1 as unknown[] | undefined)?.length) score += 10;
  if (profileData.voiceNotes || profileData.summary || profileData.profileMarkdown) score += 5;
  return Math.min(score, 100);
}
