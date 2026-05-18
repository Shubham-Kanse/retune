# Retune Onboarding Pipeline — Complete Specification

**Product:** Retune  
**Scope:** New user onboarding, from signup completion to profile commit  
**Industry scope:** Tech only (initial release)  
**Language:** English only (initial release)  
**Version:** 1.0  

---

## Document Structure

Each stage is documented with the following sections:

- **Purpose** — what this stage exists to accomplish
- **Entry conditions** — what must be true before this stage begins
- **Happy path** — the ideal scenario
- **All other scenarios** — every realistic deviation, individually specified
- **LLM call specification** — full structure for every LLM call fired in this stage
- **Exit conditions** — what must be true to leave this stage
- **Failure states** — what happens if this stage cannot be completed

---

---

# PART 1 — GETTING DATA IN

---

## Stage 1 — Resume Upload & Text Extraction

### Purpose

Receive the user's resume file, extract its raw text content reliably, and simultaneously fire a parallel LLM call to map the extracted text to the database schema. Nothing is shown to the user about the content of their resume yet. This stage is purely about getting clean, structured input into the system. Two things must succeed before the system can proceed: text extraction must produce readable content above a minimum threshold, and the DB schema mapping call must return a valid structured object. If either fails, the system has nothing to work with downstream.

### Entry conditions

- User has completed signup and email verification
- User has arrived at `/onboarding` for the first time
- No resume exists in the current session
- Session is initialised and persisted with a unique session ID
- Session stores: `user_id`, `session_id`, `onboarding_started_at`, `onboarding_status: "awaiting_upload"`

### Happy path

User clicks the upload button. Selects a valid PDF or DOCX file. File uploads successfully. Text is extracted cleanly and returns above the minimum character threshold. In parallel, the DB schema mapping LLM call fires immediately on the extracted text and returns a valid structured object. Both succeed. Session is updated with raw extracted text and the mapped schema object. System moves to Stage 2.

### All other scenarios

**User uploads an image file (JPG, PNG, screenshot of a resume)**
System detects non-PDF/DOCX MIME type before attempting extraction. Does not attempt extraction. Responds: "It looks like you uploaded an image — I need the actual resume file to read it properly. If you have it as a PDF or Word document, please upload that instead. If you only have it as an image, let me know and we can work around it." Upload counter increments. Does not move forward.

**User uploads a PDF that is a scanned image with no selectable text (image-based PDF)**
Extraction runs but returns fewer than 200 characters. System detects near-empty extraction. Responds: "I wasn't able to read the text in that file — it looks like it might be a scanned image rather than a text-based PDF. Do you have a version where you can select and copy the text, or a Word document version?" Offers re-upload. Does not move forward with empty or near-empty extraction.

**User uploads a password-protected PDF**
Extraction fails with a password-protection error. System responds: "That file appears to be password protected, so I can't read it. Could you remove the password protection and re-upload, or export an unprotected version?" Does not move forward.

**User uploads a corrupted file**
Extraction fails with a generic read error. System responds: "Something went wrong reading that file — it may be corrupted or in an unsupported format. Could you try re-exporting or re-saving it and uploading again?" Does not move forward.

**User uploads a file that is too large (above 10MB)**
System checks file size before attempting extraction. If above limit, responds immediately without attempting extraction: "That file is a bit large for me to process. Resume files are usually well under 1MB — could you try compressing it or exporting a smaller version?" Does not move forward.

**User uploads a DOCX that extracts but contains almost no content (under 300 characters)**
Extraction succeeds but content volume is below threshold. This likely indicates a blank template or a severely incomplete draft. System responds: "That file didn't have much content in it — it may be a blank template or an incomplete draft. Is this the right file?" Offers re-upload option. Does not move forward.

**User uploads a file that extracts successfully but is clearly not a resume**
For example: a cover letter only, a project spec, a random document. Extraction succeeds and character count passes threshold. Stage 1 passes this through — text was extracted cleanly. Stage 2's LLM call detects the content mismatch and handles it there.

**User closes the file picker without selecting a file**
Nothing happens. UI returns to upload prompt. No error is shown. No state change. Upload counter does not increment.

**User attempts to upload multiple files in rapid succession**
System debounces. Only the most recent upload is processed. Any in-flight upload from a previous attempt is cancelled before the new one begins.

**Upload succeeds but session write fails**
Text extracted but cannot be persisted to session. System retries the session write once automatically. If the retry fails, surfaces a generic error: "Something went wrong saving your file — please try uploading again." Does not proceed with an unpersisted state under any circumstances.

**User is on a slow connection and the upload stalls**
Progress indicator is shown throughout upload. If upload exceeds 45 seconds for a file under 5MB, surfaces a message: "This is taking longer than expected — you can keep waiting or try again with a smaller file." Does not silently hang. Does not auto-cancel.

**DB schema mapping LLM call fails or returns malformed output**
Text extraction succeeded but the parallel schema mapping call returned an error, timed out, or returned output that does not match the expected schema. System retries the mapping call up to two additional times with the same input. If all three attempts fail, the session is flagged with `schema_mapping_status: "failed"` and the system proceeds to Stage 2 using only raw extracted text. Stage 2 will re-attempt mapping as part of its own extraction calls. The user sees nothing — this is a silent internal fallback.

**User has uploaded a resume before (returning to onboarding after "Finish later")**
Session already contains a prior extraction. System detects existing session state. Does not force re-upload. Presents the user with: "Welcome back — I still have your resume from your last session. Would you like to continue where you left off, or upload a new resume?" Two options: "Continue" or "Upload new resume". Continuing loads the existing session state and routes to the correct stage. Uploading new wipes the extraction data and restarts from Stage 1 with the new file.

**User uploads a file in an unexpected but readable format (e.g. .txt, .rtf)**
If the system can extract readable text above threshold, treat it identically to a successful PDF/DOCX upload. Do not penalise the user for using a less common format if the content is usable.

### LLM call specification — DB schema mapping (fires in parallel with extraction)

This call fires immediately when raw text extraction completes. It does not wait for any user action.

```
System prompt:
  You are a structured data extraction engine for Retune, a resume generation 
  platform for tech professionals. Your job is to read raw resume text and map 
  its content to a precise database schema. You do not summarise, infer, or 
  interpret. You extract only what is explicitly present in the text. If a field 
  is not present, return null for that field. Never guess or fill in values that 
  are not clearly stated in the resume.

Context:
  Raw resume text: [full extracted text]

Goal:
  Map the resume content to the Retune user profile schema. Extract every field 
  that is explicitly present. Return null for any field that cannot be directly 
  sourced from the resume text.

Output schema:
  {
    identity: {
      full_name: string | null,
      email: string | null,
      phone: string | null,
      location: string | null,
      linkedin_url: string | null,
      github_url: string | null,
      portfolio_url: string | null
    },
    experience: [
      {
        title: string | null,
        company: string | null,
        location: string | null,
        start_date: string | null,
        end_date: string | null,
        is_current: boolean,
        bullets: string[]
      }
    ],
    education: [
      {
        institution: string | null,
        degree: string | null,
        field: string | null,
        start_date: string | null,
        end_date: string | null,
        gpa: string | null,
        honours: string | null
      }
    ],
    skills: {
      raw_list: string[],
      grouped: {} 
    },
    projects: [
      {
        name: string | null,
        description: string | null,
        technologies: string[],
        url: string | null
      }
    ],
    certifications: [
      {
        name: string | null,
        issuer: string | null,
        date: string | null
      }
    ],
    languages: string[],
    awards: string[],
    publications: string[],
    volunteering: string[],
    extraction_confidence: "high" | "medium" | "low",
    extraction_notes: string
  }

Validation rules:
  - Return valid JSON only. No preamble, no explanation, no markdown formatting.
  - If a date is ambiguous (e.g. "2019" with no month), return the year only.
  - If a field appears multiple times (e.g. two emails), return the first one found.
  - extraction_confidence should reflect overall quality of the resume text:
    high = clean, well-structured, all major sections present
    medium = readable but some sections missing or formatting was messy
    low = significant content was likely missed due to formatting or scan quality
```

### Exit conditions

- Raw resume text extracted and stored in session
- Character count exceeds 300 characters
- DB schema mapping object stored in session (or flagged as failed with fallback noted)
- `onboarding_status` updated to `"extraction_complete"`
- File metadata (name, type, size, upload timestamp) stored in session

### Failure states

**User fails to upload a processable file after three attempts:**
Offer a manual text entry fallback. Display: "If you're having trouble with the file, you can paste your resume text directly here instead — just copy everything and paste it in." This text entry path feeds into Stage 2 identically to a successful file extraction. The pasted text is stored as raw extracted text and the DB schema mapping call fires on it as normal.

