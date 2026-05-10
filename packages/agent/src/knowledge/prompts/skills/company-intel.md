---
name: company-intel
description: Deep company intelligence gathering before writing any resume or cover letter. Use as the FIRST step when a new job description is provided. Research the company via web tools, synthesise findings into a structured intel brief, and feed that brief into all downstream skills.
compatibility: Anthropic Console agents, claude.ai, API tool use, website resume generators
---

# Company Intelligence Protocol

## When to Use
**First** — before writing a single word of resume, cover letter, or application strategy. The quality of every downstream output depends directly on the quality of this research.

---

## How to Research

Use your available web tools (`web_search`, `web_fetch`, `curl`, or equivalent). Do not rely on training-data knowledge of the company — it may be stale. The research takes 5 minutes and dramatically improves every downstream output.

### Research Playbook

**1. Company website — About / Mission page:**
Look for: what they do, mission, size, founded, HQ, key products/services, recent pivots.

```bash
curl -sL "https://{company-domain}/about" | sed 's/<[^>]*>//g' | head -200
```

**2. Careers / Culture page:**
Look for: values, work style, benefits, team structure, culture language the cover letter should echo.

```bash
curl -sL "https://{company-domain}/careers" | sed 's/<[^>]*>//g' | head -200
```

**3. The JD URL itself (if provided):**
Sometimes the JD page contains team context, company description, or benefits not in the pasted text.

```bash
curl -sL "{jd-url}" | sed 's/<[^>]*>//g' | head -300
```

**4. Recent news (last 12 months):**
Look for: product launches, funding rounds, partnerships, acquisitions, leadership changes, layoffs.

```bash
# Replace {company} with the actual company name
web_search: "{company} news 2025 2026"
```

**5. Glassdoor / Blind:**
Look for: rating, recurring pros/cons, interview process hints, red flags.

```bash
web_search: "{company} glassdoor reviews {year}"
```

**6. Tech stack (for technical roles):**
Look for: languages, frameworks, databases, cloud providers, tooling philosophy.

```bash
web_search: "{company} tech stack engineering blog"
```

**7. LinkedIn company page:**
Look for: company size, industry classification, headcount trend, description.

```bash
web_search: "site:linkedin.com/company {company}"
```

**8. Team members / hiring manager:**
Look for: names, titles, LinkedIn URLs of people likely on the team or interviewing.

```bash
web_search: "site:linkedin.com/in {company} {role title} {city}"
```

**9. Recruiters:**
Look for: internal recruiters actively posting roles at this company.

```bash
web_search: "site:linkedin.com/in {company} recruiter {city}"
```

### Research Rules

- **Do all of these.** Don't skip steps because you "already know" the company. Training data may be 12+ months stale.
- **If a fetch fails** (timeout, 403, paywall), note it and move on — don't block the pipeline.
- **Small / unknown companies:** Note what you found and what you couldn't. Absence of info is still useful signal.
- **Source-tag every fact** so the candidate knows what to verify:
  - `[from website]` — scraped from company page
  - `[from JD]` — extracted from the job description text
  - `[from search]` — found via search results
  - `[from training data — VERIFY]` — from model knowledge, potentially stale

---

## Output Format

Save to `resumes/{CandidateName}/{CompanyName}/company_intel.md`:

```markdown
# Company Intelligence: {CompanyName}
## Generated: {date}
## Sources: web research + JD analysis

### Company Overview
{One paragraph — what they do, size, stage, HQ, notable facts — with source tags}

### Products & Tech Stack
{Bullet list with sources}

### Culture & Values
{Bullet list pulled from careers page, JD language, Glassdoor — with source tags}

### Recent Activity
{Bullet list from news search — product launches, funding, hires, acquisitions}

### Role Analysis
- **Title:** {exact title from JD}
- **Team / Department:** {from JD or search}
- **Reports to:** {if known}
- **Why this role exists:** {inferred from JD context — new team, backfill, growth?}
- **What success looks like:** {key deliverables from JD}
- **Seniority level:** {junior / mid / senior / lead}
- **Remote / hybrid / onsite:** {from JD}

### Hiring Team & Contacts
{Names, titles, LinkedIn URLs from search — mark as [VERIFY]}

### Resume Calibration Notes
- **Tone:** {formal / casual / technical — derived from culture research}
- **Lead with:** {what this company cares about most — cost reduction? compliance? scale? UX?}
- **Culture signals to embed:** {specific phrases from careers page / JD to echo in summary and cover letter}
- **Required keywords (T1):** {list — must appear in Skills + bullet}
- **Preferred keywords (T2):** {list — include if candidate has them}

### Action Items for Candidate
1. {Check LinkedIn for mutual connections at {CompanyName}}
2. {Verify: [anything flagged as training-data knowledge]}
3. {Visit: {specific URL worth reading}}
```

---

## How This Brief Feeds Downstream Skills

| Downstream skill | Uses from this brief |
|---|---|
| `summary-writing` | Culture signals, "Lead with," tone calibration |
| `skills-section` | Tech stack, exact JD keywords, domain language |
| `bullet-writing` | "What success looks like," JD responsibility language |
| `cover-letter` | Recent news for hook, culture signals, hiring team names |
| `application-strategy` | Hiring team names, referral targets, company context |
| `quality-gate` | Validates resume against intel brief — any drift is flagged |

---

## Quality Checks

- [ ] At least 5 of the 9 research steps attempted (all 9 ideal)
- [ ] Failed fetches noted (not silently skipped)
- [ ] Every fact source-tagged
- [ ] "Resume Calibration Notes" section completed
- [ ] T1 and T2 keyword lists extracted from JD
- [ ] At least one recent company development noted (for cover letter hook)
- [ ] Saved to correct path before downstream skills start
