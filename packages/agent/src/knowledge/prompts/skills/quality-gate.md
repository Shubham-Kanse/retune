---
name: quality-gate
description: Final validation checklist before delivering any resume, cover letter, or application package. Run on every output before generating the DOCX or presenting to the candidate. Works for any candidate, role, or industry.
compatibility: Anthropic Console agents, claude.ai, API tool use, website resume generators
---

# Quality Gate — Final Validation

## Critical Context
This gate ensures the final output honours the candidate's real experience, passes ATS, survives human recruiter scrutiny, and delivers a complete, coherent application package. Run it on every output — not just when something feels off.

---

## Pre-Flight: Pipeline Completeness

- [ ] Company research was performed (at minimum: about page, careers page, JD, news search)
- [ ] Company intel brief exists at `resumes/{CandidateName}/{Company}/company_intel.md`
- [ ] JD saved at `resumes/{CandidateName}/{Company}/job_description.txt`
- [ ] Resume content exists at `resumes/{CandidateName}/{Company}/resume_content.md`
- [ ] Cover letter content exists (if requested)
- [ ] Application strategy exists (if requested)

## Pre-Flight: Edge Case Checks

- [ ] JD experience requirement checked — if the candidate is significantly under-experienced, flagged before proceeding (not silently omitted)
- [ ] Visa / work authorisation status: if the role requires right to work and the candidate is on a permit, the appropriate line is included
- [ ] Location on resume matches the company's city (not the candidate's home city, if different)
- [ ] Salary expectations: never on resume; if JD asks, noted in application strategy only
- [ ] Repeat application to the same company: if so, previous submission reviewed and new one differentiated

---

## Resume Quality Gate

### Content (fix priority: HIGH — these cause rejections)

- [ ] Every bullet has a quantified result or measurable scope
- [ ] No bullet starts with: "Responsible for," "Helped," "Assisted," "Worked on"
- [ ] No two consecutive bullets start with the same verb
- [ ] No verb repeated twice within the same role
- [ ] Bullet grammatical structures vary — not all follow the same pattern (see `bullet-writing` for 5 structures)
- [ ] Summary contains zero banned phrases ("passionate," "proven track record," "results-driven," "dynamic," "exceptional")
- [ ] Summary is 80–120 words (count them — verify before finalising)
- [ ] Skills section uses exact JD terminology (not synonyms or paraphrases)
- [ ] Skills ordered by JD relevance within each category
- [ ] Header role title mirrors the exact job title from the JD
- [ ] Nothing in this resume could apply unchanged to a different candidate
- [ ] All claims are grounded in the candidate's real experience
- [ ] Profile Alignment Check: Each experience bullet references an actual entry from the candidate's profile. No fabricated projects or companies.
- [ ] Language matches the candidate's experience level (mid-level ≠ executive phrasing)
- [ ] "Supported" only used with immediate ownership context
- [ ] All JD T1 (required) skills are represented — none silently omitted
- [ ] Quantification Check: At least 70% of bullets include a number, percentage, or measurable outcome (not just descriptions)

### ATS Formatting (fix priority: CRITICAL — these cause parse failures)

- [ ] A4 page size (or US Letter for North American roles) — handled by generate-docx script
- [ ] 12.7mm margins ("Narrow" preset) — handled by script
- [ ] Single-column layout
- [ ] Font: Calibri (primary), or Arial, Times New Roman, Georgia, Verdana — no decorative fonts
- [ ] Body 10pt | Name 16pt | Designation 11pt | Contact 9.5pt | Section headers 10.5pt
- [ ] Justified text (body, bullets, skills). Centred for name, designation, contact.
- [ ] Bullets: `•` or `-` only — no ★, ♦, ►, or emoji
- [ ] No tables, columns, text boxes, images, or graphics
- [ ] Contact info in main body (not in Word header/footer)
- [ ] Dates: Month YYYY format consistently throughout
- [ ] Section headers use standard ATS-recognisable terms (see ats-optimization skill)
- [ ] No "References available upon request" — assumed and wastes space
- [ ] No empty/blank paragraphs — all spacing via before/after XML only
- [ ] Phone number formatted with country code for international roles

### Length & Structure