**Session cannot be initialised:**
Surface a hard error. Ask the user to refresh and try again. Do not proceed without a valid session.

---

## Stage 2 — Dual LLM Extraction

### Purpose

With clean resume text in session, fire two LLM calls. The first is a pure extraction call — it reads the resume and produces a clean, literal structured summary of the candidate's background with no inference. The second is an inferred summary call — it reads the full resume and produces a rich natural-language narrative of who this person is, what they have done, and what trajectory they appear to be on. This narrative becomes the seed of Retune's "understanding" section in the career profile. Neither result is shown to the user in this stage. Both are stored in session and used in Stage 3.

### Entry conditions

- Stage 1 completed successfully
- Raw resume text is present in session
- DB schema mapping object is present in session (or flagged as failed)
- `onboarding_status: "extraction_complete"`

### Happy path

Both LLM calls fire in parallel. Both return valid output above confidence threshold. Pure extraction result is stored. Inferred summary is stored. System moves to Stage 3.

### All other scenarios

**Pure extraction call returns low confidence**
The call returns `extraction_confidence: "low"`. This means the resume text was likely garbled, poorly formatted, or missing major sections. System stores the result but flags the session with `extraction_quality: "low"`. This flag is used in Stage 4 to warn the user and offer a re-upload option before presenting the summary.

**Pure extraction call returns empty or null for most fields**
Most fields returned as null. Indicates a non-resume document slipped through Stage 1 (e.g. a cover letter). System detects that fewer than 3 of the following are non-null: `identity.full_name`, `experience`, `education`, `skills`. Responds to user: "I wasn't able to find enough resume information in that file. It may be a cover letter or a different kind of document. Could you upload your actual resume?" Routes back to Stage 1. Wipes current extraction from session.

**Inferred summary call returns output that is too generic to be useful**
Summary is fewer than 100 words or contains only very generic statements ("This person has experience in software development"). System retries the inferred summary call once with a more directive prompt instructing the model to be more specific. If the retry is also thin, stores it anyway but flags `summary_quality: "low"`. Stage 2 proceeds — a thin summary does not block progress.

**One call succeeds, one call fails**
If the pure extraction call fails but the schema mapping from Stage 1 is available, use the Stage 1 schema mapping as the extraction result and flag it accordingly. If the inferred summary call fails, proceed without it — the summary is valuable but not blocking. Flag `inferred_summary_status: "failed"` in session and retry the summary call asynchronously in the background.

**Both calls time out**
Retry both calls once. If both retries fail, surface a user-facing message: "I'm having trouble reading your resume right now — please give it a moment and try again." Provide a retry button. Do not proceed with no extraction data.

**Resume contains content in multiple languages (e.g. English resume with a French education section)**
Pure extraction should still work — extract what is present regardless of language of individual sections. Inferred summary call should be prompted to produce its output in English regardless of the input language of any section.

**Resume is extremely long (e.g. academic CV with 20+ pages)**
Extraction and summary calls may hit token limits. System should truncate the input to the most recent and most relevant sections (experience, skills, education) and note in `extraction_notes` that the full document was truncated. The user is not informed of this unless they specifically ask why something is missing.

**Resume contains personal information that should not be stored (e.g. national ID numbers, date of birth, passport numbers)**
Pure extraction call should be prompted to explicitly exclude these fields and not map them to any schema field. If they appear in `extraction_notes`, strip them before storing.

### LLM call specification — Call A: Pure extraction

```
System prompt:
  You are a precise data extraction engine for Retune, a resume generation 
  platform for tech professionals. Your only job is to read the resume text 
  provided and extract its content literally and accurately. Do not infer, 
  interpret, embellish, or add information that is not explicitly present in 
  the text. If something is not clearly stated, return null.

Context:
  Raw resume text: [full extracted text from session]
  DB schema mapping (Stage 1 attempt): [schema object from session, or "unavailable"]

Goal:
  Produce a clean, literal structured extraction of the resume. Every field 
  returned must be directly traceable to a specific line or section of the 
  resume text. Cross-reference with the Stage 1 schema mapping where available 
  to verify consistency.

Extract:
  - All identity fields (name, contact info, URLs)
  - All work experience entries with titles, companies, dates, and bullet points verbatim
  - All education entries with institution, degree, field, dates
  - All skills exactly as listed
  - All projects, certifications, awards, publications, languages, volunteering
  - Overall extraction confidence and any notable issues

Output format:
  Valid JSON matching the schema defined in Stage 1. No preamble. No markdown.
  Include extraction_confidence and extraction_notes.
```

### LLM call specification — Call B: Inferred summary

```
System prompt:
  You are a senior technical recruiter and career strategist with 15 years of 
  experience hiring in the tech industry. You are reading a resume to build a 
  deep understanding of who this person is professionally. Your output will be 
  used internally by Retune to understand the candidate's background, trajectory, 
  and positioning — it will not be shown to the user directly.

Context:
  Raw resume text: [full extracted text from session]
  Structured extraction: [output of Call A]

Goal:
  Write a rich, specific, natural-language narrative that captures:
  - Who this person is as a tech professional
  - What they have actually done (not just job titles — the real work)
  - How their career has progressed and what direction it appears to be heading
  - What makes them distinctive or notable compared to a typical candidate at their level
  - Any tensions, pivots, or interesting patterns in their history
  - What kind of roles they are most credibly positioned for right now

Constraints:
  - Be specific. Name companies, technologies, and achievements. Do not use generic filler.
  - Be honest. If the resume is thin or inconsistent, note that.
  - Write in third person.
  - Minimum 150 words, maximum 400 words.
  - Do not speculate about personal information (age, nationality, etc.)
  - Output plain text only. No headers, no bullets, no JSON.
```

### Exit conditions

- Pure extraction result stored in session with confidence flag
- Inferred summary stored in session (or flagged as failed)
- `onboarding_status` updated to `"dual_extraction_complete"`
- Both results available for Stage 3

### Failure states

**Both calls fail after retries and no Stage 1 schema mapping is available:**
System cannot proceed without any extraction data. Surface a user-facing message explaining there was a technical issue processing the resume. Offer three options: try uploading the resume again, paste the resume as text, or save progress and try again later. Do not wipe the session — preserve whatever was collected.

---

## Stage 3 — Industry & Role Inference

### Purpose

Using the pure extraction and inferred summary from Stage 2, determine the industry the resume is targeted at and the professional role family the user belongs to. This inference is done entirely by the system before the user is shown anything. The user is not asked — the system infers and then presents its conclusion for confirmation in Stage 4. This stage fires one LLM call and produces three outputs: inferred industry, inferred role family, and inferred seniority level. These three values drive how Stage 4 presents the summary and how subsequent onboarding questions are framed.

### Entry conditions

- Stage 2 completed successfully
- Pure extraction result in session
- Inferred summary in session
- `onboarding_status: "dual_extraction_complete"`

### Happy path

LLM call fires with extraction and summary as context. Returns high-confidence inference of industry (e.g. Fintech), role family (e.g. Backend Engineering), and seniority (e.g. Senior IC). All three returned with confidence "high". Stored in session. System moves to Stage 4.

### All other scenarios

**Role family is ambiguous — resume spans multiple areas equally**
Common in tech. Example: a candidate who has done equal amounts of backend engineering and data engineering, or a fullstack engineer who has also done DevOps work. LLM returns `role_family_ambiguous: true` and provides two or three candidate role families ranked by weight. System stores all candidates. Stage 4 will present the top two and ask the user which feels most accurate, rather than asserting one.

**Seniority is ambiguous or contradictory**
Example: 8 years of experience but titles have been "developer" throughout with no progression. Or a candidate with 3 years of experience but staff-level responsibilities at a startup. LLM returns `seniority_ambiguous: true` with a note. Stage 4 will surface the seniority it inferred but note that it may not fully reflect the user's actual level, and offer a light correction path.

**Resume is clearly in a career transition**
Example: a backend engineer whose last two roles were in product management. Or a QA engineer who has recently completed an ML course and added ML projects. LLM detects a transition signal and flags `career_transition_detected: true` with a brief note on what the transition appears to be. This flag changes how Stage 4 is presented — the summary leads with the transition rather than the historical background.

**Industry is genuinely unclear**
Resume spans multiple industries (e.g. the same backend skills applied at a healthcare company, then a fintech, then a gaming company). LLM returns `industry_ambiguous: true` and returns the two most likely industries. Stage 4 notes the ambiguity and does not assert a single industry.

**Resume belongs to a very niche or emerging tech role**
Example: a smart contract auditor, a hardware security researcher, a developer relations engineer. LLM should still return a role family — map to the closest established category (e.g. Security Engineering, Developer Relations) rather than returning null. These are valid tech roles and should not cause the inference to fail.

