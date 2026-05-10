---
name: generate-docx
description: Generate professionally formatted .docx resume and cover letter files. Use after content is finalised and approved. Produces ATS-compliant, human-crafted-looking Word documents. Works for any candidate name and any role.
compatibility: Anthropic Console agents, claude.ai, API tool use, website resume generators
---

# Generate DOCX Documents

## When to Use
After the resume or cover letter content has been reviewed and approved. This skill produces the final `.docx` files that:
- Pass ATS parsing at 99%+ compatibility
- A4 page size with 12.7mm margins (Word "Narrow" preset)
- Auto-correct American English to British English (context-aware: "programme" for schemes, "program" preserved for software) — **disable this if generating for US roles**
- Auto-sanitise invisible characters (zero-width spaces, BOM, smart quotes, en/em dashes)
- Look like they were formatted by a professional human in Microsoft Word
- Use proper Word styles (not inline formatting) — so they're editable by the candidate
- Metadata shows the candidate's name as author (no python-docx fingerprints)
- Proper Word bullet numbering (numPr) — not manual bullet characters
- All spacing explicit in XML — zero inherited or ambiguous values
- Zero ghost empty runs in the document

---

## Markdown Format Specification

The agent MUST write `resume_content.md` in this exact format — the DOCX script parses these markers:

```markdown
# Candidate Full Name                       → Name (rendered UPPERCASE, 16pt bold, centred, navy blue #1F3A5F)

Target Role Title                           → Designation (11pt, centred)
City, Country | email | phone | LinkedIn    → Contact (9.5pt, centred, "LinkedIn" = clickable hyperlink)

## Professional Summary                     → Section header (10.5pt bold, navy blue, underlined)

Summary text here...                        → Body text (10pt, dark grey #333333, justified)

## Skills                                   → Section header

**Category Label:**    Skill A, Skill B     → Skills line (bold category + tab + values)

## Work Experience                          → Section header

### Job Title                               → Role title (10pt bold, near-black #2D2D2D)
#### Company Name | Month YYYY - Month YYYY → Company/institution line (10pt italic)

- Bullet point text here                    → Bullet (10pt, indented)

#### Key Project: Project Name              → Sub-heading (10pt bold italic) — optional

## Education                                → Section header

### Degree Title                            → Degree (10pt bold)
#### University Name | Start - End          → Institution (10pt italic)

## Certifications                           → Section header

### Certification Name — Issuing Body | Year
```

**Supported inline markdown:**
- `# ` → Name (h1)
- `## ` → Section header (h2)
- `### ` → Role / degree / cert title (h3)
- `#### ` → Company / institution line (h4, italic)
- `- ` or `• ` → Bullet point
- `**text**` → Bold inline
- `*text*` → Italic inline
- Plain text → Body paragraph
- Blank line → Paragraph break

**Important:** Use ASCII hyphens (-) for all date ranges. The script sanitises them anyway, but clean input avoids edge cases.

---

## Resume Generation

```bash
python3 generate_resume.py \
  --candidate "CandidateName" \
  --company "CompanyName" \
  --market us \
  --content-file resume_content.md
```

**Output:** `resume.docx` (in `$WORKSPACE` or `--output-dir`)

---

## Cover Letter Generation

```bash
python3 generate_resume.py \
  --candidate "CandidateName" \
  --company "CompanyName" \
  --market us \
  --type cover-letter \
  --content-file cover_letter_content.md
```

**Output:** `cover_letter.docx`

---

## PDF Generation (for email and LinkedIn submissions)

Add `--pdf` to generate a PDF alongside the DOCX:

```bash
python3 generate_resume.py \
  --candidate "CandidateName" \
  --company "CompanyName" \
  --market us \
  --content-file resume_content.md \
  --pdf
```

**When to use which format:**
- **DOCX** → ATS portal submissions (Workday, Greenhouse, Lever, iCIMS, Taleo). 97% parsing accuracy.
- **PDF** → Direct email to recruiters, LinkedIn profile attachment, networking handoffs. Preserves layout exactly.
- **Default:** Generate both. The application strategy notes which format to use where.

**PDF conversion requires one of:**
- LibreOffice (recommended, free, cross-platform): `brew install --cask libreoffice`
- docx2pdf: `pip install docx2pdf` (requires MS Word on macOS/Windows)

---

## Locale / Language Variant

By default, the script generates US Letter pages with American English. For UK/Ireland roles, pass `--market uk`:

```bash
python3 generate_resume.py \
  --candidate "CandidateName" \
  --company "CompanyName" \
  --market uk \
  --content-file resume_content.md
```

**British English auto-corrections (when `--market uk`):**
- "analyse" not "analyze"
- "optimise" not "optimize"
- "organised" not "organized"
- "programme" for learning schemes (not "program")
- "programme" preserved as "program" when followed by software context

---

## ATS-Critical Formatting Guarantees

The script enforces these automatically — no manual checks required:

| Issue | Script behaviour |
|---|---|
| Ghost characters (U+200B, U+FEFF, etc.) | Stripped before parsing |
| Smart quotes (curly `"`) | Replaced with straight `"` |
| En-dash / em-dash in text | Replaced with ASCII hyphen `-` |
| Non-breaking spaces | Replaced with regular spaces |
| Empty / ghost runs | Zero-length text runs not created |
| Spacing | Every paragraph has explicit `w:before` / `w:after` in XML |
| Bullet type | Word numPr definitions (not manual `•` characters) |
| Metadata | Author = candidate name; no tool fingerprints |
| Font coverage | All four rFonts slots set (ascii, hAnsi, eastAsia, cs) |

---

## ATS Scoring

After generating the resume, score it against the JD:

```bash
python3 ats_score.py \
  --jd job_description.txt \
  --resume resume_content.md
```

**Targets:** 85%+ T1 keyword coverage, 70%+ T2 keyword coverage

---

## What the Script Does (Execution Order)

1. Sanitises all text (invisible chars, normalises quotes / dashes / spaces)
2. Applies locale-aware language corrections
3. Parses the markdown content into structured blocks
4. Creates proper Word bullet numbering definitions
5. Applies ATS-safe formatting: Calibri 10pt, US Letter or A4 (per --market), 12.7mm margins, single column, justified
6. Sets explicit XML spacing on every paragraph (zero inheritance)
7. Formats bullets as proper Word list paragraphs with numPr
8. Applies bold / italic via inline formatting with zero ghost runs
9. Sets all four font slots on every run
10. Cleans metadata: author = candidate name, no tool fingerprints
11. Saves as `.docx` — no embedded objects, no headers/footers content, no graphics
12. Optionally converts to PDF

---

## Dependencies

```bash
# Core (required)
python3 -m venv .venv
.venv/bin/pip install python-docx

# PDF conversion (optional)
brew install --cask libreoffice
# OR
.venv/bin/pip install docx2pdf
```
