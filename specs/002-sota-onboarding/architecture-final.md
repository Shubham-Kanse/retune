Below is a **complete SOTA architectural plan for Retuned onboarding**, from first visual interaction to Supabase persistence and dashboard handoff.

This is designed specifically for your product:

```text
Retuned = resume generation AI
Onboarding = build a rich reusable user career profile
Later = use that profile + any JD to generate premium tailored resumes
```

Your current setup has the right direction, but the product logic must be upgraded from a simple chat/form flow into a **resume-first, profile-building, AI-guided onboarding system**.

The core bug in your current flow is already identified correctly: the system behaves like a disconnected fixed-question form instead of using the uploaded resume to parse, summarize, confirm, detect gaps, and ask adaptive questions. 

---

# 1. Product goal

## What onboarding should achieve

The onboarding should not generate a resume yet.

It should build a **Retuned Career Profile**.

That profile should be rich enough that later, when the user pastes any JD, Retuned can generate a resume that feels like:

```text
The user wrote it themselves,
but with the strategy, positioning, and polish of a $300/hr resume writer.
```

So onboarding must collect:

```text
Who the user is
What they have done
What they are good at
What they want next
What should be emphasized
What should be downplayed
What facts are confirmed
What facts are inferred
What facts are missing
```

---

# 2. Current setup problems to fix

Your current issue file correctly identifies the major bugs:

```text
Resume context is not passed to AI
Blank messages appear in chat
Question order is wrong
Extracted data is not confirmed
Pills are generic instead of resume-aware
The chat has no personality or framing
```

The biggest technical issue is that extracted profile data is merged into `profile_delta`, but the AI context only sees field status like `✓/✗`, not the actual extracted values. That is why it cannot say “I found Galway, Ireland” and instead asks the user for the same information again. 

Your newer architecture correctly moves toward:

```text
Backend planner decides phase → LLM writes message → UI renders structured pills
```

That should remain the foundation. 

---

# 3. SOTA onboarding principle

The entire onboarding system should follow this rule:

```text
Extract first.
Summarize second.
Confirm third.
Ask only what is missing.
Enrich only after must-haves are done.
```

Bad flow:

```text
What is your email?
What is your city?
What is your country?
What is your experience?
What is your education?
```

SOTA flow:

```text
I reviewed your resume and found your email, Galway, Ireland, 2 roles, MSc education, and skills in SQL, Power BI, D365, and Java.

I’ll quickly confirm these, then ask a few questions about your career direction so future resumes can be tailored properly.
```

---

# 4. End-to-end user journey

## Stage 1: Orb intro

The user signs up and lands on `/onboarding`.

The orb appears first. It should feel premium, calm, and intelligent, not like a boring upload form.

### Visual feel

```text
Dark or soft gradient background
Central animated orb
Subtle glow
Smooth typing animation
Minimal text
One clear CTA
No clutter
```

### Orb message

```text
Hi, I’m Retuned.

I’ll turn your existing resume into a rich career profile, then use that profile later to create tailored resumes for any job description.

Upload your resume and I’ll extract what I can, show you what I found, and ask only the questions needed to complete your profile.
```

### CTA

```text
Upload resume
```

Remove:

```text
Build from scratch
Start typing
Skip upload
```

Since your product is resume-first, resume upload should be mandatory.

---

## Stage 2: Resume upload

After clicking upload, show a polished upload card.

### Upload card should include

```text
Supported formats: PDF, DOCX
Max file size
Privacy reassurance
Progress state
Error state
```

Example copy:

```text
Upload your latest resume. I’ll extract your experience, education, skills, and contact details to build your Retuned profile.
```

### Upload states

```text
Idle
Uploading
Parsing
Extracting profile
Building draft profile
Ready to review
Failed
```

Do not just show a spinner. Use meaningful progress:

```text
Reading your resume...
Finding experience...
Extracting skills...
Building your draft profile...
```

---

## Stage 3: Resume parsing

Backend should create a formal parser result.

```ts
interface ResumeParseResult {
  resumeFileId: string;
  parserVersion: string;
  rawText: string;
  extractedProfile: Partial<UserCareerProfile>;
  parseQuality: ParseQuality;
  warnings: string[];
  createdAt: string;
}
```