**New grad with no work experience**
Experience array is empty or contains only internships. LLM should infer role family from education, projects, and skills. Seniority should be set to "Entry level" regardless of other signals. This is a distinct path that Stage 4 handles differently — the summary leads with education and projects rather than work history.

**Bootcamp graduate with non-traditional background**
Similar to new grad but may have a prior career in a completely different field. LLM should detect the career switch and flag it. Stage 4 will acknowledge both the prior career and the new direction.

**Contractor or freelancer with fragmented history**
Multiple short-tenure roles across different companies. LLM should infer role family from the skills and technologies used across all roles rather than from titles or tenure. Flag `work_pattern: "contract"` in session.

**LLM inference call returns low confidence across all three fields**
Store the low-confidence result. Stage 4 will present the inferred values with a softer framing ("Based on your resume, it looks like you might be...") and put more weight on the user's confirmation or correction.

### LLM call specification — Industry & role inference

```
System prompt:
  You are a technical recruiting expert and career analyst specialising in the 
  tech industry. You have deep knowledge of tech role families, seniority levels, 
  company types, and industry verticals. You are reading a structured resume 
  extraction and a professional narrative summary to determine three things about 
  this candidate: what industry their resume is targeted at, what role family they 
  belong to, and what seniority level they are at. You must be specific and honest. 
  If something is ambiguous, say so explicitly rather than guessing.

Context:
  Structured extraction: [Call A output from Stage 2]
  Professional narrative: [Call B output from Stage 2]

Goal:
  Infer the three core positioning signals for this candidate. These will be used 
  to frame how we present their profile to them and how we ask subsequent 
  onboarding questions.

Extract and infer:
  1. industry: The primary industry their resume is positioned in. Use specific 
     terms: Fintech, HealthTech, SaaS B2B, Gaming, Developer Tools, E-commerce, 
     AdTech, Cybersecurity, AI/ML Infrastructure, Cloud Infrastructure, etc. 
     Not generic terms like "technology" or "software".

  2. role_family: The role family this person belongs to. Use: Backend Engineering, 
     Frontend Engineering, Fullstack Engineering, Mobile Engineering, Data Engineering, 
     ML Engineering, Platform/Infrastructure Engineering, DevOps/SRE, Security 
     Engineering, Engineering Management, Technical Product Management, Developer 
     Relations, QA/Testing Engineering, or other with specification.

  3. seniority: Entry Level, Junior, Mid-level, Senior IC, Staff/Principal IC, 
     Engineering Lead, Engineering Manager, Senior Manager, Director+

  4. For each of the three: confidence (high | medium | low) and a one-sentence 
     reasoning note.

  5. Flags (set to true only if clearly applicable):
     - role_family_ambiguous
     - seniority_ambiguous
     - career_transition_detected (with transition_note if true)
     - industry_ambiguous
     - new_grad
     - work_pattern: "permanent" | "contract" | "mixed"

Output format:
  Valid JSON only. No preamble. No markdown.
  {
    industry: string,
    industry_confidence: "high" | "medium" | "low",
    industry_note: string,
    industry_ambiguous: boolean,
    industry_candidates: string[] | null,
    role_family: string,
    role_family_confidence: "high" | "medium" | "low",
    role_family_note: string,
    role_family_ambiguous: boolean,
    role_family_candidates: string[] | null,
    seniority: string,
    seniority_confidence: "high" | "medium" | "low",
    seniority_note: string,
    seniority_ambiguous: boolean,
    career_transition_detected: boolean,
    transition_note: string | null,
    new_grad: boolean,
    work_pattern: "permanent" | "contract" | "mixed"
  }
```

### Exit conditions

- Inference result stored in session
- `industry`, `role_family`, `seniority` set in session (with confidence flags)
- All ambiguity and transition flags set
- `onboarding_status` updated to `"inference_complete"`

### Failure states

**Inference call fails after two retries:**
System proceeds to Stage 4 without inference values. Stage 4 presents a more open summary that does not assert a role or industry, and puts more weight on the user's own input. Flag `inference_status: "failed"` in session.

---

---

# PART 2 — CONFIRMING AND CORRECTING

---

## Stage 4 — Summary Presentation & User Confirmation

### Purpose

Present the user with the first meaningful output they have seen since uploading their resume. This is the moment that sets the tone for the entire product experience. The summary must feel intelligent, specific, and accurate — not like a generic template. The user should feel that the system has genuinely read and understood their resume. Two options are presented: confirm the summary is accurate, or flag that something is wrong. The system must handle both paths cleanly and without losing session state.

### Entry conditions

- Stages 1, 2, and 3 completed
- Pure extraction, inferred summary, industry, role family, and seniority all in session
- `onboarding_status: "inference_complete"`

### Happy path

System generates a summary message using the inference results and inferred narrative. User reads the summary, finds it accurate, clicks "Looks correct", and the session is updated to reflect confirmation. System moves to Stage 5 (resume completeness assessment) and then Stage 6 (onboarding questions).

### Summary message format

The summary presented to the user should follow this structure:

> "Thanks for sharing your resume. Based on what I've read, you're a **[role family]** with around **[X years]** of experience, primarily in **[industry]**. You've worked at [company 1] and [company 2], with a strong focus on [specific area from inferred summary]. [One sentence noting something distinctive or notable if present.]"

If `career_transition_detected: true`:
> "I noticed your background is in [prior area], but it looks like you're moving toward [new direction] — I'll keep that in mind as we build your profile."

If `new_grad: true`:
> "I can see you're earlier in your career — I've pulled in your projects and education since that's where most of your story is right now."

If `extraction_quality: "low"` (flagged in Stage 2):
> "I was able to read most of your resume, though the formatting made a few sections harder to parse — you may want to double-check the details below."

Below the summary message, include a collapsible dropdown labelled "See what I extracted from your resume" that shows the raw structured extraction in a readable format (not raw JSON — formatted cards per section).

Then present two buttons: **"Looks correct"** and **"Something is wrong"**.

### All other scenarios

**User clicks "Looks correct" immediately without reading**
This is fine. The system has no way to enforce reading. Accept the confirmation and proceed. The correction loop in Stage 5 exists as a safety net.

**User clicks "Something is wrong" without specifying what**
System opens a chat input and prompts: "No problem — what doesn't look right? You can describe it in plain language, for example: 'my job title is wrong', 'you missed a role I had at a company', or 'my skills list is incomplete'." Waits for user input. Does not proceed until a correction is described or the user explicitly chooses to skip.

**User types a correction before clicking either button**
Some users will bypass the buttons and type directly. System should detect free-text input and route it into the correction flow (Stage 5) rather than ignoring it.

**User opens the extracted resume dropdown and sees an obvious error**
User may click "Something is wrong" having seen a specific field that is incorrect in the dropdown. The correction flow (Stage 5) handles this. The dropdown showing the extraction was useful — it helped the user identify the issue.

**Inference failed (Stage 3 failure state) — no role, industry, or seniority available**
Summary cannot be role/industry-specific. Present a more open version: "Thanks for sharing your resume. I've read through it and pulled out your experience, skills, and education. Does this look right to you?" Summary is less impressive but still functional. User still gets the confirm/correct choice.

**Role family is ambiguous (two candidates returned in Stage 3)**
Summary presents both options: "It looks like you could be positioned as either a **[role family A]** or a **[role family B]** — which of these feels more accurate to how you see yourself?" This is a single-select question embedded in the summary presentation. The user's answer is stored as `confirmed_role_family` in session.

**Seniority is ambiguous**
Summary states the inferred seniority but adds: "I've estimated you're at [seniority level] — does that feel right, or would you describe yourself differently?" Light correction path. User can confirm or type a correction.

**User has a very thin resume (new grad or minimal experience)**
Summary leads with education and projects rather than work history. Tone is adjusted to be encouraging rather than analytical: "It looks like you're earlier in your career — I've built your starting profile around your projects and education. Let's make sure I have the details right."

**User does not interact for an extended period (idle on the summary screen)**
No auto-advance. Session remains open. If the user returns later (within session validity window), they see the same summary. If the session has expired, they are prompted to restart or resume from the last saved point.

**User tries to go back after seeing the summary**
There is no "back" in the onboarding flow. If the user wants to upload a different resume, they must use "Start over" which wipes the session and returns to Stage 1.

### LLM call specification — Summary generation

This call fires when Stage 4 is entered, using the session data to produce the user-facing summary message.

