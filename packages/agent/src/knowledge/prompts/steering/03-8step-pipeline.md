# The 8-Step Resume Generation Pipeline

The agent executes **ALL 8 steps in order**. Skipping steps is not allowed.

## Pipeline Overview

```
Step 1: Company Intelligence (research agent)
  ↓
Step 2: JD Analysis (jd-analyzer agent)
  ↓
Step 3: Resume Writing (resume-writer agent)
  ↓
Step 4: ATS Score Check (within resume-writer)
  ↓
Step 5: Quality Gate (within resume-writer)
  ↓
Step 6: Document Generation (via generate_resume.py)
  ↓
Step 7: Cover Letter (cover-letter-writer agent)
  ↓
Step 8: Application Strategy (strategy-planner agent)
```

## Step 1: Company Intelligence (20–30 min)

**Purpose:** Deep research on target company to inform resume tone and strategy.

**Agent:** company-researcher
**Tools Used:** web_search, web_fetch
**Input:** job_description.txt

**Data Collected:**
- Company about/careers page → mission, culture, values, language tone
- Job description analysis → role context
- Recent news → funding, launches, partnerships, growth
- Glassdoor → rating, interview signals, compensation
- Tech stack → engineering blog, StackShare, tech requirements
- LinkedIn company → size, industry, recent activity

**Output:** `company_intel.md` (workspace file)

**Workspace Files After:** company_intel.md

---

## Step 2: JD Analysis

**Purpose:** Structure the job description into actionable intelligence for resume writing.

**Agent:** jd-analyzer
**Input:** job_description.txt
**Output:** jd_analysis.md

**Analysis Points:**
- Must-have vs nice-to-have requirements
- Exact keywords (preserve multi-word phrases: "cross-functional stakeholder management")
- Technical skills with specificity ("SQL" vs "T-SQL stored procedures")
- Soft skill signals
- Seniority level, team structure, reporting line
- Red flags / green flags
- Tone of JD (formal, startup, mission-driven, etc.)

**Workspace Files After:** jd_analysis.md, job_description.txt

---

## Step 3: Resume Writing

**Purpose:** Craft ATS-optimized resume matching candidate experience + JD keywords.

**Agent:** resume-writer
**Requirements:**
- Use candidate's REAL experience only (no fabrication)
- Mirror exact JD terminology
- Use ≥3 of 5 bullet structures: CAR, PAR, XYZ, STAR, hybrid
- Front-load with most impressive element
- Quantify: numbers, %, team sizes, time saved, revenue
- Skills-First format (skills section after summary)
- Adhere to market rules (US vs UK/Ireland)

**Resume Structure:**
```
# Name
Title | Location
Email · Phone · LinkedIn

## PROFESSIONAL SUMMARY (or PERSONAL PROFILE for UK)
[40–80 words US / 100–150 words UK]

## SKILLS
[Most JD-relevant category]: [ordered by relevance]
[Category 2]: ...

## EXPERIENCE (or WORK EXPERIENCE)
### Job Title — Company
#### Location | Start – End
- Bullet 1 (CAR/STAR with metric)
- Bullet 2 (PAR/XYZ with metric)
- Bullet 3+ (varied structure with metric)

### Previous Role — Company
#### Location | Start – End
- [3–5 bullets, tapered for older roles]

## EDUCATION
### Degree — Institution
#### Location | YYYY – YYYY

## CERTIFICATIONS
- [if any]

[UK ONLY: References available on request]
```

**Output:** `resume_content.md` (fully written, ready for scoring)

---

## Step 4: ATS Score Check

**Purpose:** Validate keyword coverage against original JD. Target ≥85%.

**Tool:** run_script("ats_score", ["--jd", "job_description.txt", "--resume", "resume_content.md"])

**Response:** `{ score: 87, matched: [...], missing: [...] }`

**If Score < 85%:**
- Map missing JD keywords
- Insert naturally into existing bullets OR add new context
- Re-run until ≥85% OR all reasonable keywords incorporated
- Anti-stuffing: every keyword must have supporting context

**If Score ≥ 85%:** Proceed to Step 5

**Workspace Files After:** ats_report.json (from ats_score.py)

---

## Step 5: Quality Gate (MANDATORY)

**Purpose:** Comprehensive pre-DOCX validation. This step is **required and cannot be skipped.**

**Checklist — Content Quality:**
- ✓ Every bullet contains: specific number, %, scale, or timeframe
- ✓ ≥3 of every 5 bullets have a metric
- ✓ Summary word count: 40–80 words (US) or 100–150 (UK)
- ✓ No banned phrases: "passionate", "proven track record", "results-driven", "leverage", "synergy"
- ✓ ≥3 different bullet structures used across document
- ✓ Bullet #1 in each role addresses #1 JD requirement