```ts
interface ParseQuality {
  score: number; // 0-1
  hasIdentity: boolean;
  hasExperience: boolean;
  hasEducation: boolean;
  hasSkills: boolean;
  weakAreas: string[];
}
```

### Parse quality thresholds

```text
0.75–1.00 = normal resume-aware onboarding
0.45–0.74 = partial extraction flow
0.00–0.44 = recovery flow
```

### Recovery if parsing fails

If resume upload succeeds but parsing fails:

```text
I received your resume, but I couldn’t extract enough detail from it. You can upload a clearer version or paste the resume text.
```

Pills:

```text
Upload another file
Paste resume text
Try anyway
```

Since you are removing build-from-scratch, do not offer a generic “start manually” path as the primary option. Use it only as recovery.

---

# 5. Stage 4: Resume summary moment

This is one of the most important moments in the product.

The user must feel:

```text
“Oh, this actually read my resume.”
```

### AI message

```text
I’ve reviewed your resume and created a draft profile. I found your location, education, experience, and key skills. I’ll show you what I extracted, then ask a few quick questions to make your profile stronger for future resume generation.
```

If specific values exist:

```text
I found Galway, Ireland as your location, experience in Business Analysis and SQL, education from University of Galway, and skills like Power BI, D365, Jira, and Confluence.
```

### UI should show extraction cards

```text
Identity
Name, email, location

Experience
Role cards

Education
Degree cards

Skills
Grouped skill chips

Profile completeness
Initial score
```

Do not show raw JSON or long text.

---

# 6. SOTA layout

Onboarding should not be only a chat.

Use a **three-layer interface**.

## Recommended layout

```text
-------------------------------------------------
|                 Retuned Orb / Header           |
-------------------------------------------------
| AI Chat / Questions       | Live Profile Panel |
|                           |                    |
| Message                   | Identity           |
| Cards                     | Experience         |
| Pills                     | Education          |
| Input                     | Skills             |
|                           | Career Intent      |
-------------------------------------------------
```

## Left side: AI chat

Used for:

```text
Friendly guidance
Questions
Confirmations
Explanations
Pills
Free text input
```

## Right side: live profile preview

Used for:

```text
Profile completeness
Extracted identity
Experience status
Education status
Skills status
Career intent status
Warnings
Missing fields
```

The user should always see the profile being built.

---

# 7. Correct onboarding phases

Your current final file uses profile-only phases like greeting, resume summary, identity, experience, education, skills, fill gaps, profile ready. 

That is a good base, but for Retuned it is incomplete because you also need reusable career intelligence.

Use this final phase list:

```ts
type OnboardingPhase =
  | "orb_intro"
  | "resume_upload"
  | "resume_parsing"
  | "resume_summary"
  | "identity_confirm"
  | "experience_confirm"
  | "education_confirm"
  | "skills_confirm"
  | "professional_identity"
  | "career_direction"
  | "role_interests"
  | "market_preferences"
  | "work_preferences"
  | "seniority_comfort"
  | "emphasis_preferences"
  | "profile_gap_fill"
  | "profile_ready"
  | "profile_enhancement"
  | "dashboard_handoff";
```

## Final phase order

```text
orb_intro
resume_upload
resume_parsing
resume_summary
identity_confirm
experience_confirm
education_confirm
skills_confirm
professional_identity
career_direction
role_interests
market_preferences
work_preferences
seniority_comfort
emphasis_preferences
profile_gap_fill
profile_ready
profile_enhancement
dashboard_handoff
```

---

# 8. Backend architecture

The correct architecture is:

```text
Frontend event
↓
API route
↓
Session store fetch
↓
Planner decides next phase
↓
LLM writes message only
↓
Backend returns structured UI payload
↓
Frontend renders chat + cards + pills
↓
User responds
↓
Backend updates profile
↓
Autosave to Supabase session
↓
Planner continues
```

The LLM must not control the phase order.

## Correct division of responsibility

### Backend owns

```text
Current phase
Next question
Question key
Which field is being collected
Which pills are shown
Which cards are shown
What happens when a pill is clicked
Whether a field is complete
Whether onboarding can finish
Persistence
Validation
Normalization
Deduplication
Recovery
```

### LLM owns

```text
Natural message wording
Short friendly explanations
Parsing free-text answers into structured updates
Suggesting human-like phrasing
```

The LLM is a copywriter and extractor, not the controller.

---

