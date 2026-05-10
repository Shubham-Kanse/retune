# Market Rules & Regional Variations

## US Market Rules

### Document Type & Language
- **Document:** Resume (never "CV")
- **Language:** American English
- **Examples:** organize, analyze, optimize, color, behavior, center, program (non-technical), license (noun)

### Page Target
- **<5 years experience:** 1 page (strict)
- **5+ years or Senior:** 1–2 pages (never pad to fill space)

### Formatting Rules
**Header Format:**
```
# [FULL NAME]
[Exact JD Job Title] | [City, State or Remote]
[Email] · [Phone (optional)] · LinkedIn (optional)
```

**Date Format:** Month YYYY (e.g., "January 2022" or "Jan 2022")

**Location Format:** City, State (e.g., "Austin, TX" or "Remote")

**Currency:** USD

### Professional Summary
- **Length:** 40–80 words (count mandatory—rewrite if outside range)
- **Formula:** [Seniority] [role type] with [X] years driving [domain outcomes]. [Top quantified achievement]. [2–3 primary JD keywords]. [Differentiator that sets you apart].
- **DO NOT** start with "I" or the candidate's name
- **DO NOT** use generic openers like "Highly motivated professional"

### Bullet Structure
**Bullets per role (taper by recency):**
- Most recent / current role: 5–7 bullets
- 1–2 roles back: 3–5 bullets
- Older roles (5+ years ago): 1–3 bullets, focus only on most impressive achievements
- Entry-level roles 5+ years old: consider consolidating or omitting

### ATS Strategy
- **Adoption:** 97.8% of Fortune 500 use ATS (Jobscan 2025)
- **Common systems:** Workday (39%+), Greenhouse, Lever, Taleo, iCIMS, SuccessFactors
- **Workday/Greenhouse/Lever:** Semantic NLP—include related terms naturally; exact match less critical
- **Taleo (Oracle) / iCIMS Classic:** Exact-match—include exact JD phrases verbatim in bullets AND skills section
- **Format strength:** DOCX achieves 97% parse success vs PDF's 83%
- **Layout:** Single-column only—multi-column merges text in Greenhouse, breaks Taleo parsing
- **Contact info:** MUST be in body, NOT in Word header/footer (ATS skips headers/footers)

---

## UK/Ireland Market Rules

### Document Type & Language
- **Document:** CV (never "Resume")
- **Language:** British English
- **Examples:** organise, analyse, optimise, colour, behaviour, centre, programme (non-technical), licence (noun)

### Page Target
- **Standard:** 2 pages (Reed.co.uk: 91% of UK recruiters cite 2 pages as ideal)
- **Word count:** 700–1,000 words total
- **Ideal length:** 1.5–2 pages with margins

### Formatting Rules
**Header Format:**
```
# [FULL NAME]
[Exact JD Job Title] | [City, Country]
[Email] · [Phone] · LinkedIn (optional) · [Visa Status (optional)]
```

**Date Format:** Month YYYY (e.g., "January 2022") — NO numerical formats (01/2022 not acceptable)

**Location Format:** City, Country (e.g., "Dublin, Ireland" or "London, UK")

**End of Document:** Add "References available on request" as the LAST line

### Legal Compliance
- **NO photo** (UK Equality Act, Irish Employment Equality Acts—never include)
- **NO date of birth** (illegal to require; omit entirely)
- **NO age** (cannot be inferred from dates if possible)

### Personal Profile (instead of "Professional Summary")
- **Length:** 100–150 words (count mandatory—rewrite if outside range)
- **Standard UK opening section** (expected by recruiters)
- **Structure:**
  1. Seniority + role type + years of experience
  2. 1–2 quantified career achievements
  3. 2–3 core competencies matching JD keywords
  4. Industry/sector focus and career goal aligned with this specific role
- **Voice:** Third person implied (no "I")—write "Experienced analyst..." not "I am an experienced analyst..."

### Bullet Structure
**Bullets per role (taper by recency):**
- Most recent / current role: 5–7 bullets
- 1–2 roles back: 3–5 bullets
- Older roles (5+ years ago): 1–3 bullets
- Only list **last 10 years** unless earlier experience is directly relevant

### Education Section
- **Include:** Degree, institution, dates, relevant coursework if applicable
- **Format:** [Degree] — [Institution], [City, UK]

### ATS Strategy
- **Adoption:** Similar to US (Workday, Greenhouse, SuccessFactors dominant)
- **Same principles:** Single-column, DOCX preferred, no tables/text boxes/graphics
- **Keyword strategy:** Exact JD phrases in bullets AND skills section
- **Format strength:** DOCX preferred over PDF

---

## Market-Specific Differences Summary

| Aspect | US | UK/Ireland |
|--------|----|---------   |
| Document name | Resume | CV |
| Language | American | British |
| Page target | 1 page (<5yr), 1–2 pages (5+yr) | 2 pages (700–1,000 words) |
| Summary section | Professional Summary (40–80 words) | Personal Profile (100–150 words) |
| Location format | City, State | City, Country |
| Date format | Month YYYY | Month YYYY |
| Header | Name, Title, Location, Contact | Name, Title, Location, Contact, Visa |
| End of document | Nothing special | "References available on request" |
| Photo | Never | Explicitly never (illegal) |
| DOB | Omit | Omit (illegal to require) |
| ATS strategy | DOCX 97%, handle Workday + Taleo | DOCX preferred, same ATS systems |

---

## Market Detection Logic

**In code:** Inferred from user profile location or explicitly set via market parameter.

```typescript
function inferMarket(location: string): Market {
  const uk_regions = [
    "london", "uk", "united kingdom", "england", "scotland", "wales",
    "dublin", "ireland", "cork", "belfast"
  ]
  return uk_regions.some(r => location.toLowerCase().includes(r)) ? "uk" : "us"
}
```

**If user selects "Remote":** Default to "us" unless they explicitly specify.

---

## Key Enforcement Points

### US Resume Must-Haves
- ✓ "Resume" (not "CV")
- ✓ 1 page for <5 years, 1–2 for 5+ years
- ✓ Professional Summary 40–80 words
- ✓ American English (organize, analyze, optimize, behavior, color, center)
- ✓ No "References available on request"
- ✓ Date format: "January 2022" or "Jan 2022"
- ✓ Single-column layout
- ✓ Contact info in body (not header/footer)

### UK/Ireland CV Must-Haves
- ✓ "CV" (not "Resume")
- ✓ 2 pages, 700–1,000 words
- ✓ Personal Profile 100–150 words (not "Professional Summary")
- ✓ British English (organise, analyse, optimise, behaviour, colour, centre)
- ✓ **MUST END WITH:** "References available on request"
- ✓ NO photo, NO date of birth
- ✓ Date format: "January 2022" (no 01/2022)
- ✓ A4 paper (vs US Letter)
- ✓ Single-column layout
- ✓ Contact info in body

---

## Language Variant Checker

**British English spellings to use:**
- organise (not organize)
- analyse (not analyze)
- optimise (not optimize)
- centre (not center)
- colour (not color)
- behaviour (not behavior)
- programme (non-technical; technical = program)
- licence (noun; verb = license)
- focused, focussed (both acceptable, prefer focused)
- judgement, judgment (both acceptable, prefer judgment)

**American English spellings:**
- organize
- analyze
- optimize
- center
- color
- behavior
- program (all contexts)
- license (all contexts)

**In prompts:** Always specify market (us | uk) and enforce variant in assembly.
