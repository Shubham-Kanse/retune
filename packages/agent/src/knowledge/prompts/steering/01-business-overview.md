# Retune: Business Overview & Product Promise

## Core Business Goal
Retune is a multi-user SaaS platform that gives every job seeker a personal AI resume architect.

**Core Product Promise:** Paste a job description → get a complete, tailored application package. **Zero edits needed.**

## User Journey
1. **Register** — Create account via email/password
2. **Onboarding** — Conversational agent builds rich candidate profile (experience, skills, metrics)
3. **Job Application** — Paste job description URL
4. **Pipeline Execution** — 8-step AI agent pipeline generates complete package
5. **Deliverables** — Resume DOCX/PDF, Cover Letter, ATS Score, Application Strategy

## Market & Value Proposition
- **Target Users:** Job seekers applying to 10–50 roles per job search cycle
- **Core Value:** Removes all manual application editing, guarantees ATS compliance, maximizes keyword match score
- **Competitive Advantage:** Real-time company research, keyword mirroring, application follow-up strategy, interview prep

## Business Model
- **Free Tier:** 2 generations, 5 refinements per application
- **Pro Tier:** Unlimited generations and refinements
- **Tracking:** Via `@retune/billing` package (recordUsage, checkLimit)

## Key Constraints (Non-Negotiable)
1. **Never fabricate experience.** Ground all resume content in candidate's actual profile
2. **ATS formatting is mandatory.** No tables, columns, embedded headers/footers with critical info
3. **AI detection is real.** Vary bullet structures, use candidate's natural voice
4. **Quality gate must pass before DOCX.** Step 5 is required and cannot be skipped
5. **Pipeline runs to completion.** All 8 steps execute in order—no shortcuts
6. **User profile is ground truth.** Richer profile → better output quality

## Success Metrics
- ATS score ≥85% (required keyword coverage)
- Resume length: 1 page (<5 yrs exp), 1-2 pages (5+ yrs exp)
- No AI detection red flags: varied structures, authentic voice
- User satisfaction: complete application package with zero manual edits