```
System prompt:
  You are the onboarding assistant for Retune, a resume generation platform for 
  tech professionals. You are about to show a user the first thing they will see 
  after uploading their resume. Your job is to write a summary message that makes 
  them feel understood — specific, intelligent, and warm. Not generic. Not robotic. 
  You are not writing a formal bio. You are writing a first impression that says 
  "I actually read your resume and I understand who you are."

Context:
  Structured extraction: [Call A output]
  Professional narrative: [Call B output]
  Inferred industry: [industry from Stage 3]
  Inferred role family: [role_family from Stage 3]
  Inferred seniority: [seniority from Stage 3]
  Extraction quality: [high | medium | low]
  Flags: [career_transition_detected, new_grad, role_family_ambiguous, 
          seniority_ambiguous, industry_ambiguous]

Goal:
  Write the user-facing summary message that will be shown immediately after resume 
  upload. The message should confirm what was understood about the user and set up 
  the confirm/correct choice.

Constraints:
  - Be specific. Name actual companies and technologies from the resume.
  - Maximum 4 sentences. Do not ramble.
  - Warm but professional tone.
  - Do not use the word "impressive" or other hollow praise.
  - If extraction quality was low, acknowledge it briefly and without alarm.
  - If career transition detected, acknowledge it naturally.
  - If role family is ambiguous, present both options as a question (see format above).
  - Output plain text only. No markdown, no JSON, no headers.
```

### Exit conditions

- User has clicked "Looks correct" or submitted a correction
- `summary_confirmed: true` OR `correction_submitted: true` set in session
- `confirmed_role_family`, `confirmed_industry`, `confirmed_seniority` set in session
- `onboarding_status` updated to `"summary_confirmed"` or `"correction_in_progress"`

### Failure states

**Summary generation call fails:**
Fall back to a template-based summary using raw extraction fields. Less eloquent but functional. Do not block the user — show what is available. Flag `summary_generation_status: "fallback"` in session.

---

## Stage 5 — Correction Handling Loop

### Purpose

The user has indicated something is wrong with the extracted summary. This stage exists to understand exactly what is wrong, apply the correction to the session data, and re-confirm with the user before moving on. This is a conversational correction loop, not a form. The user describes the issue in plain language and the system interprets, applies, and confirms. The session must remain fully intact throughout. No data is wiped unless the user explicitly requests a full restart.

### Entry conditions

- User clicked "Something is wrong" in Stage 4
- Session contains full extraction and inference data
- `correction_submitted: true` in session
- `onboarding_status: "correction_in_progress"`

### Happy path

User describes the correction in plain language. LLM interprets the correction, identifies the specific field(s) affected, applies the change to the session data, and presents the updated summary. User confirms the updated summary is correct. Session is updated. System proceeds to Stage 6.

### All other scenarios

**User describes a simple, clear field correction**
Example: "My job title at Company X should be Senior Software Engineer, not Software Engineer." LLM identifies the specific experience entry, updates the title field, re-presents the relevant portion of the summary with the correction applied, and asks: "Does that look right now?" If user confirms, loop ends.

**User describes a missing role or experience entry**
Example: "You missed my job at Stripe — I was there for two years before my current role." LLM cannot fabricate the missing entry from nothing. Responds: "I don't have details about that role from your resume — could you tell me your title, what you worked on there, and roughly when you were there? I'll add it to your profile." Collects the information conversationally and adds the entry to the session data.

**User describes a missing skill**
Example: "You didn't include Rust even though it's in my resume." LLM checks the extraction — if the skill was genuinely missed (common with unusual formatting), adds it to the skills array. If the skill is not in the resume text at all, adds it to the session data with a note that it was user-supplied rather than extracted. These two cases should be tracked separately.

**User's correction is vague or unclear**
Example: "The experience section is wrong." LLM responds: "Could you be more specific? For example, is a date wrong, a job title incorrect, or is something missing entirely?" Does not attempt to guess what the correction is. Asks one targeted clarifying question.

**User's correction contradicts the resume text**
Example: User says their title was "VP of Engineering" but the resume clearly says "Engineering Manager". LLM does not argue. Applies the user's correction and notes it as a user-supplied override in the session. The user's stated version takes precedence over the extracted version in all cases.

**User submits multiple corrections in one message**
Example: "The title is wrong, you missed a company, and my skills list is incomplete." LLM parses all three, confirms what was heard, applies each correction in sequence, and then presents a consolidated updated summary for confirmation. Does not ask the user to submit corrections one at a time.

**User's correction is about the inferred summary rather than the extraction**
Example: "I'm not a backend engineer — I'm more of a platform engineer." This is an inference correction, not a field correction. LLM updates `confirmed_role_family` in session and re-presents the summary with the updated framing. Does not alter the raw extraction data.

**User keeps saying something is wrong but cannot articulate what**
After two rounds of vague responses, system responds: "No problem — let's move forward and you can make any adjustments as we go. Your profile isn't locked in at this stage." Moves to Stage 6. Flags `correction_unresolved: true` in session so that later stages can surface more confirmation prompts.

**User is frustrated or expresses irritation**
Example: "This is completely wrong, nothing looks right." LLM responds calmly: "I'm sorry about that — let's fix it together. What would you like to start with?" Does not argue, does not defend the extraction, does not ask multiple questions. One calm prompt, then listen.

**User asks to start over entirely**
Wipes session extraction data. Returns to Stage 1. Preserves user account data (email, signup info). Does not require re-signup.

**Correction loop exceeds four rounds without resolution**
After four correction exchanges without reaching confirmation, system offers: "Would you like to move on for now and come back to editing your profile details later? You'll be able to make changes at any time from your dashboard." This is an escape valve — it does not signal failure, it signals that the correction loop has a natural limit and the user should not be trapped in it.

### LLM call specification — Correction interpretation and application

```
System prompt:
  You are the onboarding assistant for Retune. A user has just told you that 
  something in their extracted profile is wrong. Your job is to understand 
  exactly what they want to change, apply the change to their profile data, 
  and confirm the change with them. You must be precise and specific. Do not 
  guess what they mean. If unclear, ask one focused question. Never argue 
  with the user — their stated version always takes precedence.

Context:
  Current session extraction: [full extraction object from session]
  Current inferred summary: [summary from session]
  User's correction message: [raw user input]
  Correction round: [1 | 2 | 3 | 4]

Goal:
  1. Identify which specific field(s) the correction applies to.
  2. Determine the corrected value(s).
  3. If the correction is clear: apply it and return the updated extraction object 
     plus a confirmation message for the user.
  4. If the correction is unclear: return a single clarifying question. 
     Do not apply any changes yet.
  5. If the user is supplying new information not in the resume: flag it as 
     user_supplied: true in the relevant field.

Output format:
  {
    correction_understood: boolean,
    clarifying_question: string | null,
    fields_changed: string[],
    updated_extraction: object,
    user_confirmation_message: string,
    user_supplied_fields: string[]
  }

  If correction_understood is false, only return clarifying_question. 
  Do not return updated_extraction.
```

### Exit conditions

- User has confirmed the corrected summary is accurate
- Updated extraction object stored in session
- `summary_confirmed: true` set in session
- User-supplied field overrides logged separately
- `onboarding_status` updated to `"summary_confirmed"`

### Failure states

**Correction interpretation call fails repeatedly:**
Offer the user the option to edit their profile manually after onboarding is complete. Move forward with the existing (possibly incorrect) extraction. Flag the fields in question as `needs_review: true`. Surface a note on the dashboard: "Some of your profile details may need review — you flagged an issue during setup."

---

## Stage 6 — Resume Completeness Assessment & Path Branching

### Purpose

Before asking onboarding questions, the system needs to understand how complete the resume is and what the user's specific situation is. A new grad has a fundamentally different onboarding path than a senior engineer with 12 years of experience. A career changer needs different questions than someone staying in the same lane. This stage fires one LLM call to assess the completeness of the confirmed extraction and determine which onboarding question path the user should follow. It produces a branching decision that gates the questions in Stage 7.

### Entry conditions

- Stage 5 completed (summary confirmed, corrections applied)
- Final confirmed extraction stored in session
- `onboarding_status: "summary_confirmed"`

### Happy path

Completeness assessment call fires. Returns a completeness score and a recommended question path. System selects the appropriate question set for Stage 7. Moves to Stage 7 with the path decision stored in session.

### All other scenarios

**Resume is complete and experience-rich (5+ years, multiple roles, clear progression)**
Standard path. Full onboarding question set is presented. No special handling needed.

**Resume is thin — new grad or under 2 years of experience**
`completeness_path: "new_grad"` set. Onboarding questions are adjusted: work experience questions are replaced with questions about projects, academic work, and what the user is trying to accomplish in their first role. Tone is adjusted to be more supportive and forward-looking.