# 9. Core data model

## Profile field wrapper

Every important field should use provenance, confidence, and confirmation.

```ts
interface ProfileField<T> {
  value: T;
  source: "resume" | "user" | "ai_inferred" | "system";
  confidence: number;
  confirmed: boolean;
  lastUpdatedAt: string;
}
```

## Merge priority

```text
user-confirmed
>
user-entered
>
resume-extracted
>
ai-inferred
>
system-default
```

This prevents a later resume re-parse from overwriting the user’s confirmed edits.

---

# 10. Retuned User Career Profile

This is what onboarding stores in Supabase.

```ts
interface UserCareerProfile {
  id: string;
  userId: string;

  identity: {
    fullName: ProfileField<string>;
    email: ProfileField<string>;
    phone?: ProfileField<string>;
    location: ProfileField<string>;
    linkedin?: ProfileField<string>;
    github?: ProfileField<string>;
    portfolio?: ProfileField<string>;
  };

  professionalProfile: {
    currentTitles: ProfileField<string[]>;
    professionalIdentities: ProfileField<string[]>;
    yearsOfExperience?: ProfileField<number>;
    summarySignals: ProfileField<string[]>;
    domainExperience: ProfileField<string[]>;
  };

  experience: ProfileField<ExperienceEntry[]>;

  education: ProfileField<EducationEntry[]>;

  skills: {
    technical: ProfileField<string[]>;
    tools: ProfileField<string[]>;
    business: ProfileField<string[]>;
    methodologies: ProfileField<string[]>;
    softSkills: ProfileField<string[]>;
    domainSkills: ProfileField<string[]>;
  };

  projects: ProfileField<ProjectEntry[]>;

  certifications: ProfileField<CertificationEntry[]>;

  careerIntent: {
    interestedRoles: ProfileField<string[]>;
    careerDirection: ProfileField<
      "same" | "slight_shift" | "major_switch" | "not_sure"
    >;
    preferredMarkets: ProfileField<string[]>;
    workPreference: ProfileField<"remote" | "hybrid" | "onsite" | "open">;
    seniorityComfort: ProfileField<string[]>;
    industriesOfInterest: ProfileField<string[]>;
  };

  resumeWritingPreferences: {
    emphasisAreas: ProfileField<string[]>;
    deEmphasisAreas: ProfileField<string[]>;
    toneSignals?: ProfileField<string[]>;
  };

  onboarding: OnboardingMeta;
  completeness: ProfileCompleteness;
  createdAt: string;
  updatedAt: string;
}
```

---

# 11. Experience entry model

```ts
interface ExperienceEntry {
  id: string;
  title: string;
  company: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  responsibilities: string[];
  achievements: string[];
  tools: string[];
  skills: string[];
  domain?: string;
  confidence?: number;
}
```

For onboarding, do **not** require 3 perfect bullets per role.

Your current plan says experience should require `title + company + dates + ≥3 bullets`. 

That is too strict.

Use this instead:

```text
Minimum for dashboard:
title + company + rough dates OR current marker + at least one useful responsibility/description
```

Later, profile enhancement can improve bullets.

---

# 12. Education model

```ts
interface EducationEntry {
  id: string;
  degree: string;
  institution: string;
  fieldOfStudy?: string;
  startDate?: string;
  endDate?: string;
  graduationYear?: string;
  location?: string;
  grade?: string;
}
```

---

# 13. Onboarding metadata

```ts
interface OnboardingMeta {
  currentPhase: OnboardingPhase;
  lastQuestionKey?: string;
  answeredQuestionKeys: string[];
  skippedQuestionKeys: SkippedQuestion[];
  resumeUploaded: boolean;
  resumeParsed: boolean;
  resumeSummarized: boolean;
  identityConfirmed: boolean;
  experienceConfirmed: boolean;
  educationConfirmed: boolean;
  skillsConfirmed: boolean;
  pendingTextInput?: PendingTextInput;
  enhancementTurns: number;
}
```

```ts
interface SkippedQuestion {
  questionKey: string;
  field: string;
  skippedAt: string;
  skipScope: "this_session" | "this_profile" | "ask_later";
}
```

```ts
interface PendingTextInput {
  field: string;
  questionKey: string;
  expectedFormat:
    | "name"
    | "email"
    | "phone"
    | "location"
    | "experience"
    | "education"
    | "skills"
    | "role"
    | "market"
    | "general_text";
}
```

