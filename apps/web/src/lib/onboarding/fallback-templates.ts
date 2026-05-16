export const FALLBACK_MESSAGES: Record<string, string> = {
  resume_upload:
    "Upload your resume and I'll extract your experience, education, skills, and contact details.",
  resume_parsing: "Reading your resume…",
  resume_extracting: "Reading your resume — this usually takes 5–15 seconds…",
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
  projects_certifications_review:
    "I found projects and certifications that may help future resumes. Should I keep these?",
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
  industries_of_interest:
    "Which industries should Retuned keep in mind for future resumes?",
  emphasis_preferences:
    "What should future resumes highlight most?",
  de_emphasis_preferences:
    "What should future resumes avoid over-highlighting?",
  role_dealbreakers:
    "Any roles, companies, or conditions you'd never accept?",
  tone_preferences:
    "What tone should future resumes use?",
  style_constraints:
    "Anything to avoid in resume writing style?",
  experience_metrics:
    "Quick win: what was the most measurable impact of your recent work?",
  extras_confirm:
    "I found some additional details — languages, awards, or publications. Should I keep these?",
  profile_ready:
    "Thank you. Your Retuned profile is complete, and I'm taking you to the dashboard now.",
};

export function fallbackFor(questionKey: string): string {
  return FALLBACK_MESSAGES[questionKey] ?? "Let's continue building your Retuned profile.";
}