**Resume shows a clear career transition**
`completeness_path: "career_changer"` set. Onboarding questions include a specific block on what the user is moving toward and how they want their prior career represented — as an asset, as context, or minimised entirely.

**Resume is experience-rich but has clearly not been updated recently**
Detection signal: most recent role is 2+ years ago, or the resume formatting/language feels dated. Flag `resume_stale: true`. Onboarding questions include a specific prompt: "Is there anything you've worked on recently that isn't on your resume yet? We can add it as we go."

**Resume contains only contractor roles**
`work_pattern: "contract"` confirmed. Onboarding questions adjust to acknowledge this pattern and ask how the user wants their contracting history presented — as a deliberate choice, a consulting practice, or a series of individual roles.

**Resume is extremely strong (FAANG, staff-level, notable companies)**
No special path change. But the inferred summary and subsequent question framing should reflect the user's level. Questions should not feel basic or condescending.

**Resume shows significant employment gaps**
System detects gaps of 12+ months between roles. Does not ask about them directly — that is intrusive. But flags `employment_gaps_present: true` in session so that resume generation later knows to handle gap periods with care.

### LLM call specification — Completeness assessment and path branching

```
System prompt:
  You are a resume strategy expert. You are assessing a candidate's confirmed 
  resume profile to determine how complete it is and which onboarding question 
  path is most appropriate for them. Your assessment determines what questions 
  we ask next. Be honest and precise.

Context:
  Confirmed extraction: [final extraction from session]
  Confirmed role family: [confirmed_role_family]
  Confirmed seniority: [confirmed_seniority]
  Flags from Stage 3: [new_grad, career_transition_detected, work_pattern, 
                        resume_stale if applicable]

Goal:
  Assess the completeness and quality of this candidate's profile and recommend 
  the appropriate onboarding path.

Assess:
  - completeness_score: 0–100 (how complete and usable is this profile for 
    resume generation?)
  - missing_critical_fields: list of fields that are absent and would 
    significantly limit resume generation quality
  - completeness_path: "standard" | "new_grad" | "career_changer" | "contractor" | "returning"
  - resume_stale: boolean (most recent role more than 18 months ago)
  - employment_gaps_present: boolean
  - has_quantified_achievements: boolean (does any experience entry contain 
    measurable outcomes?)
  - special_handling_notes: any other notes relevant to how questions should be 
    framed for this specific user

Output format:
  Valid JSON only. No preamble.
```

### Exit conditions

- Completeness assessment stored in session
- `completeness_path` set in session
- Question set for Stage 7 determined
- `onboarding_status` updated to `"path_branched"`

### Failure states

**Assessment call fails:**
Default to `completeness_path: "standard"` and proceed. Missing the path optimisation is not blocking — standard questions work for most users.

---

---

# PART 3 — ONBOARDING QUESTIONS AND COMPLETION

---

## Stage 7 — Resume Generation Questions

### Purpose

Collect the information that cannot be inferred from the resume alone but is essential for generating high-quality, targeted resumes. Every question asked in this stage must have a direct, traceable impact on resume generation output. Questions that are only useful for job searching, matching, or analytics are explicitly excluded from this stage. The LLM manages the conversation — it evaluates every answer before accepting it, follows up when needed, and maintains a live map of what has and has not been collected.

The questions in this stage cover four areas:
1. Target role and positioning
2. Underrepresented experience or skills
3. De-emphasis preferences
4. Resume framing for specific situations (career transition, gap, promotion target)

### Entry conditions

- Stage 6 completed
- Completeness path set in session
- `onboarding_status: "path_branched"`
- Question map initialised in session with all target fields set to `null`

### The question map

The session maintains a live question map — a structured object tracking every field this stage needs to collect, its current value, its confidence level, and whether it was collected via selection or free text. Before any question is asked, the map is checked to see what is still needed. When a user volunteers information that answers a future question, that future question is marked collected and skipped.

```json
{
  "target_role": { "value": null, "confidence": null, "source": null },
  "target_role_specificity": { "value": null, "confidence": null, "source": null },
  "underrepresented_skills": { "value": null, "confidence": null, "source": null },
  "deemphasis_preferences": { "value": null, "confidence": null, "source": null },
  "resume_frame": { "value": null, "confidence": null, "source": null },
  "career_transition_framing": { "value": null, "confidence": null, "source": null },
  "gap_handling": { "value": null, "confidence": null, "source": null },
  "achievement_depth": { "value": null, "confidence": null, "source": null }
}
```

Fields are only asked if still null when their turn arrives in the sequence. Fields already answered by a prior voluntary response are skipped.

### Per-question LLM evaluation — standard structure

Every answer submitted by the user (whether typed or selected) triggers an LLM evaluation call before the value is accepted. This call determines whether the answer actually addresses the question and whether the value is specific enough to be useful for resume generation.

```
System prompt:
  You are evaluating a user's answer to an onboarding question for Retune, a 
  resume generation platform. Your job is to determine whether the answer 
  genuinely addresses the question being asked AND whether the answer is 
  specific enough to be actionable for resume generation. A valid answer that 
  is too vague is not acceptable. You must also check whether the answer 
  contains information relevant to other questions in the map — if so, 
  extract and record those values too.

Context:
  Question asked: [question text]
  Field being collected: [field name]
  What a valid answer looks like: [field-specific validity criteria]
  What actionability requires: [field-specific specificity criteria]
  User's answer: [raw user input]
  Current question map: [full question map with current values]
  User's confirmed extraction: [key fields from confirmed extraction]

Goal:
  1. Determine if the answer is valid (addresses the question).
  2. Determine if the answer is specific enough to be actionable.
  3. Extract the value for the target field.
  4. Extract any values for other fields in the map that were volunteered.
  5. If invalid or too vague: generate a single follow-up question.
  6. If valid and specific: return the extracted value with confidence.

Output format:
  {
    answer_valid: boolean,
    answer_actionable: boolean,
    extracted_value: string | null,
    confidence: "high" | "medium" | "low",
    follow_up_question: string | null,
    additional_fields_collected: {
      field_name: { value: string, confidence: string }
    },
    updated_question_map: object
  }
```

### Question 1 — Target role

**Question presented to user:**
> "What kind of role is this resume being targeted at? You can be specific — a job title, a type of team, or a type of company works."

**Selection options (chips, based on inferred role family):**
Auto-generated from confirmed role family. For example, if role family is Backend Engineering: "Backend Engineer", "Senior Backend Engineer", "Staff Engineer", "Platform Engineer", "API Engineer". Plus "Something else — I'll type it."

**What we are collecting:** `target_role` — the specific role or role type the user wants this resume to target.

**Validity criteria:** Must be a role or role description specific enough to inform resume framing. "Software engineer" is valid. "Something in tech" is not.

**Actionability criteria:** Must be specific enough that a resume generator could use it to decide which skills to lead with, which achievements to foreground, and how to frame the professional summary. "Backend engineer" is minimally actionable. "Senior backend engineer at a Series B fintech startup" is highly actionable.

**All other scenarios for this question:**

*User selects a chip:* Treat as valid. Check actionability — chip selections are usually specific enough. Confirm with a light follow-up only if the chip is generic (e.g. "Software Engineer" with no seniority). If specific enough, accept and move on.

*User types "I'm not sure":* Respond: "That's okay — is there a type of role or a job title you've seen recently that felt like a good fit? Even a rough idea helps." One follow-up, then if still unclear, accept null and flag for Stage 8 to revisit.

*User types a very specific answer that includes company type, seniority, and tech stack:* Extract all components. Map seniority to `confirmed_seniority` if it differs from what was inferred. Map company type to a new `target_company_type` field. Accept all volunteered specificity.

*User types a role that contradicts their resume background significantly:* Do not challenge the user. Accept the answer. Flag `career_pivot_stated: true` in session. The resume generator will need to handle the gap between background and target — that is its job, not onboarding's job.

*User types a role outside of tech entirely:* Remind the user gently that Retune is currently focused on tech roles, and ask if they meant a tech-adjacent version of the role they named (e.g. "Technical Project Manager" if they said "Project Manager"). If they confirm they mean a non-tech role, accept it and flag `out_of_scope_role: true` — do not block them.

---

### Question 2 — Target role specificity (conditional)

Only asked if `target_role` was collected at a low specificity level.

**Question presented to user:**
> "When you think about the kind of [role] role you're targeting — is there a particular focus area, company size, or type of work that matters most to you?"

**What we are collecting:** `target_role_specificity` — additional context that makes the target role actionable for resume generation.

**All other scenarios:**

*User says it doesn't matter:* Accept. Store "open" as the value. Do not push further.

*User gives a very long answer with multiple preferences:* Extract all of them. Map each to the appropriate field. Thank the user for the detail.