---

# 14. Structured question object

The planner should always return structured UI instructions.

```ts
interface OnboardingQuestion {
  phase: OnboardingPhase;
  field: string;
  questionKey: string;
  prompt: string;
  answerType: "single_select" | "multi_select" | "text" | "confirm";
  pills: Pill[];
  cards?: DisplayCard[];
  skipAllowed: boolean;
  whyAsked?: string;
}
```

```ts
interface Pill {
  label: string;
  value: string;
  action:
    | "set_field"
    | "confirm_field"
    | "ask_text"
    | "skip"
    | "navigate"
    | "edit_card"
    | "remove_card";
  recommended?: boolean;
  reason?: string;
}
```

```ts
interface DisplayCard {
  type: "identity" | "experience" | "education" | "skill_group" | "project" | "certification";
  id?: string;
  title: string;
  subtitle?: string;
  metadata?: string[];
  confidence?: number;
  status?: "extracted" | "confirmed" | "needs_review" | "missing";
}
```

---

# 15. Planner logic

Use deterministic phase planning.

```ts
function planNextQuestion(
  profile: UserCareerProfile,
  meta: OnboardingMeta
): OnboardingQuestion | null {
  if (!meta.resumeUploaded) return askResumeUpload();

  if (meta.resumeUploaded && !meta.resumeParsed) {
    return handleParsingOrRecovery(profile, meta);
  }

  if (meta.resumeParsed && !meta.resumeSummarized) {
    return summarizeResume(profile);
  }

  if (!meta.identityConfirmed) {
    return confirmIdentity(profile);
  }

  if (!meta.experienceConfirmed) {
    return confirmExperience(profile);
  }

  if (!meta.educationConfirmed) {
    return confirmEducation(profile);
  }

  if (!meta.skillsConfirmed) {
    return confirmSkills(profile);
  }

  if (!profile.professionalProfile.professionalIdentities.confirmed) {
    return askProfessionalIdentity(profile);
  }

  if (!profile.careerIntent.careerDirection.confirmed) {
    return askCareerDirection(profile);
  }

  if (!profile.careerIntent.interestedRoles.confirmed) {
    return askInterestedRoles(profile);
  }

  if (!profile.careerIntent.preferredMarkets.confirmed) {
    return askPreferredMarkets(profile);
  }

  if (!profile.careerIntent.workPreference.confirmed) {
    return askWorkPreference(profile);
  }

  if (!profile.careerIntent.seniorityComfort.confirmed) {
    return askSeniorityComfort(profile);
  }

  if (!profile.resumeWritingPreferences.emphasisAreas.confirmed) {
    return askEmphasisAreas(profile);
  }

  const gaps = getMissingMustHaves(profile);
  if (gaps.length > 0) {
    return askGap(gaps[0], profile);
  }

  return null;
}
```

When planner returns `null`, onboarding moves to:

```text
profile_ready
```

---

# 16. LLM prompt design

The LLM should receive:

```text
[ROLE]
You are Retuned’s onboarding copywriter.

[IMPORTANT]
Do not decide the next question.
Do not create new pills.
Do not ask extra questions.
Write only the message for the planner-provided question.

[QUESTION]
Phase: experience_confirm
Question key: confirm_experience
Prompt: Show extracted experience and ask if correct.
Why asked: This helps ensure future resumes use accurate work history.

[PROFILE CONTEXT]
Only the phase-relevant extracted values.

[OUTPUT RULES]
1–2 sentences.
Warm, clear, premium.
No generic filler.
No internal metadata.
No confidence numbers.
```

The LLM should return only:

```json
{
  "message": "I found two experience entries from your resume. Please review them so I can make sure future resumes use the right work history."
}
```

Pills and cards come from the backend.

---

# 17. Phase-specific context injection

Do not dump the entire profile into the LLM every time.

Use:

```ts
buildProfileContext(profile, phase)
```

Examples:

## For identity confirmation

Inject:

```text
Name
Email
Phone
Location
LinkedIn
```

## For experience confirmation

Inject:

```text
Experience entries
Titles
Companies
Dates
Responsibilities
Skills
```

## For career direction

Inject:

```text
Titles
Skills
Domains
Education
Inferred possible identities
```