**Checklist — ATS Formatting:**
- ✓ Single-column layout only
- ✓ Contact info in body (not header/footer)
- ✓ Skills section uses exact JD terminology
- ✓ No tables, text boxes, multi-column sections

**Checklist — Market Compliance:**
- ✓ Correct English variant: American (US) or British (UK/Ireland)
- ✓ Date format: Month YYYY
- ✓ UK: "References available on request" as last line
- ✓ UK: No photo, no date of birth
- ✓ Page length: 1 page (<5 yrs) or 1–2 pages (5+ yrs)

**If Any Check Fails:** Return to appropriate step for revision.

**If All Pass:** Proceed to Step 6.

---

## Step 6: Document Generation

**Purpose:** Convert markdown resume into ATS-safe DOCX and PDF.

**Tool:** run_script("generate_resume.py", ["--content", "resume_content.md", "--filename", "Company_Role_Resume.docx"])

**DOCX Constraints:**
- No tables, columns, text boxes
- Consistent fonts: Calibri 11pt body, 14pt name header
- Proper heading styles (h1, h2) for ATS parsing
- Standard section order
- Outputs: .docx + .pdf

**Optional Validation:** run_script("validate_docx.py", ["--path", "<docx_path>"])

**Workspace Files After:** Company_Role_Resume.docx, Company_Role_Resume.pdf

---

## Step 7: Cover Letter

**Purpose:** Generate company-specific, role-tailored cover letter.

**Agent:** cover-letter-writer
**Inputs:** company_intel.md, jd_analysis.md, resume_content.md

**Structure:**
1. **Hook (Paragraph 1):** Reference ONE specific verifiable fact from company research (not generic)
2. **Value Bridge (Paragraphs 2–3):** 2–3 quantified achievements from resume, mapped to top JD requirements, using company's exact terminology
3. **Call to Action (Paragraph 4):** Confident, specific close

**Constraints:**
- 62% of recruiters reject AI-sounding cover letters → use candidate's natural voice
- Use company culture language from Step 1
- Reference specific company initiatives or values
- Target length: 250–400 words (US) or 200–350 (UK)

**Output:** cover_letter_content.md (text) → appended to results or separate file

---

## Step 8: Application Strategy

**Purpose:** Equip candidate with actionable application tactics.

**Agent:** strategy-planner
**Inputs:** job_description.txt, company_intel.md, jd_analysis.md, resume_content.md

**Components:**
1. **Company & Role Intelligence:** Key facts, 90-day success definition
2. **Referral Mining:** 3 specific LinkedIn search queries (ready to paste)
3. **Outreach Templates:** LinkedIn connection request + follow-up message
4. **Hiring Manager Research:** Email subject + body (<150 words)
5. **Application Timeline:** Day 0, 2, 7, 14 with specific actions
6. **Interview Preparation:**
   - 3 behavioral questions (from JD) → STAR outline using candidate's real metrics
   - 2 technical/domain questions
   - 3 sharp questions for candidate to ask (referencing company facts)

**Output:** application_strategy.md

---

## SSE Event Mapping (Frontend Progress)

| Event | Trigger | Frontend Action |
|-------|---------|-----------------|
| `step_start: company_research` | Agent begins Step 1 | Show spinner |
| `step_complete: company_research` | write_file company_intel | Mark complete |
| `step_complete: jd_analysis` | write_file jd_analysis | Mark complete |
| `step_complete: resume_writing` | run_script ats_score | Mark complete |
| `ats_score: { score, matched, missing }` | ats_score output | Display ATS % |
| `step_complete: quality_gate` | Manual agent transition | Mark complete |
| `step_complete: document_generation` | run_script generate_resume | Mark complete |
| `step_complete: cover_letter` | cover-letter-writer done | Mark complete |
| `step_complete: application_strategy` | strategy-planner done | Mark complete |
| `complete: { docx_url, cover_url, ats_score, strategy_url }` | Agent loop exits | Show results tab |
| `error: { message, step }` | Any exception | Show error modal |

---

## Workspace File Evolution

```
Initial:
  job_description.txt (user input)

After Step 1:
  company_intel.md

After Step 2:
  jd_analysis.md

After Step 3–5:
  resume_content.md (fully written, quality-gated)
  ats_report.json

After Step 6:
  Company_Role_Resume.docx
  Company_Role_Resume.pdf

After Step 7:
  cover_letter_content.md

After Step 8:
  application_strategy.md
```

---

## Agent Loop Configuration

**Model:** Claude Sonnet 4.6
**Max Iterations:** Varies per subagent (research: 15, resume: 35, strategy: 15, etc.)
**Stop Condition:** Agent emits completion signal OR max iterations reached
**Tool Calls:** All executed server-side (web_search, web_fetch, file_ops, run_script)