---

### Question 3 — Underrepresented skills or experience

**Question presented to user:**
> "Is there anything you're good at or have worked on that you feel isn't well represented in your resume right now?"

**Selection options (chips):**
"Side projects", "Open source contributions", "Leadership experience", "Specific technologies", "Domain knowledge", "Nothing — it's all there"

**What we are collecting:** `underrepresented_skills` — skills, experience, or knowledge areas the user has that the resume doesn't adequately reflect.

**Validity criteria:** Any honest answer is valid. "Nothing" is a valid answer. "Lots of things" is not specific enough — follow up.

**All other scenarios:**

*User selects "Nothing — it's all there":* Accept immediately. Move on.

*User selects "Specific technologies" and does not specify which:* Follow up: "Which technologies would you like to make sure are highlighted?"

*User types a very long list:* Extract all items. Store as an array. Do not truncate.

*User mentions something that is actually already prominent in their extracted resume:* Note the discrepancy. Do not argue. Accept the user's perception — if they feel it is underrepresented, the resume generator should treat it as something to foreground more prominently.

---

### Question 4 — De-emphasis preferences

**Question presented to user:**
> "Is there anything in your background you'd prefer to keep minimal or not lead with in this resume?"

**Selection options (chips):**
"Older roles (5+ years ago)", "Academic work", "A specific job or company", "A particular skill or tool", "Nothing — include everything", "Not sure"

**What we are collecting:** `deemphasis_preferences` — content areas the user wants the resume generator to minimise, exclude, or handle carefully.

**All other scenarios:**

*User selects "A specific job or company" but does not name it:* Follow up: "Which role or company are you thinking of? I won't ask why — I just need to know which one to keep minimal." One follow-up only. If user declines to name it, accept and note that a specific entry was flagged for de-emphasis but not named — the user can identify it during resume review.

*User says they want to remove something entirely:* Clarify whether they mean remove from the profile (delete from the record) or simply not feature it prominently in generated resumes. These are different actions with different consequences. Explain the difference briefly and ask which they prefer.

*User has a gap in their employment history and asks not to draw attention to it:* Accept. Flag `gap_handling: "minimise"` in the question map — this answers question 7 (gap handling) at the same time.

---

### Question 5 — Resume framing intent

**Question presented to user:**
> "When someone reads this resume, what's the single most important thing you want them to take away about you?"

**No selection chips for this question — free text only.**

**What we are collecting:** `resume_frame` — the core impression the user wants to make. This directly informs the professional summary section of every generated resume.

**Validity criteria:** Must be a statement about professional identity or value, not a generic aspiration. "I want them to see me as a strong technical leader who can ship" is valid. "I want a good job" is not.

**Actionability criteria:** Must be specific enough for the resume generator to translate into a professional summary opening line. Ideally includes a claim about what makes this person distinctive.

**All other scenarios:**

*User writes something generic ("I want them to think I'm a good engineer"):* Follow up: "What specifically about your engineering would you want them to notice — is it the scale you've worked at, the types of problems you've solved, the way you collaborate, something else?" One follow-up. If still generic after one follow-up, accept and flag `resume_frame_confidence: "low"`.

*User writes something very long and philosophical:* Extract the core claim. Summarise it back to the user for confirmation: "So the main thing you want to convey is [extracted claim] — does that sound right?" Confirm before storing.

*User says they don't know:* Respond: "That's okay — take a moment and think about the last time you described your work to someone and they seemed genuinely impressed. What did you tell them?" If still no answer, skip and flag as unanswered.

---

### Question 6 — Career transition framing (conditional — only if `career_transition_detected: true`)

**Question presented to user:**
> "I noticed your background is in [prior area] and you're targeting [new direction]. How do you want your earlier experience to show up in this resume?"

**Selection options (chips):**
"Feature it as relevant context", "Keep it brief — focus on where I'm going", "Only include what transfers directly", "I'll figure it out later"

**What we are collecting:** `career_transition_framing` — how the resume generator should handle the user's prior career relative to their new target.

**All other scenarios:**

*User asks "what's the difference between the options?":* Explain briefly: "Featuring it as context means your earlier career is part of your story — some employers find it valuable. Keeping it brief means we lead with your new direction and mention the prior background without dwelling on it. Only transferable skills means we filter your history to highlight only the parts that apply to where you're going."

*User selects "I'll figure it out later":* Accept. Flag `career_transition_framing: "deferred"`. Resume generator defaults to a balanced approach until specified.

---

### Question 7 — Gap handling (conditional — only if `employment_gaps_present: true`)

**Question presented to user:**
> "I noticed there are some gaps in the timeline on your resume. How would you like to handle those?"

**Selection options (chips):**
"Leave them as is — no explanation", "I'd like to add a brief note for the main gap", "Minimise them — don't draw attention", "I'll handle it in the resume itself"

**What we are collecting:** `gap_handling` — instructions for how the resume generator should treat employment gaps.

**Note:** This question is phrased neutrally. It does not ask why the gaps exist. It does not imply they are a problem. The user's answer drives the handling — no further questions about gaps are asked.

---

### Question 8 — Achievement depth (conditional — only if `has_quantified_achievements: false`)

**Question presented to user:**
> "I noticed your resume doesn't have many specific numbers or outcomes yet — things like 'reduced load time by 40%' or 'grew the API to handle 10M requests/day'. Do you have any metrics or measurable results from your work that we could add?"

**Selection options (chips):**
"Yes — I'll share some", "My work isn't easily measured", "I'd rather not include metrics", "I'm not sure — help me think"

**What we are collecting:** `achievement_depth` — whether quantified achievements can be added to strengthen the profile, and what they are if so.

**All other scenarios:**

*User selects "Yes — I'll share some":* Open a conversational prompt: "Great — go ahead and share whatever comes to mind. Even rough numbers are useful. For example: team size, user scale, performance improvements, revenue impact, projects delivered." Collect whatever the user shares. Store as a list of raw achievement statements to be used by the resume generator.

*User selects "My work isn't easily measured":* Accept completely. Do not push. Some roles genuinely do not produce easily quantifiable outcomes. Flag `achievement_depth: "not_applicable"`.

*User selects "I'm not sure — help me think":* Walk them through a brief prompt: "Think about a project you're proud of from your time at [most recent company]. What changed because of your work? Who used it? How many people or how much did it affect?" Collect whatever emerges. Do not pressure for precision.

*User shares achievements during the answer to a different question:* Extract them. Add to the achievement list. Mark `achievement_depth` as collected in the question map.

### Exit conditions

- All non-null, non-conditional question map fields have been collected
- All conditional fields have been collected or explicitly skipped
- Collected values meet minimum confidence thresholds (medium or above)
- Low-confidence fields flagged in session with `needs_review: true`
- `onboarding_status` updated to `"resume_questions_complete"`

### Failure states

**User abandons mid-question stage:**
Session is saved at the current question map state. On return, user is resumed from the last unanswered question. Already-collected values are preserved.

**User answers all questions with minimal engagement:**
All answers are technically valid but at minimum confidence. Flag the profile as `profile_depth: "shallow"`. Resume generator uses conservative defaults for all flagged fields. Dashboard surfaces a prompt to enrich the profile after onboarding.

---

## Stage 8 — Voice & Tone Extraction

### Purpose

Collect the information needed to generate resumes that sound like the user — not like a generic AI-written document. This stage extracts three things: how the user describes themselves and their work (their natural professional voice), what tone they want their resume to carry, and what they actively want to avoid. Every question in this stage feeds directly into the prompt context used by the resume generator. None of these questions are about job searching.

### Entry conditions

- Stage 7 completed
- All resume generation questions collected (or flagged as unanswered)
- `onboarding_status: "resume_questions_complete"`

### Happy path

User answers three focused questions about voice and tone. LLM evaluates each answer, extracts usable signals, and stores them in the voice profile. System moves to Stage 9.

### The voice profile object

```json
{
  "natural_voice_sample": null,
  "tone_preferences": [],
  "tone_aversions": [],
  "self_description_style": null,
  "language_patterns_to_use": [],
  "language_patterns_to_avoid": []
}
```

### Question 1 — Natural voice sample

**Question presented to user:**
> "In your own words — how would you describe what you do professionally to someone who works in tech but doesn't know your specific area?"

**No chips — free text only.**

**What we are collecting:** A raw sample of how the user naturally writes and describes themselves. This is used directly to calibrate the language style of generated resumes.

**What makes a valid answer:** Any genuine attempt at self-description in the user's own words. Even a rough or informal answer is useful — the informality itself is data.

**Actionability criteria:** The response must be long enough to extract language patterns from. Minimum ~30 words. Single-word or very short answers are not usable.

