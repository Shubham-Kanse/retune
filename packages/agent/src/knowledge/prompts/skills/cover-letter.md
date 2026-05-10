---
name: cover-letter
description: Write a tailored, human-sounding cover letter for any candidate and role. Use when drafting a cover letter. Requires company intel brief and resume content. Never write a generic cover letter — a generic one produces worse outcomes than no cover letter.
compatibility: Anthropic Console agents, claude.ai, API tool use, website resume generators
---

# Cover Letter Writing

## Critical Context
The cover letter must reflect the candidate's real achievements and genuine voice. Read the candidate's resume, the target JD, **and** the `company_intel.md` brief before writing a single word. The hook material always comes from company research — never from generic opening lines.

---

## 2026 Reality Check

- ~60% of HR professionals read cover letters
- 21% read the cover letter **before** the resume; 40% read it **after**
- 81% of hiring managers rate tailored applications "important" or "very important"
- Tailored cover letters produce 53% higher callback rates than no cover letter; 31% higher than generic ones
- 88% of hiring managers say they can immediately identify AI-written cover letters — **authenticity is the differentiator**
- Length: **250–400 words maximum**. Anything longer is not read in full.

---

## Structure

### Paragraph 1 — Hook (2–3 sentences)
Reference something **specific and verifiable** about the company — a product, an initiative, a stated value, a recent development from the intel brief. This paragraph must be impossible to copy-paste to another company. It signals that the candidate actually knows who they're writing to.

**Not this:** "I am excited to apply for the Business Analyst role at Acme Corp."
**This:** "Acme's recent move to consolidate three legacy billing platforms into a single API layer caught my attention — not because of the scale, but because of the requirements complexity it implies across regulatory jurisdictions."

### Paragraphs 2–3 — Value Bridge (2 paragraphs)
2–3 of the candidate's real achievements mapped directly to what this company's role requires. Use specific numbers. Connect their experience to the company's specific challenges or goals from the intel brief.

Each paragraph makes one strong argument, not a list. Think: "Here is the specific evidence that I can do the thing you most need someone to do."

### Paragraph 4 — Close (2 sentences)
Confident, specific. Reference a particular aspect of the role — team, product, or challenge. Not "I hope to hear from you." The close should feel like a natural extension of a real conversation, not a template sign-off.

---

## Example Cover Letter (Business Analyst, Fintech)

> Stripe's recent expansion of its financial infrastructure APIs to support embedded finance caught my attention — not because of the scale, but because of the requirements complexity behind it. Mapping payment flows across regulatory jurisdictions while maintaining a seamless developer experience is exactly the kind of problem I've spent three years solving.
>
> In my most recent role, I delivered requirements for a transaction processing system handling 50K+ monthly payments, coordinating across 6 business units and reducing development rework by 35%. When our team faced a 3-week sign-off bottleneck, I redesigned the approval workflow using BPMN, cutting it to 5 days. These weren't theoretical improvements — they shipped, and they stuck.
>
> I also coordinated UAT across 4 teams for a billing system migration affecting 2M+ customer records, achieving zero post-launch P1 incidents. That experience taught me that the gap between "requirements documented" and "requirements that actually work in production" is where most projects fail — and where I add the most value.
>
> I'd welcome the chance to discuss how my background translating complex billing and payment logic into buildable specifications maps to what your Dublin team is working on.

---

## Tone Calibration by Industry

Use the `company_intel.md` brief's "Resume Calibration Notes" as primary source. General guidelines:

| Industry | Tone | Hook source |
|---|---|---|
| Fintech / Payments | Direct, data-driven, developer-aware | Product launches, API expansions, scale metrics |
| Legal / Compliance | Formal, governance-aware, precise | Regulatory changes, governance initiatives, member services |
| Institutional Finance | Institutional, risk-aware, professional | Market moves, regulatory compliance, operational scale |
| Energy / Sustainability | Operational, mission-aware, outcome-focused | Sustainability targets, operational milestones, net-zero transition |
| Consulting | Versatile, client-delivery focused, confident | Client wins, sector expansion, methodology adoption |
| Manufacturing / Ops | Practical, efficiency-driven, no-fluff | Operational improvements, supply chain, process gains |
| SaaS / Product | Curious, user-focused, iterative | Product launches, user growth, platform expansions |
| Healthcare / MedTech | Careful, compliance-aware, patient-outcome focused | Clinical outcomes, regulatory approvals, system expansions |
| Non-profit / Public Sector | Mission-aligned, stakeholder-aware, value-focused | Mission impact, community reach, policy initiatives |

---

## File Output Convention

`resumes/{CandidateName}/{CompanyName}/{CandidateName}_CoverLetter_{CompanyName}.docx`

---

## Banned Openers

Any opener that:
- Starts with "I am writing to express my interest in..."
- Starts with "I am excited to apply for the role of..."
- Starts with "As a passionate professional..."
- Starts with "Dear Hiring Manager, I am thrilled..."
- Could be copy-pasted unchanged to a different company

---

## Quality Checklist

- [ ] Hook references something specific and verifiable from company intel
- [ ] Hook cannot be reused for another company without changes
- [ ] 2–3 quantified achievements included
- [ ] Achievements map directly to the JD's stated requirements
- [ ] Word count: 250–400 (count them — verify)
- [ ] Tone matches company culture (from company-intel brief)
- [ ] No banned openers
- [ ] Close is confident and specific — not a generic sign-off
- [ ] Reads like a human wrote it, not a template filled in
- [ ] No AI tells: "I am deeply passionate," "I would be a great asset," "I am a highly motivated individual"