This avoids privacy leaks and keeps the LLM focused.

---

# 18. Must-have fields before dashboard

For Retuned, the user can go to dashboard when the profile is good enough for future resume generation.

## Hard must-haves

```text
Resume uploaded
Resume parsed or recovered with enough text
Full name
Email
Location or preferred base location
At least one experience/project entry
At least one education entry, unless unavailable
Core skills
Experience reviewed or confirmed
Education reviewed or confirmed
Skills reviewed or confirmed
Professional identity selected or inferred
Interested roles selected or inferred
Preferred market selected or inferred
Work preference selected or marked open
Profile completeness score above threshold
```

## Do not make these hard blockers

```text
Phone
LinkedIn
GitHub
Portfolio
Certifications
Projects
3 bullets per role
Measurable achievements
Salary expectations
Notice period
Resume style
Specific JD
```

---

# 19. Strongly recommended during onboarding

These improve future resume generation a lot:

```text
Career direction
Seniority comfort
Top skills to emphasize
Industries of interest
Phone
LinkedIn
Projects
Certifications
Measurable achievements
```

Ask them only after must-haves are handled or as quick pills.

---

# 20. Good-to-have after onboarding

Move these to dashboard/profile enhancement:

```text
Detailed achievements
Portfolio/GitHub
Languages
Awards
Volunteer work
Salary expectations
Notice period
Companies of interest
Roles to avoid
Resume style preferences
One-page/two-page preference
Cover letter preferences
LinkedIn headline
Personal brand tone
```

---

# 21. Profile readiness

Replace resume readiness with profile readiness.

```ts
interface ProfileReadiness {
  canEnterDashboard: boolean;
  score: number;
  blockers: string[];
  warnings: string[];
  suggestions: string[];
  completedCategories: {
    identity: number;
    experience: number;
    education: number;
    skills: number;
    professionalProfile: number;
    careerIntent: number;
    resumeWritingSignals: number;
  };
}
```

Example:

```json
{
  "canEnterDashboard": true,
  "score": 84,
  "blockers": [],
  "warnings": ["LinkedIn not added", "Only one achievement found"],
  "suggestions": [
    "Add 2–3 measurable achievements later",
    "Add certifications to strengthen your profile"
  ]
}
```

---

# 22. Career intelligence questions

These are essential for Retuned.

## Professional identity

```text
Based on your resume, I can position you a few ways. Which one feels closest?
```

Pills inferred from resume:

```text
Business Analyst
Data Analyst
D365 Functional Consultant
SQL Developer
Software Engineer
Not sure
```

## Career direction

```text
Are you looking to continue in the same direction or shift into something new?
```

Pills:

```text
Same direction
Slight shift
Major career switch
Not sure
```

## Interested roles

```text
Which roles should Retuned keep in mind for future resumes?
```

Pills:

```text
Business Analyst
Data Analyst
BI Analyst
D365 Consultant
SQL Developer
Other
```

Multi-select.

## Preferred market

```text
Which job markets are you interested in?
```

Pills:

```text
Ireland
UK
EU Remote
India
Other
```

Multi-select.

## Work preference

```text
What work setup do you prefer?
```

Pills:

```text
Remote
Hybrid
On-site
Open to all
```

## Emphasis areas

```text
What should future resumes highlight most?
```

Pills inferred from resume:

```text
SQL/data analysis
Power BI dashboards
Requirements gathering
Stakeholder management
D365/CRM
UAT/testing
Java/backend work
```

Multi-select.

## De-emphasis areas

Ask only if useful:

```text
Anything you’d rather downplay in future resumes?
```

Pills:

```text
Older roles
Unrelated tools
Academic projects
Retail experience
Nothing for now
```

---

# 23. Skill grouping

Do not store skills in one flat array only.

Group them:

```text
Technical skills
Tools/platforms
Business skills
Methodologies
Soft skills
Domain skills
```

Example:

```json
{
  "technical": ["SQL", "Python", "Java"],
  "tools": ["Power BI", "Jira", "Confluence", "D365"],
  "business": ["Requirements Gathering", "UAT", "Stakeholder Management"],
  "methodologies": ["Agile", "Scrum"],
  "softSkills": ["Communication", "Problem Solving"],
  "domainSkills": ["Utilities", "Telecom", "Banking"]
}
```

This will massively improve later resume generation.

---

