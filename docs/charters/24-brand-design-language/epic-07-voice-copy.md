# Charter 24 Epic 07 — Brand Voice & Copy Consistency

**Status:** Spec (2026-05-23)
**Scope:** Every user-facing text string. No visual redesign. Copy only.
**Constraint:** UI style stays exactly as-is.

---

## The Voice

North star: **"We don't auto-fill — we understand."**

- **Precise, not fluffy.** Say what we mean. No filler.
- **Honest, not promotional.** Don't oversell. The product has a refusal gate — the copy should reflect that confidence.
- **Direct, not corporate.** Short sentences. Active voice. No passive constructions.
- **Warm, not cold.** Talk to a person. Use "you" and "we" freely.
- **Confident, not arrogant.** State what we do well plainly. Don't hedge.

### Tone by surface

| Surface | Tone |
|---------|------|
| Landing | Confident + direct. Convince a skeptic in 10 seconds. |
| Auth | Warm + frictionless. Remove anxiety at the gate. |
| Onboarding | Curious + encouraging. First impression of the AI. |
| Dashboard | Calm + purposeful. Returning user, ready to work. |
| Generate (streaming) | Focused + transparent. User is watching work happen. |
| Refused | Precise + actionable. No blame, clear next step. |
| Result | Confident + earned. This is the payoff moment. |
| Profile | Practical + instructive. Data entry that feels worthwhile. |
| Settings | Neutral + informative. Utility, not marketing. |
| Errors / empty states | Honest + helpful. Never strand the user. |

### Vocabulary rules

| Use | Avoid | Reason |
|-----|-------|--------|
| "tuning" | "generation", "application" (as the action noun) | "Tuning" is the product's own word |
| "package" | "output", "resume package" | Shorter, already in refused copy |
| "Retuned" | "Retune" (as a noun/brand name) | The product is called "Retuned". "Retune" is only used as a verb ("we retune your application"). |
| "role" | "job", "position" | More precise |
| "evidence" | "experience" (when meaning proof) | Reflects cognitive-substrate framing |
| "profile" | "resume" (when meaning the Retuned profile) | Distinguishes our profile from the uploaded doc |
| "CV" (en-GB) / "resume" (en-US/en) | mixed | Locale-correct |
| "Cancel anytime" | "Cancel anything" | Grammatically correct |
| "2 free tunings" | "2 free generations" / "Three free applications" | Consistent with actual limit + vocabulary |

---

## Critical Fixes (bugs, not opinions)

### CF-01 — Brand name: "Retuned" is correct everywhere it appears as a noun

The product is called **Retuned**. "Retune" is only used as a verb in copy ("we retune your application", "your career, retuned."). No fixes needed for brand name — the codebase is already consistent.

The previous audit note flagging "Retune" in `en.json` was wrong. Those strings ("Retune needs the network", "Share a Retune workspace", "Choose how Retune talks to you") are actually **incorrect** — they should say "Retuned" because they refer to the product as a noun. These are genuine bugs:

- `en.json` → `errors.offline_body`: "Retune needs the network…" → "Retuned needs the network…"
- `en.json` → `settings.sections.workspaces_sub`: "Share a Retune workspace…" → "Share a Retuned workspace…"
- `en.json` → `settings.sections.language_sub`: "Choose how Retune talks to you." → "Choose how Retuned talks to you."
- Same fixes in `en-US.json` and `en-GB.json`