- [ ] Page count appropriate to experience level (see resume-architecture skill)
- [ ] First work experience bullet visible on page 1 (above the fold)
- [ ] Section order: Header → Summary → Skills → Work Experience → Education → Certs
- [ ] No section is empty or placeholder
- [ ] Most recent role has the most bullets (5–6); earlier roles progressively fewer

### ATS Score (automated — fix priority: HIGH)

- [ ] Run `ats_score.py` against the JD
- [ ] 85%+ coverage of required (T1) JD keywords
- [ ] 70%+ coverage of preferred (T2) JD keywords
- [ ] Every T1 keyword backed by at least one supporting bullet (not orphaned in Skills only)
- [ ] No keyword appears more than 5× (spam detection threshold)
- [ ] If below threshold: follow Revision Protocol in `ats-optimization` skill

### DOCX Integrity (fix priority: CRITICAL — invisible issues that silently kill ATS parsing)

- [ ] Run `validate_docx.py` on the generated DOCX — must show "PERFECT"
- [ ] Zero ghost characters in output (no U+200B, U+200C, U+200D, U+2060, U+FEFF, U+00AD, U+2013, U+2014)
- [ ] Zero empty/ghost runs
- [ ] All spacing explicit in XML (no inherited values)
- [ ] Bullet paragraphs have proper `w:numPr` numbering
- [ ] Metadata author = candidate name (not "python-docx" or blank)
- [ ] Metadata comments field is empty
- [ ] All font runs have all four rFonts slots set
- [ ] No smart quotes; no en-dash or em-dash; no non-breaking spaces
- [ ] Date ranges use ASCII hyphen, not en-dash

### AI Detection Counter-Check (fix priority: HIGH — 62% of recruiters flag AI-sounding resumes)

- [ ] No generic superlatives without evidence ("exceptional," "outstanding," "unparalleled")
- [ ] Bullet structures vary across at least 3 of the 5 patterns from `bullet-writing` skill
- [ ] Sentence lengths vary — mix of 1-line and 2-line bullets
- [ ] Tone matches the target company's culture (from company intel)
- [ ] Specificity is high — names, numbers, timeframes, team sizes throughout
- [ ] Bullets mirror JD's exact responsibility language (not generic rewrites)
- [ ] Bullet ordering matches JD priority (most relevant requirement → first bullet)
- [ ] No bullet is recycled verbatim from another company's tailored resume

---

## Cover Letter Quality Gate

- [ ] Hook is company-specific — references a real product, initiative, or recent event from intel brief
- [ ] Hook cannot be reused for another company without changes
- [ ] 2–3 quantified achievements included
- [ ] Achievements map directly to JD requirements
- [ ] 250–400 words (count them — verify)
- [ ] Tone matches company culture (from intel brief)
- [ ] No banned openers (see `cover-letter` skill for list)
- [ ] Close is confident and specific — not a generic sign-off

---

## Application Strategy Quality Gate

- [ ] LinkedIn search queries provided for the candidate to find referral targets
- [ ] Hiring manager search query provided
- [ ] Outreach message drafts are under 100 words each
- [ ] Follow-up timeline uses actual calendar dates (not relative "Day 7")
- [ ] 3+ interview prep questions generated from JD
- [ ] 3+ STAR stories mapped to JD requirements with full S/T/A/R structure
- [ ] 3 questions for the candidate to ask that reference company intel
- [ ] Unverified intel marked with `[VERIFY]` or `[ASK CANDIDATE]`

---

## When a Check Fails — Fix Priority Order

1. **CRITICAL** (ATS formatting, DOCX integrity) — Fix immediately. These cause silent rejections.
2. **HIGH** (content quality, ATS score, AI detection) — Fix before generating DOCX.
3. **MEDIUM** (strategy completeness, cover letter polish) — Fix before delivering package.

---

## Final Delivery Checklist

- [ ] All files saved under `resumes/{CandidateName}/{CompanyName}/`
- [ ] Resume DOCX generated and validated
- [ ] Resume PDF generated (for email / LinkedIn)
- [ ] Cover letter DOCX generated and validated (if requested)
- [ ] Cover letter PDF generated (if requested)
- [ ] ATS score report generated and noted
- [ ] Complete package presented: intel summary + resume + cover letter + strategy + interview prep
- [ ] Action items for candidate clearly listed (LinkedIn searches, verifications, follow-up dates)
- [ ] Application strategy notes which file format to use where (DOCX for portals, PDF for email)
