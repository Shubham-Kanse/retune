---
name: ats-optimization
description: ATS keyword extraction, scoring, and optimization protocol for 2026. Use when analyzing a job description, scoring keyword coverage, or validating a resume against ATS requirements for any candidate or role.
compatibility: Anthropic Console agents, claude.ai, API tool use, website resume generators
---

# ATS Optimization Protocol

## Critical Context
The candidate's resume is grounded in **their real experience**. This skill extracts and matches keywords from a job description against that real experience — it never introduces fabricated skills or inflated claims. Keyword stuffing without evidence is worse than no keywords: it causes ATS false-positives that lead to interview failures.

---

## Job Description Mining

Extract in this order:

1. **Job title** — use exact phrasing in resume header and summary
2. **Required skills** (hard requirements) — must appear in Skills section + at least one bullet
3. **Preferred skills** (nice-to-have) — include if the candidate has them
4. **Tools and technologies** — exact names, exact capitalisation ("Power BI" not "PowerBI"; "Node.js" not "NodeJS")
5. **Methodologies** — Agile, Scrum, Waterfall, SDLC, etc.
6. **Compliance / regulatory terms** — GDPR, SOX, PCI-DSS, GRC, HIPAA, FCA, etc.
7. **Culture keywords** — values language from the JD or careers page
8. **Seniority signals** — "leads," "owns," "drives," "manages" indicate expected autonomy level

---

## Keyword Tier Classification

| Tier | Source | Treatment |
|---|---|---|
| T1 — Required | "Must have," "Required," "Essential," listed in requirements section | Must appear in Skills + at least one bullet with evidence |
| T2 — Preferred | "Nice to have," "Preferred," "Advantageous" | Include in Skills; add bullet if strong evidence exists |
| T3 — Implied | Company's domain, industry standard tools, culture keywords | Skills section + natural bullet integration |

---

## Keyword Placement Priority

| Location | ATS Weight | What to place |
|---|---|---|
| Header role title | 5× | Exact job title |
| Professional summary (first 50 words) | 4× | Top 3–4 primary keywords |
| Skills section | 4× | All T1 + T2 + relevant T3 keywords |
| First bullet of most recent role | 3× | Primary keyword in context |
| Throughout experience bullets | 2× | Natural integration |

---

## Keyword Density Rules

- Primary keywords: 3–4 occurrences across the document
- Secondary keywords: 2–3 occurrences
- **Never exceed 5 occurrences of any single keyword** — triggers spam detection in many ATS
- Every keyword must be backed by at least one bullet that provides evidence
- "Orphan keywords" (in Skills only, nowhere in bullets) score lower in modern ATS

---

## Multi-Word Keywords

Many keywords are phrases, not single words. These must appear as **exact phrases** — not just the individual words scattered across sentences.

- **Bigrams:** "stakeholder management," "requirements gathering," "process mapping," "data analysis," "risk management"
- **Trigrams:** "cross-functional collaboration," "user acceptance testing," "business process mapping," "continuous process improvement"

When counting keyword coverage, count the full phrase — not individual constituent words.

---

## Acronym Protocol

First mention: spell out + acronym → "Business Requirements Document (BRD)"
Subsequent mentions: acronym only → "BRD"

**Common pairs by domain:**

Business Analysis / PM:
- Business Requirements Document (BRD)
- Functional Requirements Specification (FRS / FRD)
- User Acceptance Testing (UAT)
- Key Performance Indicator (KPI)
- Service Level Agreement (SLA)
- Business Process Model and Notation (BPMN)

Data / Analytics:
- Extract, Transform, Load (ETL)
- Business Intelligence (BI)
- Key Performance Indicator (KPI)
- Return on Investment (ROI)

Tech / Engineering:
- Application Programming Interface (API)
- Software Development Life Cycle (SDLC)
- Continuous Integration / Continuous Deployment (CI/CD)
- Infrastructure as Code (IaC)

Compliance / Governance:
- Customer Relationship Management (CRM)
- Enterprise Resource Planning (ERP)
- Governance, Risk and Compliance (GRC)
- General Data Protection Regulation (GDPR)

---

## ATS Formatting Validation Checklist

Run before every output:

**Document structure:**
- [ ] `.docx` format for ATS portal submissions (97% parsing accuracy)
- [ ] `.pdf` also generated for email/LinkedIn submissions (preserves layout)
- [ ] Single-column layout (multi-column layouts break most ATS parsers)
- [ ] No tables, columns, text boxes — these are parsed unreliably or skipped entirely
- [ ] No images, logos, or graphics
- [ ] Contact info in main body (not in Word header/footer — invisible to ~40% of ATS)

**Typography (ATS-safe only):**
- [ ] Font: Calibri (primary), Arial, Times New Roman, Georgia, or Verdana
- [ ] Body: 10pt | Name: 16pt | Designation: 11pt | Contact: 9.5pt | Section headers: 10.5pt
- [ ] No special characters (★, ♦, ►, etc.) — use `•` or `-` only for bullets
- [ ] No ghost characters (zero-width spaces, BOM, soft hyphens, smart quotes, en/em dashes)

**Text:**
- [ ] Bullets: `•` or `-` only
- [ ] No smart quotes (curly `"`) — ATS parsers may misread them as garbled characters
- [ ] No en-dashes (–) or em-dashes (—) in date ranges — use ASCII hyphen (-)
- [ ] Dates: Month YYYY format consistently (e.g., "December 2021")

**Section headers (ATS-recognisable terms only):**
- [ ] PROFESSIONAL SUMMARY (not "About Me" or "Profile")
- [ ] SKILLS (not "Core Competencies" — unless the JD uses that term)
- [ ] WORK EXPERIENCE (not "Career History")
- [ ] EDUCATION (not "Academic Background")
- [ ] CERTIFICATIONS (not "Accreditations")

---

## ATS Scoring (Automated)

After building the resume, run the scoring script if available:

```bash
python3 ats_score.py \
  --jd job_description.txt \
  --resume resume_content.md
```

**Targets:**
- 85%+ coverage of required (T1) skills
- 70%+ coverage of preferred (T2) skills
- Every T1 keyword backed by at least one supporting bullet

---

## Revision Protocol (When ATS Score Is Below Threshold)

1. **Missing T1 keywords** — Add to Skills section and write/rewrite a bullet to evidence it
2. **Missing T2 keywords** — Add to Skills section; add a supporting bullet if strong evidence exists
3. **Over-stuffed keywords (>5×)** — Remove redundant mentions; keep highest-weight placements (header, summary, skills, first bullet)
4. **If uncertain how to frame a skill** — Ask the candidate one specific question, then proceed
5. **Re-run the scorer** after revisions to confirm fix

---

## Common ATS Failure Modes

| Problem | Cause | Fix |
|---|---|---|
| Contact info not extracted | Placed in Word header/footer | Move to document body |
| Dates showing as text or null | Inconsistent format | Use "Month YYYY" everywhere |
| Skills not parsed | Non-standard section header | Use "SKILLS" or "TECHNICAL SKILLS" |
| Job titles not recognised | Unusual formatting or symbols | Bold, standard capitalisation, no symbols |
| Experience not chronological | Date format inconsistency | Standardise all dates |
| Resume parsed as blank | Multi-column layout or text box | Single-column, body text only |
| Score drops mid-process | Smart quotes / invisible chars corrupting text | Sanitise with `generate-docx` script |