# 24. Role inference

Backend should infer possible roles using deterministic rules.

```ts
const ROLE_RULES = {
  businessAnalysis: {
    titles: ["business analyst", "functional consultant", "systems analyst"],
    skills: ["requirements", "uat", "jira", "confluence", "stakeholder", "process mapping"],
    roles: ["Business Analyst", "Functional Consultant", "Systems Analyst"]
  },
  data: {
    titles: ["data analyst", "bi analyst", "reporting analyst"],
    skills: ["sql", "power bi", "tableau", "excel", "dashboard", "analytics"],
    roles: ["Data Analyst", "BI Analyst", "Reporting Analyst"]
  },
  d365: {
    titles: ["d365", "dynamics", "crm consultant", "functional consultant"],
    skills: ["dynamics 365", "power platform", "power apps", "dataverse", "customer service"],
    roles: ["D365 Functional Consultant", "Power Platform Consultant"]
  },
  software: {
    titles: ["software engineer", "developer", "backend developer"],
    skills: ["java", "spring boot", "rest api", "microservices", "docker", "aws"],
    roles: ["Software Engineer", "Backend Developer", "Java Developer"]
  }
};
```

Use this to generate pills.

Do not let the LLM randomly invent pills.

---

# 25. Validation layer

Before saving fields, validate them.

```ts
interface FieldValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
```

Validation examples:

```text
Email must be valid
Phone must be plausible
LinkedIn must be valid URL
Experience dates must be logical
End date cannot be before start date
Skills cannot be duplicates
Location should include country or market
```

---

# 26. Normalization layer

Normalize before storing.

Examples:

```text
springboot → Spring Boot
reactjs → React
js → JavaScript
uk → UK
ireland → Ireland
galway ireland → Galway, Ireland
powerbi → Power BI
d365 → Dynamics 365
```

Recommended files:

```text
normalizers/
├── normalize-email.ts
├── normalize-phone.ts
├── normalize-location.ts
├── normalize-skills.ts
├── normalize-role.ts
├── normalize-date.ts
├── normalize-url.ts
└── normalize-company.ts
```

---

# 27. Conflict resolution

If the resume says one thing and the user says another, user wins, but record the conflict.

```ts
interface ProfileConflict {
  field: string;
  existingValue: unknown;
  newValue: unknown;
  existingSource: string;
  newSource: string;
  resolution: "user_override" | "kept_existing" | "merged";
  createdAt: string;
}
```

Example:

```text
Resume says Galway, Ireland.
User changes it to Dublin, Ireland.

AI:
Got it, I’ll use Dublin, Ireland as your profile location.
```

---

# 28. Guardrails

## Input guardrails

```text
Reject empty user messages
Reject empty pill payloads
Validate questionKey exists
Validate selected pill belongs to current question
Validate pendingTextInput before routing text
```

## Output guardrails

```text
Do not push blank assistant message
Do not push duplicate assistant message
Do not show internal metadata
Do not let LLM ask a different question
Do not let LLM create extra pills
Do not let LLM ask for already-confirmed fields
```

If LLM output fails validation, use deterministic fallback templates.

---

# 29. Fallback templates

Always have a fallback message for every phase.

```ts
const QUESTION_TEMPLATES = {
  resume_summary:
    "I’ve reviewed your resume and created a draft profile. Let’s quickly confirm what I found.",
  identity_confirm:
    "I found your basic details from the resume. Do these look correct?",
  experience_confirm:
    "I found your work experience. Please review it so I can use the right details later.",
  education_confirm:
    "I found your education details. Should I keep these?",
  skills_confirm:
    "I found these skills from your resume. Which ones should I keep?",
  professional_identity:
    "Based on your resume, I can position you a few ways. Which feels closest?",
  career_direction:
    "Are you continuing in the same direction or shifting into something new?"
};
```

This prevents blank or broken chat responses.

---

# 30. Supabase storage plan

## Recommended tables

```text
profiles
profile_experience
profile_education
profile_skills
profile_projects
profile_certifications
profile_career_intent
onboarding_sessions
onboarding_events
resume_files
profile_conflicts
```

## Simple v1 option

For faster implementation, store main profile as JSONB:

```text
profiles
- id
- user_id
- profile_json
- completeness_score
- completeness_tier
- onboarding_completed
- created_at
- updated_at
```