**All other scenarios:**

*User writes a very formal, polished answer:* The formality itself is a signal. Store as-is. Tag `self_description_style: "formal"`.

*User writes casually, with contractions and informal language:* Store as-is. Tag `self_description_style: "conversational"`. This does not mean the resume will be informal — but the language patterns will be more natural and less corporate.

*User writes in bullet points or fragments:* Valid. Store as-is. Tag `self_description_style: "structured/terse"`.

*User writes a very long, comprehensive answer:* Store in full. Do not truncate. This is maximum signal — preserve it.

*User writes "I don't know how to describe myself":* Prompt: "That's okay — imagine you're at a tech meetup and someone asks what you do. What's the version you'd tell them?" One prompt only. If still stuck, skip and flag as unanswered. The voice profile can be built from other signals.

*User copies their current LinkedIn bio or resume summary:* Valid — but note it as `sourced_from: "existing_copy"`. This means the user's voice is already formalised and may not reflect their natural register. Flag for the resume generator to be aware that this sample may not represent their true natural voice.

### Question 2 — Tone preferences

**Question presented to user:**
> "How would you describe the tone you want your resume to have? Pick as many as feel right."

**Selection chips:**
"Direct and confident", "Technical and precise", "Warm and collaborative", "Leadership-focused", "Results-driven", "Understated", "Bold", "Conversational"

**Free text option:** "Something else — I'll describe it"

**What we are collecting:** `tone_preferences` — an array of tone signals that the resume generator uses to calibrate language choices.

**All other scenarios:**

*User selects contradictory tones (e.g. "Conversational" and "Formal"):* Accept both. The resume generator will balance them contextually — conversational structure with precise language, for example. Do not flag as a conflict.

*User selects all chips:* Accept. This signals that the user has no strong tone preference and is deferring to the system. Store `tone_preferences: "open"` rather than a full list.

*User types a tone description not on the list:* Extract and store in `tone_preferences` as a custom entry. Do not penalise for going off-chip.

*User says their tone depends on the company:* Valid and useful signal. Store `tone_preferences: "context_dependent"` and note the user's description of how it varies.

### Question 3 — Tone aversions

**Question presented to user:**
> "Is there anything you'd never want your resume to sound like? Things that feel off-brand for you?"

**Selection chips:**
"Corporate buzzwords", "Overly humble", "Overly boastful", "Jargon-heavy", "Vague or fluffy", "Too casual", "First-person (I/we)", "Nothing — I'm open"

**What we are collecting:** `tone_aversions` and `language_patterns_to_avoid` — active signals used to constrain the resume generator's language choices.

**All other scenarios:**

*User selects "Nothing — I'm open":* Accept. Store empty aversions array. The generator has no constraints.

*User provides a very specific aversion (e.g. "Don't use the word 'synergy' or 'leverage'"):* Store the specific terms in `language_patterns_to_avoid`. These will be passed as explicit exclusion instructions to the resume generator.

*User says they hate how AI-written text sounds:* This is a highly valuable signal. Store as `aversion_to_ai_language: true`. The resume generator will use this to maximise naturalness and minimise template-sounding phrases.

### LLM call specification — Voice pattern extraction

Fires after all three voice questions are answered.

```
System prompt:
  You are a writing style analyst. You have collected three responses from a 
  user during onboarding for Retune, a resume generation platform. Your job is 
  to analyse these responses and extract a structured voice profile that the 
  resume generator can use to produce resumes that sound like this specific person 
  — not like a generic AI-written document.

Context:
  Natural voice sample: [user's answer to question 1]
  Tone preferences selected: [array from question 2]
  Tone aversions selected: [array from question 3]
  Self-description style tagged: [formal | conversational | structured/terse | other]
  User's confirmed role family and seniority: [from session]

Goal:
  Produce a structured voice profile that captures:
  1. The user's natural sentence structure preferences (short and punchy? long and 
     explanatory? fragment-based?)
  2. Vocabulary register (technical terms they naturally use, level of formality)
  3. What they lead with (results first? context first? method first?)
  4. Specific phrases or words to use or avoid
  5. Overall tone calibration summary in two sentences — this will be included 
     verbatim in the resume generator's system prompt

Output format:
  {
    sentence_structure: string,
    vocabulary_register: string,
    leading_pattern: "results_first" | "context_first" | "method_first" | "mixed",
    phrases_to_use: string[],
    phrases_to_avoid: string[],
    tone_calibration_summary: string,
    confidence: "high" | "medium" | "low"
  }
```

### Exit conditions

- All three voice questions answered or explicitly skipped
- Voice profile extracted and stored in session
- `tone_calibration_summary` available for use in resume generator system prompt
- `onboarding_status` updated to `"voice_extraction_complete"`

### Failure states

**User skips all voice questions:**
Voice profile is built from defaults based on role family and seniority. Flag `voice_profile_source: "default"`. Dashboard surfaces a prompt to complete the voice profile after onboarding.

**Voice extraction LLM call fails:**
Store raw responses as-is. Flag `voice_profile_status: "raw_only"`. Resume generator uses the raw responses directly as context rather than the structured profile.

---

## Stage 9 — Confidence Audit, Gap Surfacing & Profile Commit

### Purpose

Before committing the profile to the database, perform a final audit of everything collected across all stages. Identify any fields that are low-confidence, any questions that were skipped, any corrections that were unresolved, and any contradictions between what was extracted and what the user stated. Surface a concise summary to the user showing what was collected and what is still missing. Give the user one final opportunity to fill critical gaps before the profile is committed. Then commit everything to the database and redirect to the dashboard.

### Entry conditions

- Stages 1 through 8 completed
- All extraction, inference, correction, question map, and voice profile data in session
- `onboarding_status: "voice_extraction_complete"`

### Happy path

Confidence audit fires. No critical gaps found. All fields at medium confidence or above. Profile commit screen shown to user. User reviews a summary of what was collected. Clicks "Looks good — take me to my dashboard". Profile is committed to the database. `users.onboarding_completed` set to true. Background understanding generation fires asynchronously. User is redirected to `/dashboard`.

### Confidence audit — what is checked

The audit LLM call reviews the complete session and produces a gap report covering:

**Critical fields (blocking if missing):**
- `confirmed_role_family`
- `confirmed_seniority`
- `target_role`
- `resume_frame`
- At least one experience entry with a title and company
- At least one skill

**Important fields (surfaced but non-blocking):**
- `underrepresented_skills`
- `deemphasis_preferences`
- `tone_calibration_summary`
- `achievement_depth` (if role type typically produces measurable outcomes)

**Advisory fields (shown on dashboard as enrichment prompts, not surfaced in audit):**
- `career_transition_framing` (if applicable)
- `gap_handling` (if applicable)
- `natural_voice_sample`

### All other scenarios

**One or more critical fields are missing**
Audit surfaces the missing fields one at a time. For each missing critical field, presents a simplified version of the original question — shorter, lower friction, with an explicit "Skip for now" option. If the user skips a critical field, it is flagged on the dashboard with a prompt to complete it before generating their first resume.

**One or more important fields are low-confidence**
Audit surfaces these with an option to clarify. Phrasing: "I wasn't totally sure what you meant when you said [X] — did you mean [interpretation A] or [interpretation B]?" User selects or types. If user confirms either interpretation, confidence is upgraded. If user says neither, field is re-flagged as unanswered.

**User-supplied field overrides exist (from Stage 5)**
Audit notes that some fields were manually corrected by the user and not extracted from the resume. These are flagged in the DB with `source: "user_supplied"` to ensure the resume generator treats them as authoritative.

**Inferred summary quality was low (flagged in Stage 2)**
Audit triggers a final background call to regenerate the inferred summary using all the enriched data now in session — confirmed extraction, voice profile, question map answers. This richer summary is used as the updated seed for Retune's understanding section.

**Contradictions detected between extraction and user answers**
For example: extraction shows 5 years of experience but user stated 8 years during correction. Audit surfaces the contradiction: "There's a slight discrepancy in your years of experience — your resume suggests around 5 years, but you mentioned 8. Which should we use?" User selects. Stored with `source: "user_confirmed"`.

**User wants to make final changes before committing**
Allow one round of free-form corrections at this stage. Same LLM correction call as Stage 5. After corrections are applied, the commit screen is shown again. Do not loop back to earlier stages — the audit stage is the final correction opportunity.

**User clicks "Finish later" at the audit stage**
Profile is saved in draft state. `onboarding_completed: false`. `onboarding_draft_saved_at` timestamp set. On next login, user is routed back to the audit stage with all prior data intact. They do not need to repeat any earlier stage.