### CF-02 — Free tier claim mismatch: 2 vs 3
- Landing says "2 free generations". Signup says "Three free applications". One is wrong.
- Audit `FREE_GENERATION_LIMIT` in `.env.example`. Align all surfaces to that number using "tunings".
- Fix: "2 free tunings, no card required." everywhere (or 3 if that's the real limit).

### CF-03 — "Cancel anything" → "Cancel anytime"
- `en.json` → `auth.signup.subtitle`

### CF-04 — Terminology drift: "generation" / "application" → "tuning"
- Every hard-coded string using "generation" or "application" as the action noun gets replaced with "tuning" / "tunings".

### CF-05 — Contest page broken link
- `generate/[id]/contest/page.tsx` links to `/applications/${id}` → fix to `/generate/${id}/result`

---

## User Stories

---

### US-01 — Landing Page (`landing-page-client.tsx`)

**As a** first-time visitor who has never heard of Retuned,
**I want** to understand in 10 seconds what the product does, why it's different, and what it costs,
**so that** I can decide whether to sign up without reading a wall of text.

#### Eyebrow
- **Current:** "AI resume architect"
- **Problem:** "Architect" is a job title, not a product description. Doesn't convey the cognitive/understanding angle.
- **Fix:** "AI-powered job applications, done right."
- **Rationale:** Matches the hero tagline already in `en.json`. Consistent. Positions the product as a complete solution, not a tool.

#### H1
- **Current:** "Every application, your best application."
- **Problem:** Repetition of "application" is weak. Doesn't say what the product does.
- **Fix:** "Your career, retuned."
- **Rationale:** Uses "retuned" as a verb (past tense — the career has been retuned). Short. Memorable. Already in `en.json` as `hero.headline_prefix` + `hero.headline_emphasis`. The landing page should use the same headline as the hero component for consistency. Note: lowercase "retuned" here is intentional — it's the verb, not the brand name.

#### Hero body
- **Current:** "Paste a job description. Get a tailored resume, cover letter, and application strategy in 2 minutes. Zero edits needed."
- **Problem:** "Zero edits needed" is a false promise — the product has a refusal gate and quality floor. If it refuses, the user definitely needs to do something. Also "2 minutes" is a speed claim that may not hold.
- **Fix:** "Paste a job. We'll write a resume and cover letter that earn the interview — every claim backed by evidence from your career."
- **Rationale:** Already in `en.json` as `hero.subhead`. Honest. Doesn't promise zero edits. Introduces the "evidence" framing.

#### Social proof bar
- **Current:** "2–5 min generation" · "85% ATS median" · "18 cognitive specialists" · "0 edits needed"
- **Problem:** "0 edits needed" is the same false promise. "18 cognitive specialists" is internal jargon. "generation" not "tuning".
- **Fix:** "2–5 min per tuning" · "85% ATS median" · "18 specialist agents" · "Evidence-backed every time"
- **Rationale:** Removes the false promise. Replaces jargon with plain language. Introduces "evidence-backed" which is the core differentiator.

#### Problem section heading
- **Current:** "Job searching is broken."
- **Assessment:** Good. Keep.

#### Problem section stats
- **Current:** "250 applications per role" / "2% average callback rate" / "4 hrs per application"
- **Assessment:** Good. Keep. These are the hook.

#### Problem section closing line
- **Current:** "Retuned is how serious job seekers get serious results."
- **Problem:** Generic. "Serious results" is marketing speak. Doesn't say what makes Retuned different.
- **Fix:** "Retuned understands your career. It doesn't fill in blanks — it builds a case."
- **Rationale:** Directly states the positioning. "Builds a case" connects to the evidence/legal framing that runs through the product.

#### How it works heading
- **Current:** "One input. Complete package."
- **Assessment:** Good. Keep.

#### Features heading
- **Current:** "Not just autocomplete."
- **Assessment:** Good. Keep. This is the sharpest line on the page.

#### Features subhead
- **Current:** "A cognitive system. 18 specialist agents coordinate like a senior hiring expert thinks."
- **Problem:** "like a senior hiring expert thinks" is vague. What does that mean?
- **Fix:** "A cognitive system. 18 specialist agents read your evidence, map the role, and write what you can honestly claim."
- **Rationale:** Concrete. Describes the actual pipeline. "Honestly claim" introduces the honesty angle.

#### Outputs section heading
- **Current:** "Everything in the package."
- **Assessment:** Fine. Could be stronger.
- **Fix:** "One tuning. Three deliverables."
- **Rationale:** Uses "tuning" (vocabulary rule). Concrete count.

#### GDPR section heading
- **Current:** "You own every decision."
- **Assessment:** Good. Keep.

#### GDPR section body
- **Current:** "Every generation produces a GDPR Article 22 audit packet."
- **Problem:** "generation" not "tuning". "GDPR Article 22 audit packet" is jargon.
- **Fix:** "Every tuning produces a full audit trail — every specialist that ran, every decision made, every claim verified. GDPR Article 22 compliant."
- **Rationale:** Explains what the audit packet is before naming the regulation. More useful to a non-lawyer.

#### Pricing — Free plan
- **Current:** "Free · $0 · 2 full generations"
- **Fix:** "Free · $0 · 2 full tunings"

#### Pricing — Pro plan
- **Current:** "Pro · $19/mo · Unlimited generations"
- **Fix:** "Pro · $19/mo · Unlimited tunings"

#### Final CTA heading
- **Current:** "Start with your next application."
- **Fix:** "Start with your next role."
- **Rationale:** "Role" not "application" (vocabulary rule). Slightly more aspirational.

#### Final CTA sub-copy
- **Current:** "2 free generations. No credit card."
- **Fix:** "2 free tunings. No credit card."

#### Footer tagline
- **Current:** "Land interviews. Not rejections."
- **Assessment:** Good. Keep. Sharp and honest.

---

### US-02 — Auth: Login

**As a** returning user,
**I want** the login page to feel like a welcome back, not a security checkpoint,
**so that** I don't feel friction re-entering the product.

#### Title
- **Current:** "Welcome back."
- **Assessment:** Good. Keep.

#### Subtitle
- **Current:** "Sign in to pick up where you left off."
- **Assessment:** Good. Keep.

#### Submit button
- **Current:** "Sign in"
- **Assessment:** Good. Keep.

#### Footer prompt
- **Current:** "New here?" / "Create an account"
- **Assessment:** Good. Keep.

#### Google button (if present)
- **Current:** Unknown — audit the `GoogleButton` component.
- **Expected:** "Continue with Google" (industry standard, not "Sign in with Google" which implies password replacement)

---

### US-03 — Auth: Signup

**As a** new user who just clicked "Get started",
**I want** the signup page to confirm I'm making a low-risk decision,
**so that** I complete the form without second-guessing.

#### Title
- **Current:** "Create your account."
- **Assessment:** Good. Keep.

#### Subtitle
- **Current (en.json):** "Three free applications, no card required. Cancel anything."
- **Problems:** (1) "Three" conflicts with landing's "2". (2) "Cancel anything" is grammatically wrong. (3) "applications" not "tunings".
- **Fix:** "2 free tunings, no card required. Cancel anytime."
- **Rationale:** Aligns with landing. Correct grammar. Correct vocabulary.

#### Submit button
- **Current:** "Create account"
- **Assessment:** Good. Keep.

#### Footer prompt
- **Current:** "Already a member?" / "Sign in"
- **Assessment:** Good. Keep.

#### Consent checkboxes
- **Current:** "Anthropic (AI generation)" / "OpenAI (processing)" / "Retuned (platform)"
- **Problem:** "AI generation" is jargon. Users don't know what "generation" means here.
- **Fix:** "Anthropic (writes your resume)" / "OpenAI (processes your text)" / "Retuned (stores your profile)"
- **Rationale:** Plain language. Each label explains what the third party actually does with data.

---

### US-04 — Onboarding (`onboarding-v2/page.tsx`)

**As a** new user who just signed up,
**I want** the onboarding AI to feel like a knowledgeable colleague, not a chatbot,
**so that** I trust it with my career history.

#### Intro sequence
- **Current:** "Hello" / "I'm Retuned — your career profile builder." / "Upload your resume and I'll build your profile from it."
- **Problem:** "career profile builder" undersells. The product is a cognitive system, not a form filler.
- **Fix:** "Hello." / "I'm Retuned. I'll read your resume and build a profile I can use to write honest, evidence-backed applications." / "Upload your resume to get started."
- **Rationale:** "I'm Retuned" is correct — the AI is the product. Introduces the "honest, evidence-backed" framing from the first interaction. Sets expectations correctly — the AI reads and understands, it doesn't just extract fields.

#### Stage labels (header)
- **Current:** Loading / Upload / Processing / Review / Correction / Questions / Voice / Audit / Saving / Done
- **Assessment:** Most are fine. "Processing" is vague during the actual extraction phase.
- **Fix:** "Processing" → "Reading your resume"
- **Rationale:** Tells the user what's actually happening.

#### "Finish later" button
- **Current:** "Finish later"
- **Assessment:** Good. Keep.

#### "Start over" button
- **Current:** "Start over"
- **Assessment:** Good. Keep.

#### Start over confirm dialog
- **Current:** "Start over?" / "This will clear your profile and start fresh."
- **Assessment:** Good. Keep. Clear and honest about the consequence.

#### Completion overlay
- **Current:** "Thank you" / "Your Retuned profile is complete. Opening your dashboard..."
- **Problem:** "Thank you" is passive. The user did the work. Also three dots (...) should be an ellipsis (…).
- **Fix:** "Profile complete." / "Your Retuned profile is ready. Opening your dashboard…"
- **Rationale:** "Your Retuned profile" is correct — "Retuned" is the brand name modifying "profile". More active. Typographic ellipsis (…) not three dots (...).

#### Input placeholder (default)
- **Current:** "Type a message…"
- **Assessment:** Fine for a chat interface. Keep.

#### Input placeholder (with options)
- **Current:** "Or reply directly…"
- **Assessment:** Good. Keep.

#### "Please choose" label
- **Current:** "Please choose"
- **Fix:** "Choose one"
- **Rationale:** Shorter. Less formal. Consistent with the warm tone.

#### "Select all that apply"
- **Current:** "Select all that apply"
- **Assessment:** Good. Keep. Standard UX pattern.

#### "Skip for now"
- **Current:** "Skip for now"
- **Assessment:** Good. Keep.

#### "Continue with N selected"
- **Current:** "Continue with {count} selected"
- **Assessment:** Good. Keep.

---

### US-05 — Dashboard

**As a** returning user who has completed onboarding,
**I want** the dashboard to orient me immediately and make the primary action obvious,
**so that** I can start a new tuning in under 5 seconds.

#### Page eyebrow
- **Current:** "Dashboard"
- **Assessment:** Fine. Keep.

#### Page title
- **Current:** "Welcome back, {name}." / "Welcome back." (anonymous)
- **Assessment:** Good. Keep.

#### Page subtitle
- **Current:** "Paste a role below to start a new tuning."
- **Assessment:** Good. Keep. Uses "role" and "tuning" correctly.

#### "Notifications" section label
- **Current:** "Notifications"
- **Assessment:** Fine. Keep.

#### Migration card heading
- **Current:** "We've improved our profile system"
- **Problem:** Vague. What improved? Why should the user care?
- **Fix:** "Your profile just got smarter"
- **Rationale:** More specific benefit. "Smarter" connects to the cognitive framing.

#### Migration card body
- **Current:** "Take 3 minutes to enrich your profile with the new positioning, voice and preferences questions. Your existing experience and skills carry over — we'll just add a few more so every resume we generate sounds more like you."
- **Problems:** "resume we generate" → should be "package we write". "generate" not "tuning". Too long.
- **Fix:** "Take 3 minutes to add your voice, positioning, and work-style preferences. Your existing evidence carries over — we'll just learn how you write so every tuning sounds like you."
- **Rationale:** Uses "evidence" (vocabulary). Uses "tuning". Shorter. "Sounds like you" is the key benefit.

#### Migration card CTA
- **Current:** "Enhance my profile"
- **Assessment:** Good. Keep.

#### Migration card dismiss
- **Current:** "Maybe later"
- **Assessment:** Good. Keep.

#### Metrics section label
- **Current:** "Metrics"
- **Assessment:** Fine. Keep.

#### Metric labels
- **Current:** "Shipped" / "Total generations" / "Profile readiness" / "Status"
- **Problems:** "Total generations" → "Total tunings". "Status" is vague.
- **Fix:** "Shipped" / "Total tunings" / "Profile readiness" / "Ready to tune" (if score ≥ 60) / "Build your profile" (if score < 60)
- **Rationale:** "Ready to tune" is actionable. "Build your profile" tells the user what to do.

#### "Tune now" section label
- **Current:** "Tune now"
- **Assessment:** Good. Keep. Uses the right verb.

---

### US-06 — Generate: New (`generate/new`)

**As a** user about to start a tuning,
**I want** the input screen to tell me exactly what to paste and what I'll get,
**so that** I don't hesitate or paste the wrong thing.

#### Page eyebrow
- **Current:** "New tuning"
- **Assessment:** Good. Keep.

#### Page heading / prompt
- **Current:** "What are you applying to?"
- **Assessment:** Good. Keep. Direct question.

#### Page subtext
- **Current:** "Paste a job URL or the full description. We'll check profile drift, then run a tuning."
- **Problem:** "profile drift" is internal jargon. Users don't know what that means.
- **Fix:** "Paste a job URL or the full description. We'll check your profile fits the role, then write your package."
- **Rationale:** "Check your profile fits the role" is plain language for drift detection. "Write your package" is the outcome.

#### Mode toggle labels
- **Current:** "URL" / "Text"
- **Assessment:** Good. Keep.

#### Market toggle labels
- **Current:** "US resume" / "UK CV"
- **Assessment:** Good. Keep. Locale-correct.

#### Submit button
- **Current:** "Tune"
- **Assessment:** Good. Keep. The product's own verb.

---

### US-07 — Generate: Streaming (`generate/[id]`)

**As a** user watching their tuning run,
**I want** to understand what's happening at each stage without needing to know the internals,
**so that** I feel confident the system is working, not just spinning.

#### Page heading (running)
- **Current:** "Working on your application"
- **Problem:** "application" not "tuning".
- **Fix:** "Working on your tuning"

#### Page heading (complete)
- **Current:** "Your package is ready"
- **Assessment:** Good. Keep. "Package" is correct vocabulary.

#### Page heading (error)
- **Current:** "Something went wrong"
- **Assessment:** Acceptable. See US-11 for error copy standards.

#### Specialist trace labels
- These are the live trace events shown during streaming. They come from the agent's `display_name` fields and `justification` strings. Audit separately — they are not i18n strings but they are user-visible.
- **Standard:** Each trace label should be a plain-English description of what the specialist is doing, not its internal name. E.g. "Reading your job description" not "jd_span_extractor".
- **Action:** Audit `display_name` on each specialist in `packages/agent/src/specialists/`. Ensure every one reads as a human action, not a system identifier.

#### SSE progress messages
- These come from the `narrator.ts` specialist. The narrator already produces plain-language summaries. No copy change needed — but ensure the narrator prompt (now extracted to `narrator.summary.md`) produces copy consistent with the voice guide.

---

### US-08 — Generate: Result (`generate/[id]/result`)

**As a** user whose tuning has completed,
**I want** the result page to confirm what was produced and make it easy to download,
**so that** I feel the work was worth it and can act immediately.

#### Page eyebrow
- **Current:** "Application ready"
- **Problem:** "Application" not "tuning". Also the eyebrow should reflect the role, not a generic state.
- **Fix:** "Package ready"
- **Rationale:** "Package" is the correct vocabulary for the output.

#### Tab labels
- **Current:** "Resume" / "Cover letter" / "Strategy"
- **Assessment:** Good. Keep. Clear and standard.

#### Score labels
- **Current:** "Interview readiness" / "ATS score" / "Callback chance"
- **Assessment:** Good. Keep. These are the three metrics the product is built around.

#### Download CTA
- **Current:** Unknown — audit the result page for the download button label.
- **Expected:** "Download package" (not "Download resume" — the package includes more than the resume)

#### "What happened?" link / outcome logging prompt
- **Current:** Unknown — audit for any prompt to log outcome.
- **Expected:** After a tuning ships, there should be a low-friction prompt: "Did you get an interview? Tell us — it trains the system." This is the outcome predictor feedback loop.

---

### US-09 — Generate: Refused (`generate/[id]/refused`)

**As a** user whose tuning was refused,
**I want** to understand exactly why it was refused and what I can do about it,
**so that** I don't feel blamed and I know my next step.

#### Decision banner label
- **Current:** "Decision"
- **Assessment:** Good. Keep. Neutral, not accusatory.

#### Main heading
- **Current:** "We can't ship this credibly."
- **Assessment:** Excellent. Keep. This is the sharpest, most honest line in the product. It says "we" (shared responsibility), "credibly" (the standard), and doesn't say "you failed".

#### Body copy
- **Current:** "The decision gate refused to ship the package because at least one quality criterion failed. Each reason below comes with a recommended next step."
- **Problem:** "The decision gate" is internal jargon. "quality criterion failed" is passive and cold.
- **Fix:** "We reviewed your profile against this role and couldn't write something we'd stand behind. Here's why, and what to do next."
- **Rationale:** "We" takes shared responsibility. "Stand behind" is human. "Here's why, and what to do next" sets up the reasons section.

#### "Why" section heading
- **Current:** "Why"
- **Assessment:** Good. Keep. Blunt and honest.

#### Refusal reason titles (from `refusal-taxonomy.ts` — already good, but review)
- `insufficient_evidence` → "Not enough evidence yet" ✓
- `role_mismatch` → "This role isn't a fit" ✓
- `fabricated_claim` → "We can't verify a claim" ✓
- `policy_violation` → "We can't help with this one" ✓
- `prompt_injection_detected` → "We detected an injection attempt" ✓
- `low_quality_input` → "We need more to work with" ✓
- `rate_limit` → "You're going faster than we can keep up" — slightly awkward
  - **Fix:** "Slow down — you're hitting the rate limit"
- `service_degraded` → "Something's not right on our side" ✓

#### "Next step." prefix
- **Current:** "Next step."
- **Assessment:** Good. Keep. Actionable framing.

#### "Drafts staged for revision" heading
- **Current:** "Drafts staged for revision"
- **Problem:** Jargon. Users don't know what "staged" means here.
- **Fix:** "Drafts that need work"
- **Rationale:** Plain language.

#### Contest section heading
- **Current:** "Contest this decision"
- **Assessment:** Good. Keep. Empowers the user.

#### Contest section body
- **Current:** "Every refusal is contestable. We commit to a 30-day human-review SLA."
- **Assessment:** Good. Keep. Specific commitment builds trust.

#### "Try a different role" CTA
- **Current:** "Try a different role"
- **Assessment:** Good. Keep. Uses "role" correctly.

---

### US-10 — Generate: Outcome (`generate/[id]/outcome`)

**As a** user who got (or didn't get) an interview,
**I want** to log the outcome quickly,
**so that** the system learns from my real results without it feeling like homework.

#### Page heading
- **Current:** "What happened?"
- **Assessment:** Good. Keep. Conversational.

#### Body copy
- **Current:** "Your feedback trains the outcome predictor against your real results."
- **Problem:** "outcome predictor" is internal jargon.
- **Fix:** "Tell us what happened. It helps Retuned get better at predicting which applications will land interviews."
- **Rationale:** Explains the benefit to the user (better predictions) not just the system (trains the model).

---

### US-11 — Generate: Contest (`generate/[id]/contest`)

**As a** user who disagrees with a refusal,
**I want** to understand my rights and submit a contest clearly,
**so that** I feel heard and know what to expect.

#### Page heading
- **Current:** "Contest Decision"
- **Fix:** "Contest this decision"
- **Rationale:** Matches the button label on the refused page. Consistency.

#### "Your Rights" section
- **Current:** "Your Rights"
- **Fix:** "Your rights"
- **Rationale:** Sentence case, not title case. Consistent with the rest of the product.

#### Broken link fix (CF-05)
- **Current:** Links to `/applications/${id}`
- **Fix:** `/generate/${id}/result`

---

### US-12 — Generate: Audit (`generate/[id]/audit`)

**As a** user who wants to understand how their tuning was produced,
**I want** the audit page to explain the pipeline in plain language,
**so that** I can trust the output and understand any refusal.

#### Page heading
- **Current:** "How I thought about this."
- **Assessment:** Excellent. Keep. First-person from the AI. Honest and direct.

#### Body / description
- **Current:** "Every specialist that ran, every conflict raised, every token spent."
- **Assessment:** Good. Keep. Specific and transparent.

---

### US-13 — Profile (`/profile`)

**As a** user editing their career profile,
**I want** every field label and section heading to tell me what the data is used for,
**so that** I understand why I'm filling it in and what happens if I don't.

#### Page eyebrow
- **Current:** "Career profile"
- **Assessment:** Good. Keep.

#### Page title
- **Current:** "Your profile"
- **Assessment:** Fine. Keep.

#### Section: Basic info
- **Current:** Field labels: "Full name" / "Email" / "Phone" / "LinkedIn" / "Location" / "Current title"
- **Assessment:** Good. Keep. Standard and clear.

#### Section: Experience
- **Current:** "Experience"
- **Assessment:** Good. Keep.

#### Section: Education
- **Current:** "Education"
- **Assessment:** Good. Keep.

#### Section: Skills
- **Current:** "Skills" with tiers (Tier 1 / Tier 2 / Tier 3)
- **Problem:** "Tier 1 / Tier 2 / Tier 3" is internal taxonomy. Users don't know what tier means.
- **Fix:** "Core skills" / "Supporting skills" / "Familiar with"
- **Rationale:** Plain language. Describes the actual meaning of each tier (things you lead with vs. things you can mention vs. things you've touched).

#### Section: Projects
- **Current:** "Projects"
- **Assessment:** Good. Keep.

#### Section: Target roles
- **Current:** "Target roles"
- **Assessment:** Good. Keep. Uses "roles" correctly.

#### Save button
- **Current:** "Save"
- **Assessment:** Good. Keep.

#### Toast: save success
- **Current (en.json):** `toasts.profile_saved` = "Profile saved"
- **Assessment:** Good. Keep.

#### Toast: save failed
- **Current (en.json):** `toasts.profile_save_failed` = "Failed to save"
- **Problem:** Passive. Doesn't tell the user what to do.
- **Fix:** "Couldn't save — try again"
- **Rationale:** Active. Gives direction.

#### Toast: resume imported
- **Current (en.json):** `toasts.resume_applied` = "Applied changes from your resume."
- **Problem:** "resume" should be "CV" in en-GB. Already handled in en-GB.json. But the base message is fine.
- **Assessment:** Good. Keep.

#### Toast: imported count
- **Current (en.json):** `toasts.imported` = "Imported {exp} experience{exp_plural}, {skills} skills, {proj} project{proj_plural}"
- **Problem:** Reads like a log message, not a user message.
- **Fix:** "Imported {exp} experience{exp_plural}, {skills} skills, and {proj} project{proj_plural} from your resume."
- **Rationale:** Adding "and" and "from your resume" makes it read as a sentence.

#### Empty state: no profile data
- **Current:** None — the page returns null or renders empty sections.
- **Fix:** Add an empty state: "Your profile is empty. Upload your resume and we'll build it for you." with a CTA to the onboarding flow.

#### "Re-read evidence" button
- **Current:** "Re-read evidence"
- **Assessment:** Good. Uses "evidence" correctly.

#### "Retune updated." toast
- **Current (en.json):** `toasts.retune_updated` = "Retune updated."
- **Problem:** "Retune" here is wrong — the brand name is "Retuned". This should either be "Retuned updated." (brand name) or more precisely "Understanding updated." (what actually changed).
- **Fix:** "Understanding updated."
- **Rationale:** More precise — the AI's understanding of the profile was updated, not the product itself. Avoids the brand name confusion entirely.

#### "Marked as accurate." toast
- **Current (en.json):** `toasts.marked_accurate` = "Marked as accurate."
- **Assessment:** Good. Keep.

---

### US-14 — Settings: Main (`/settings`)

**As a** user managing their account,
**I want** the settings page to be a clear index of what I can control,
**so that** I can find what I need without hunting.

#### Page eyebrow
- **Current (en.json):** `settings.eyebrow` = "Account"
- **Assessment:** Good. Keep.

#### Page title
- **Current (en.json):** `settings.title` = "Settings"
- **Assessment:** Good. Keep.

#### Page subtitle
- **Current (en.json):** `settings.subtitle` = "Account preferences, subscription, voice and data."
- **Assessment:** Good. Keep.

#### Nav section: Career profile
- **Current:** "Career profile" / "Details, experience, skills, voice."
- **Assessment:** Good. Keep.

#### Nav section: Voice & style
- **Current:** "Voice & style" / "How Retuned sounds when writing as you."
- **Assessment:** Good. Keep. "Writing as you" is the right framing.

#### Nav section: Honesty calibration
- **Current:** "Honesty calibration" / "Claim ownership aggressiveness."
- **Problem:** "Claim ownership aggressiveness" is jargon. What does this mean to a user?
- **Fix:** "Honesty calibration" / "How boldly we claim your achievements."
- **Rationale:** Plain language. "Boldly claim" is understandable. "Achievements" is more human than "claims".

#### Nav section: Culture & values
- **Current:** "Culture & values" / "Signals reflected in tunings."
- **Problem:** "Signals reflected in tunings" is vague.
- **Fix:** "Culture & values" / "Work style preferences that shape every application."
- **Rationale:** Explains what the data is used for.

#### Nav section: Privacy & data
- **Current:** "Privacy & data" / "Export or delete stored data."
- **Assessment:** Good. Keep.

#### Subscription section label
- **Current (en.json):** `settings.subscription_label` = "Subscription"
- **Assessment:** Good. Keep.

#### "Upgrade" button
- **Current (en.json):** `settings.upgrade` = "Upgrade"
- **Assessment:** Good. Keep.

#### "Member since {date}"
- **Current (en.json):** `settings.member_since` = "Member since {date}"
- **Assessment:** Good. Keep.

#### "Sign out"
- **Current (en.json):** `settings.sign_out` = "Sign out"
- **Assessment:** Good. Keep.

#### Danger zone title
- **Current (en.json):** `settings.danger_zone_title` = "Danger zone"
- **Assessment:** Good. Keep. Clear and honest.

#### Danger zone subtitle
- **Current (en.json):** `settings.danger_zone_sub` = "Permanently delete your account and every tuning."
- **Assessment:** Good. Keep. Specific about what gets deleted.

#### Delete confirm prompt
- **Current (en.json):** `settings.delete_confirm_prompt` = "Type {word} to confirm"
- **Assessment:** Good. Keep.

#### Delete irreversible warning
- **Current (en.json):** `settings.delete_irreversible` = "This permanently deletes all your data. This cannot be undone."
- **Assessment:** Good. Keep. Clear and honest.

---

### US-15 — Settings: Voice (`/settings/voice`)

**As a** user checking their voice fingerprint,
**I want** to understand what the fingerprint is and why it matters,
**so that** I trust the AI is writing in my voice, not a generic one.

#### Eyebrow
- **Current (en.json):** `settings_voice.eyebrow` = "Voice & style"
- **Assessment:** Good. Keep.

#### Title
- **Current (en.json):** `settings_voice.title` = "Writing voice"
- **Assessment:** Good. Keep.

#### Subtitle
- **Current (en.json):** `settings_voice.subtitle` = "Your voice fingerprint captures how you naturally write. It's used to keep generated content authentic to your style."
- **Problem:** "generated content" → should be "every tuning".
- **Fix:** "Your voice fingerprint captures how you naturally write. Every tuning uses it to sound like you, not like a template."
- **Rationale:** "Sound like you, not like a template" is the benefit stated plainly.

#### "Documents analyzed" label
- **Current (en.json):** `settings_voice.docs_analyzed` = "Documents analyzed"
- **en-GB:** "Documents analysed" ✓
- **Assessment:** Good. Keep.

#### Auto-update note
- **Current (en.json):** `settings_voice.auto_update_note` = "Updates automatically as you upload documents and complete generations."
- **Problem:** "complete generations" → "complete tunings".
- **Fix:** "Updates automatically as you upload documents and complete tunings."

#### Empty state
- **Current (en.json):** `settings_voice.empty_title` = "No voice fingerprint yet. It will be created during your first generation."
- **Problem:** "first generation" → "first tuning".
- **Fix:** "No voice fingerprint yet. It builds automatically during your first tuning."
- **Rationale:** "Builds automatically" is more reassuring than "will be created". "First tuning" is correct vocabulary.

---

### US-16 — Settings: Honesty (`/settings/honesty`)

**As a** user reviewing their honesty calibration,
**I want** to understand what the trust scores mean and how they affect my tunings,
**so that** I know whether to add more evidence to my profile.

#### Subtitle
- **Current (en.json):** `settings_honesty.subtitle` = "Tracks how your claims perform over time. The system adjusts confidence in different claim types based on outcome feedback."
- **Problem:** "The system adjusts confidence" is passive and jargon-heavy.
- **Fix:** "Tracks how your claims perform over time. When a claim type has low trust, we ask for stronger evidence before using it prominently."
- **Rationale:** Explains the actual consequence in plain language.

#### Trust note
- **Current (en.json):** `settings_honesty.trust_note` = "Trust levels are updated when you log outcomes. A trust level below 70% means the system will ask for stronger evidence before using that claim type prominently."
- **Problem:** Repeats the subtitle. Redundant.
- **Fix:** "Log your interview outcomes to keep trust levels accurate. The more feedback you give, the better Retuned calibrates your claims."
- **Rationale:** Tells the user what to do (log outcomes) and why (better calibration). Removes the redundant threshold explanation.

#### Empty state
- **Current (en.json):** `settings_honesty.no_data` = "No calibration data yet."
- **Fix:** "No calibration data yet. It builds as you complete tunings and log outcomes."
- **Rationale:** Explains how to get data, not just that there isn't any.

---

### US-17 — Settings: Culture (`/settings/culture`)

**As a** user setting their cultural preferences,
**I want** to understand how these sliders affect my tunings,
**so that** I set them intentionally rather than randomly.

#### Subtitle
- **Current (en.json):** `settings_culture.subtitle` = "Set your work style preferences so applications are calibrated to roles that suit you."
- **Problem:** "applications are calibrated" is passive. "roles that suit you" is vague.
- **Fix:** "Tell us how you like to work. We use this to match your tone and framing to roles that fit your style."
- **Rationale:** Active voice. Explains the mechanism (tone and framing) and the benefit (roles that fit).

#### "Saved" indicator
- **Current (en.json):** `settings_culture.saved` = "Saved"
- **Assessment:** Good. Keep.

#### "Balanced" label (zero position)
- **Current (en.json):** `settings_culture.balanced` = "Balanced"
- **Assessment:** Good. Keep.

---

### US-18 — Settings: Data (`/settings/data`)

**As a** user managing my data,
**I want** clear, honest language about what data exists and what I can do with it,
**so that** I feel in control without needing to read a legal document.

#### Subtitle
- **Current (en.json):** `settings_data.subtitle` = "Manage your data and privacy preferences. You have full control over your information."
- **Problem:** "You have full control" is a marketing claim, not a description. The user can export and delete — say that.
- **Fix:** "Export a copy of your data or delete your account. Your profile, tunings, and evidence are yours."
- **Rationale:** Specific about what's possible. "Evidence" vocabulary. Removes the hollow "full control" claim.

#### Export body
- **Current (en.json):** `settings_data.export_body` = "Download a copy of all your data including profile, applications, and generations."
- **Problem:** "applications" and "generations" → "tunings".
- **Fix:** "Download a copy of everything: your profile, tunings, and evidence graph."

#### Retention: generations line
- **Current (en.json):** `settings_data.retention_generations` = "Generations: retained for 90 days after creation"
- **Fix:** "Tunings: retained for 90 days after creation"

#### Deletion note
- **Current (en.json):** `settings_data.deletion_note` = "For data deletion requests, please delete your account from the main settings page."
- **Assessment:** Good. Keep.

---

### US-19 — Error States & Empty States

**As a** user who hits an error or an empty state,
**I want** to know what happened and what to do next,
**so that** I'm never stranded with a blank screen or a cryptic message.

#### 404 page
- **Current:** "Page not found" / "The page you're looking for doesn't exist or has been moved."
- **Assessment:** Good. Keep. Clear and honest.

#### Offline page
- **Current (en.json):** `errors.offline_title` = "We're not connected." / `errors.offline_body` = "Retune needs the network…" (CF-01 fix needed)
- **Fix body:** "Retuned needs the network to read your job description, your evidence, and the AI providers. Re-establish a connection and we'll pick up where you left off."
- **Rationale:** "Evidence" not "evidence graph" (simpler). CF-01 brand name fix.

#### Global error
- **Current:** "Something went wrong" / "An unexpected error occurred."
- **Problem:** "An unexpected error occurred" is the most generic error message in software. Tells the user nothing.
- **Fix:** "Something went wrong" / "We hit an unexpected error. Refresh the page — if it keeps happening, contact support@retuned.cv."
- **Rationale:** Gives the user an action (refresh) and an escalation path (email).

#### Generate: streaming error
- **Current:** "Something went wrong"
- **Fix:** "Something went wrong with this tuning. Your profile is safe — try starting a new one."
- **Rationale:** Reassures the user their data is intact. Gives a clear next step.

#### Toast: workspace create failed
- **Current (en.json):** `toasts.workspace_create_failed` = "Could not create the workspace."
- **Fix:** "Couldn't create the workspace — try again."
- **Rationale:** Active. Gives direction.

#### Toast: workspace switch failed
- **Current (en.json):** `toasts.workspace_switch_failed` = "Could not switch workspace."
- **Fix:** "Couldn't switch workspace — try again."

#### Toast: language update failed
- **Current (en.json):** `toasts.language_update_failed` = "Couldn't switch language."
- **Assessment:** Good. Keep.

#### Toast: account delete failed
- **Current (en.json):** `toasts.account_delete_failed` = "Failed to delete account. Please try again."
- **Assessment:** Good. Keep.

#### Toast: data export failed
- **Current (en.json):** `toasts.data_export_failed` = "Failed to export data"
- **Fix:** "Couldn't export your data — try again."
- **Rationale:** Consistent active voice pattern.

#### Toast: understanding regen failed
- **Current (en.json):** `toasts.understanding_regen_failed` = "Could not regenerate understanding."
- **Problem:** "regenerate understanding" is jargon.
- **Fix:** "Couldn't update your profile understanding — try again."

---

### US-20 — Specialist `display_name` fields (agent trace labels)

**As a** user watching the live trace during a tuning,
**I want** each specialist's label to read as a plain-English action,
**so that** I understand what the system is doing without needing to know the architecture.

Each specialist in `packages/agent/src/specialists/` has a `display_name` field. These appear in the live trace UI. Audit and fix:

| Specialist | Current `display_name` | Fix |
|-----------|----------------------|-----|
| `gap_mapper` | "Gap Mapper" | "Mapping role requirements" |
| `evidence_solver` | "Evidence Solver" | "Matching your evidence to the role" |
| `narrative_arc_proposer` | "Narrative Arc Proposer" | "Choosing your story angle" |
| `bullet_composer` | "Sequential Bullet Composer" | "Writing your experience bullets" |
| `cover_letter_composer` | "Cover Letter Composer" | "Writing your cover letter" |
| `ats_patch_loop` | "ATS Patch Loop" | "Optimising for ATS keywords" |
| `critic_ensemble` | "Critic Ensemble" | "Reviewing the draft" |
| `outcome_predictor` | "Outcome Predictor" | "Estimating callback probability" |
| `refuse_or_ship_gate` | "Refuse-or-Ship Gate (Meta-cognition)" | "Making the final quality decision" |
| `narrator` | "Narrator" | "Writing your summary" |
| `fairness_monitor` | "Fairness Monitor" | "Checking for bias" |
| `voice_drift_monitor` | "Voice Drift Monitor" | "Checking it sounds like you" |
| `well_being_monitor` | "Well-being Monitor" | "Checking for distress signals" |
| `theory_of_mind` | "Theory of Mind Specialist" | "Modelling the recruiter's perspective" |
| `application_strategy_composer` | "Application Strategy Composer" | "Writing your application strategy" |
| `document_renderer` | "Document Renderer" | "Rendering your documents" |

---

## Implementation Order

1. **CF-01 through CF-05** — bugs, ship immediately
2. **US-19** — error states, high user impact, low effort
3. **US-02, US-03** — auth copy, every new user sees this
4. **US-01** — landing page, highest traffic surface
5. **US-05** — dashboard, every returning user sees this
6. **US-09** — refused page, highest emotional stakes
7. **US-04** — onboarding, first impression of the AI
8. **US-06, US-07, US-08** — generate flow
9. **US-13** — profile, skill tier labels
10. **US-14 through US-18** — settings sub-pages
11. **US-20** — specialist display names (requires agent package change)

---

## i18n Key Changes Required

All copy changes that touch i18n strings must be updated in all three locale files: `en.json`, `en-US.json`, `en-GB.json`.

New keys needed:
- `toasts.retune_updated` — fix value to "Understanding updated." (key name stays, value changes)
- `settings_voice.subtitle` — updated
- `settings_voice.auto_update_note` — updated
- `settings_voice.empty_title` — updated
- `settings_honesty.subtitle` — updated
- `settings_honesty.trust_note` — updated
- `settings_honesty.no_data` — updated
- `settings_culture.subtitle` — updated
- `settings_data.subtitle` — updated
- `settings_data.export_body` — updated
- `settings_data.retention_generations` — updated
- `settings.sections.honesty_sub` — updated
- `settings.sections.culture_sub` — updated
- `toasts.profile_save_failed` — updated
- `toasts.imported` — updated
- `toasts.workspace_create_failed` — updated
- `toasts.workspace_switch_failed` — updated
- `toasts.understanding_regen_failed` — updated
- `toasts.data_export_failed` — updated
- `errors.offline_body` — updated (CF-01)
- `settings.sections.workspaces_sub` — updated (CF-01)
- `settings.sections.language_sub` — updated (CF-01)
- `auth.signup.subtitle` — updated (CF-02, CF-03)
- `dashboard.title_with_name` / `dashboard.title_anonymous` — no change
- `onboarding.stage_processing` → "Reading your resume"
- `onboarding.complete_title` → "Profile complete."
- `onboarding.complete_body` → "Your Retuned profile is ready. Opening your dashboard…"
- `onboarding.please_choose` → "Choose one"
- `onboarding.intro_name` — updated
- `onboarding.intro_instruction` — updated (en-GB: "CV" already correct)