But still store events separately:

```text
onboarding_events
- id
- user_id
- session_id
- event_type
- payload
- created_at
```

Events are crucial for debugging.

---

# 31. Event audit log

Create an event every time something meaningful happens.

```ts
interface OnboardingEvent {
  id: string;
  userId: string;
  sessionId: string;
  type:
    | "resume_uploaded"
    | "resume_parse_started"
    | "resume_parsed"
    | "parse_failed"
    | "question_planned"
    | "message_generated"
    | "pill_clicked"
    | "text_submitted"
    | "field_updated"
    | "field_confirmed"
    | "question_skipped"
    | "profile_ready"
    | "dashboard_handoff";
  payload: unknown;
  createdAt: string;
}
```

This will help debug exactly why the AI asked something.

---

# 32. Autosave and checkpointing

Do not wait until the end to save everything.

Save after every confirmed answer.

Use two levels:

```text
onboarding_sessions = temporary progress
profiles = final profile
```

When profile is ready:

```text
Persist cleaned profile to profiles table
Mark onboarding_completed = true
Redirect to dashboard
```

If the user refreshes:

```text
Welcome back. I found your profile setup was 68% complete. Let’s continue from your skills review.
```

Pills:

```text
Continue
Review profile
Start over
```

---

# 33. Dashboard handoff

When ready:

```text
Your Retuned profile is ready. I’ve saved your experience, education, skills, and career direction so future resumes can be tailored faster and more accurately.
```

Buttons:

```text
Go to dashboard
Improve profile
Create first resume
```

For onboarding, primary CTA should be:

```text
Go to dashboard
```

But a secondary CTA can be:

```text
Create first resume
```

---

# 34. Current setup fixes

Based on your current issues and plan, these are the concrete fixes.

## Fix 1: Replace `buildProfileStatus` with full context

Current bug:

```text
AI only sees ✓/✗, not values.
```

Fix:

```ts
buildProfileContext(profile, phase)
```

It should include actual values.

Example:

```text
Known:
Name: Komal Andharikar
Location: Galway, Ireland
Skills: SQL, Power BI, D365, Jira
Experience:
- Technical Business Analyst at Cognizant
Education:
- MSc Business Analytics, University of Galway
```

---

## Fix 2: Add deterministic planner

Do not let the prompt ask “next missing field.”

Add:

```text
planner.ts
```

It should decide the phase and question.

---

## Fix 3: Add structured UI payload

API should return:

```ts
interface OnboardingTurnResponse {
  message: string;
  question?: OnboardingQuestion;
  profilePreview: ProfilePreview;
  readiness: ProfileReadiness;
  state: OnboardingPhase;
}
```

Frontend renders from this.

---

## Fix 4: Fix blank messages

Backend:

```ts
if (!assistantMessage?.trim()) {
  assistantMessage = fallbackTemplate(question.questionKey);
}

if (assistantMessage.trim()) {
  pushMessage(assistantMessage);
}
```

Frontend:

```ts
const visibleMessages = messages.filter(m => m.content?.trim());
```

---

## Fix 5: Fix duplicate messages

```ts
if (normalize(newMessage) === normalize(lastAssistantMessage)) {
  return;
}
```

Also prevent duplicate question keys:

```ts
if (meta.answeredQuestionKeys.includes(question.questionKey)) {
  planNextQuestion(profile, meta);
}
```

---

## Fix 6: Add pending text routing

When user clicks `Edit`, `Other`, or `Change`, set:

```ts
pendingTextInput
```

Then the next typed message updates the correct field.

---

## Fix 7: Add display cards

Experience, education, and skills should be shown as structured cards, not chat paragraphs.

---

## Fix 8: Add profile preview panel

Show live profile completeness and confirmed sections.

---

## Fix 9: Add role/career intelligence

Your current plan says onboarding does not collect target role/market. 

Change that to:

```text
Do not collect specific JD or resume task.
Do collect general interested roles, markets, work preference, career direction, and emphasis areas.
```

---

## Fix 10: Save to Supabase properly

Use:

```text
onboarding_sessions for in-progress
profiles for final
onboarding_events for debugging
resume_files for uploaded files
```

---

# 35. Test cases

Minimum regression tests:

```text
1. New user lands on onboarding → orb intro shown
2. Build-from-scratch option is not visible
3. User uploads resume → parser starts
4. Parser succeeds → resume_summary phase returned
5. Parser fails → recovery flow returned
6. Extracted location exists → assistant confirms, does not ask city/country
7. Extracted experience exists → experience cards shown
8. Extracted education exists → education cards shown
9. Extracted skills exist → grouped skills shown
10. User says “get it from resume” → known data used
11. User says “I already uploaded” → system checks resumeUploaded, does not ask upload again
12. User clicks Looks correct → field confirmed
13. User clicks Edit → pendingTextInput set
14. Next typed message updates correct field
15. Blank LLM response → fallback template used
16. Duplicate assistant message → not pushed
17. User skips optional LinkedIn → not asked again immediately
18. User-confirmed field survives resume re-parse
19. Career identity pills generated from resume
20. Interested roles support multi-select
21. Work preference can be set to open
22. Profile readiness blocks dashboard if hard must-haves missing
23. Profile readiness allows dashboard if optional fields missing
24. Profile saved to Supabase on completion
25. User refreshes mid-onboarding → resumes from last phase
26. Dashboard handoff occurs after profile_ready
```

---

# 36. Final implementation order

## Phase A: Stabilize current bugs

```text
1. Stop blank messages
2. Stop duplicate messages
3. Inject actual profile values into AI context
4. Remove build-from-scratch option
5. Add resume upload mandatory flow
```

## Phase B: Add deterministic architecture

```text
6. Create onboarding types
7. Create planner.ts
8. Create structured question payload
9. Make pills backend-generated
10. Add pendingTextInput
```

## Phase C: Improve extraction UX

```text
11. Add resume summary
12. Add display cards
13. Add profile preview panel
14. Add confidence-aware copy
15. Add parser quality recovery
```

## Phase D: Add career intelligence

```text
16. Add professional identity phase
17. Add career direction phase
18. Add interested roles phase
19. Add market/work preference phase
20. Add emphasis/de-emphasis phase
```

## Phase E: Persistence and quality

```text
21. Add validation
22. Add normalization
23. Add conflict resolution
24. Add Supabase persistence
25. Add onboarding events
26. Add profile readiness
```

## Phase F: Tests

```text
27. Add regression tests
28. Add planner unit tests
29. Add merge priority tests
30. Add parser recovery tests
31. Add frontend rendering tests
```

---

# 37. Final SOTA acceptance checklist

```text
[ ] Orb intro feels premium and clearly explains Retuned
[ ] Resume upload is mandatory
[ ] Build-from-scratch is removed from primary flow
[ ] Resume parser returns structured parse result
[ ] Parse quality score exists
[ ] Low-quality parse triggers recovery
[ ] Extracted data is shown back to user
[ ] Experience/education/skills use cards
[ ] AI never asks for fields already extracted without confirming first
[ ] Actual profile values are injected into LLM context
[ ] Backend planner owns phase order
[ ] LLM only writes message copy
[ ] Pills are generated by backend
[ ] Pill actions are structured
[ ] Pending text input works
[ ] Question history prevents repeats
[ ] Blank messages are blocked
[ ] Duplicate messages are blocked
[ ] User-confirmed data cannot be overwritten
[ ] Validation runs before saving
[ ] Normalization runs before saving
[ ] Conflict resolution exists
[ ] Career intelligence is collected
[ ] Profile readiness is category-based
[ ] Optional fields do not block dashboard
[ ] Supabase saves onboarding session continuously
[ ] Final profile is stored after readiness threshold
[ ] Onboarding event log exists
[ ] Dashboard handoff is smooth
[ ] Tests cover all broken flows
```

---

# Final architecture summary

The SOTA Retuned onboarding should work like this:

```text
Orb introduces Retuned
↓
User uploads resume
↓
Resume is parsed
↓
AI shows what it extracted
↓
User confirms identity, experience, education, and skills
↓
AI asks career-intelligence questions
↓
System fills remaining must-have gaps
↓
Profile readiness is calculated
↓
Profile is saved in Supabase
↓
User is sent to dashboard
↓
Later, JD + profile = elite tailored resume
```

The biggest mindset shift is this:

```text
Do not build a chatbot that asks profile questions.
Build a profile extraction and confirmation engine with a conversational AI layer on top.
```

That is the architecture that will make Retuned feel premium, intelligent, and reliable.
