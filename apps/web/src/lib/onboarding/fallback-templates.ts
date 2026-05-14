export const FALLBACK_MESSAGES: Record<string, string> = {
  resume_upload:
    "Upload your resume and I'll extract your experience, education, skills, and contact details.",
  resume_parsing: "I'm reading your resume now.",
  resume_summary:
    "I've reviewed your resume and created a draft profile. Let's quickly confirm what I found.",
  identity_confirm:
    "I found your basic details from the resume. Do these look correct?",
  experience_confirm:
    "I found your work experience. Please review it so future resumes use the right details.",
  education_confirm:
    "I found your education details. Should I keep these?",
  skills_confirm:
    "I found these skills from your resume. Which ones should I keep?",
  professional_identity:
    "Based on your resume, I can position you a few ways. Which feels closest?",
  career_direction:
    "Are you continuing in the same direction or shifting into something new?",
  role_interests:
    "Which roles should Retuned keep in mind for future resumes?",
  market_preferences:
    "Which job markets are you interested in?",
  work_preferences:
    "What work setup do you prefer?",
  seniority_comfort:
    "What seniority levels are you comfortable targeting?",
  emphasis_preferences:
    "What should future resumes highlight most?",
  profile_ready:
    "Thank you. Your Retuned profile is complete, and I'm taking you to the dashboard now.",
};

export function fallbackFor(questionKey: string): string {
  return FALLBACK_MESSAGES[questionKey] ?? "Let's continue building your Retuned profile.";
}