**User clicks "Start over"**
Full session wipe. All extraction, inference, correction, question, and voice data cleared. User is returned to Stage 1. Account data (email, name) is preserved.

### LLM call specification — Confidence audit

```
System prompt:
  You are performing a final quality audit of a user's onboarding profile for 
  Retune, a resume generation platform. You have access to everything collected 
  across the entire onboarding session. Your job is to identify gaps, 
  low-confidence values, unresolved issues, and contradictions — and to produce 
  a structured gap report that determines what needs to be surfaced to the user 
  before their profile is committed.

Context:
  Complete session object: [full session data including all stages]

Goal:
  Produce a gap report covering critical gaps, important gaps, low-confidence 
  fields, contradictions, and a final profile quality score.

Output format:
  {
    critical_gaps: [
      { field: string, reason: string, simplified_question: string }
    ],
    important_gaps: [
      { field: string, current_value: string, confidence: string, 
        clarification_question: string }
    ],
    contradictions: [
      { field: string, extracted_value: string, user_stated_value: string, 
        resolution_question: string }
    ],
    user_supplied_overrides: string[],
    regenerate_inferred_summary: boolean,
    profile_quality_score: 0-100,
    profile_quality_note: string,
    ready_to_commit: boolean
  }
```

### Profile commit — what is written to the database

When `ready_to_commit: true` and the user confirms, the following is written:

```
users table:
  onboarding_completed: true
  onboarding_completed_at: timestamp

user_profiles table:
  identity fields (name, email, location, URLs)
  confirmed_role_family
  confirmed_seniority
  confirmed_industry
  target_role
  resume_frame
  completeness_path
  profile_quality_score

user_experience table:
  one row per experience entry
  source flagged as "extracted" or "user_supplied" per field

user_education table:
  one row per education entry

user_skills table:
  skills array with grouping

user_voice_profile table:
  full voice profile object
  tone_calibration_summary
  tone_preferences
  tone_aversions

user_resume_preferences table:
  underrepresented_skills
  deemphasis_preferences
  achievement_depth
  career_transition_framing (if applicable)
  gap_handling (if applicable)

user_onboarding_metadata table:
  session_id
  all confidence flags
  all source flags (extracted vs user_supplied)
  all low-confidence field flags
  correction_rounds count
  profile_quality_score
  voice_profile_confidence
```

### Background job — understanding generation

Fires immediately after profile commit. Does not block the redirect to `/dashboard`. Uses the full committed profile — extraction, inferred summary, voice profile, question map answers — to generate Retune's deep understanding of the user. This understanding is what powers the resume generator's ability to produce personalised, specific, on-voice output.

This job uses a long-context LLM call with the complete profile as input and produces a structured "understanding document" stored separately. This document is regenerated each time the user makes significant profile updates.

### Exit conditions

- All critical gaps resolved or explicitly deferred
- Profile committed to database
- `users.onboarding_completed: true`
- Background understanding generation job queued
- User redirected to `/dashboard`

### Failure states

**Database commit fails:**
Retry up to three times. If all retries fail, preserve the full session in a recovery queue. Show the user: "We hit a technical issue saving your profile — please try again in a moment." Do not wipe the session. Do not force the user to repeat onboarding.

**Understanding generation job fails:**
The profile is committed and the user is redirected regardless. The understanding generation job is retried asynchronously in the background. The resume generator falls back to using the raw profile data directly until the understanding document is available. The user sees no indication of this fallback.

**User is redirected but their session cookie has expired:**
Commit the profile using the user ID stored in the session before the session expired. Redirect to login. After login, redirect to `/dashboard`. The committed profile is available.

---

---

# APPENDIX

---

## Session state reference

The following is the complete session state object as it exists at the end of a successful onboarding:

```json
{
  "session_id": "string",
  "user_id": "string",
  "onboarding_started_at": "timestamp",
  "onboarding_completed_at": "timestamp",
  "onboarding_status": "committed",

  "upload": {
    "file_name": "string",
    "file_type": "string",
    "file_size_bytes": 0,
    "upload_timestamp": "timestamp",
    "upload_attempts": 0
  },

  "extraction": {
    "raw_text": "string",
    "raw_text_character_count": 0,
    "extraction_method": "file | paste",
    "schema_mapping_status": "success | failed",
    "schema_mapping_object": {},
    "extraction_quality": "high | medium | low"
  },

  "dual_extraction": {
    "pure_extraction": {},
    "pure_extraction_confidence": "high | medium | low",
    "inferred_summary": "string",
    "inferred_summary_status": "success | failed | low_quality",
    "summary_quality": "high | medium | low"
  },

  "inference": {
    "industry": "string",
    "industry_confidence": "string",
    "industry_ambiguous": false,
    "role_family": "string",
    "role_family_confidence": "string",
    "role_family_ambiguous": false,
    "seniority": "string",
    "seniority_confidence": "string",
    "seniority_ambiguous": false,
    "career_transition_detected": false,
    "transition_note": null,
    "new_grad": false,
    "work_pattern": "string"
  },

  "confirmation": {
    "summary_confirmed": true,
    "confirmed_role_family": "string",
    "confirmed_industry": "string",
    "confirmed_seniority": "string",
    "correction_rounds": 0,
    "correction_unresolved": false,
    "user_supplied_overrides": []
  },

  "completeness": {
    "completeness_score": 0,
    "completeness_path": "string",
    "missing_critical_fields": [],
    "has_quantified_achievements": false,
    "resume_stale": false,
    "employment_gaps_present": false
  },

  "question_map": {
    "target_role": { "value": null, "confidence": null, "source": null },
    "target_role_specificity": { "value": null, "confidence": null, "source": null },
    "underrepresented_skills": { "value": null, "confidence": null, "source": null },
    "deemphasis_preferences": { "value": null, "confidence": null, "source": null },
    "resume_frame": { "value": null, "confidence": null, "source": null },
    "career_transition_framing": { "value": null, "confidence": null, "source": null },
    "gap_handling": { "value": null, "confidence": null, "source": null },
    "achievement_depth": { "value": null, "confidence": null, "source": null }
  },

  "voice_profile": {
    "natural_voice_sample": "string",
    "tone_preferences": [],
    "tone_aversions": [],
    "self_description_style": "string",
    "sentence_structure": "string",
    "vocabulary_register": "string",
    "leading_pattern": "string",
    "phrases_to_use": [],
    "phrases_to_avoid": [],
    "tone_calibration_summary": "string",
    "voice_profile_confidence": "string",
    "voice_profile_source": "collected | default"
  },

  "audit": {
    "critical_gaps_resolved": true,
    "important_gaps_resolved": true,
    "contradictions_resolved": true,
    "profile_quality_score": 0,
    "ready_to_commit": true,
    "regenerated_inferred_summary": false
  }
}
```

---

## LLM call inventory

| Stage | Call | Purpose | Blocking |
|---|---|---|---|
| 1 | Schema mapping | Map extracted text to DB schema | No (parallel) |
| 2A | Pure extraction | Literal structured extraction from resume | Yes |
| 2B | Inferred summary | Narrative understanding of candidate | No (parallel) |
| 3 | Inference | Industry, role family, seniority inference | Yes |
| 4 | Summary generation | User-facing summary message | Yes |
| 5 | Correction interpretation | Parse and apply user corrections | Yes (per round) |
| 6 | Completeness assessment | Determine onboarding path | Yes |
| 7 (per question) | Answer evaluation | Validate and extract answer value | Yes (per answer) |
| 8 | Voice extraction | Build structured voice profile | Yes |
| 9 | Confidence audit | Final gap and quality check | Yes |
| 9 (conditional) | Summary regeneration | Rebuild inferred summary with full context | No (background) |
| Post-commit | Understanding generation | Build Retune's deep user understanding | No (background) |

---

## Confidence level definitions

| Level | Meaning | Action |
|---|---|---|
| High | Answer directly and clearly addressed the question. Value is unambiguous and actionable. | Store and move on. |
| Medium | Answer addressed the question but required interpretation. Value is usable but not perfectly precise. | Store with flag. Surface in audit if critical field. |
| Low | Answer was vague, off-topic, or could not be reliably interpreted. Value would be a guess. | Do not store. Follow up once. If still low after follow-up, skip and flag. |

---

## Field source definitions

| Source | Meaning |
|---|---|
| `extracted` | Value came directly from the resume text via LLM extraction |
| `inferred` | Value was inferred by the LLM from context (not literally stated in resume) |
| `user_supplied` | User stated this value directly, overriding or supplementing what was extracted |
| `user_confirmed` | Extracted or inferred value was explicitly confirmed by the user |
| `default` | No value was collected — system default applied |
| `deferred` | User chose to skip — field to be completed from dashboard |

---

*End of document.*