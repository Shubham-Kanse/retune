# Critical File Mapping & Quick Reference

## File-by-Purpose Quick Lookup

### 🎯 Agent Orchestration
| File | Lines | Purpose |
|------|-------|---------|
| `packages/agent/src/engine.ts` | 1–300+ | Main agent orchestrator. Sets up workspace, defines subagent configs, tracks pipeline steps. Uses Claude Agent SDK. **EDIT WHEN:** Adding new subagent types, changing step tracking logic, modifying agent config (model, maxTurns) |
| `packages/agent/src/prompt-assembler.ts` | 1–685+ | Assembles system prompts for all agent types. Renders profile, applies market rules, builds bullet/skills guides. **EDIT WHEN:** Changing prompt instructions, market rules, bullet structures, summary formulas |
| `packages/agent/src/types.ts` | — | AgentParams, AgentResult, tool definitions. **EDIT WHEN:** Adding new tool types or agent parameters |

### 🗂️ Knowledge Base (13 Files)
| File | Purpose |
|------|---------|
| `steering/01-business-overview.md` | Business goal, product promise, key constraints, billing model |
| `steering/02-architecture-hla.md` | Monorepo structure, critical files, technology stack, data flow |
| `steering/03-8step-pipeline.md` | Complete pipeline walkthrough (Steps 1–8), SSE events, workspace evolution |
| `steering/04-database-schema.md` | SQLite schema, table definitions, TypeScript interfaces, ORM patterns |
| `steering/05-sse-api-stream.md` | SSE event types, backend implementation, frontend event handling, step transitions |
| `steering/06-market-rules.md` | US vs UK/Ireland document rules, formatting, language, ATS strategy |
| `steering/07-file-mapping.md` | This file—quick lookup for all critical files and when to edit them |
| `skills/*` | (Not yet created) — Individual skill prompts for each pipeline step |

### 🎨 Frontend & UI
| File | Purpose |
|------|---------|
| `apps/web/src/app/(public)/page.tsx` | Landing page |
| `apps/web/src/app/(public)/login/page.tsx` | Login form |
| `apps/web/src/app/(public)/signup/page.tsx` | Signup form (or calls profile-builder agent) |
| `apps/web/src/app/(auth)/dashboard/page.tsx` | Main app: application list, create form |
| `apps/web/src/app/(auth)/profile/page.tsx` | User profile editor |
| `apps/web/src/app/(auth)/applications/[id]/page.tsx` | Application detail view (results display) |
| `apps/web/src/app/api/auth/login/route.ts` | Login API (jwt creation) |
| `apps/web/src/app/api/auth/signup/route.ts` | Signup API (user + profile creation) |
| `apps/web/src/app/api/auth/logout/route.ts` | Logout API |
| `apps/web/src/app/api/profile/get/route.ts` | GET /api/profile/get |
| `apps/web/src/app/api/profile/update/route.ts` | POST /api/profile/update |
| `apps/web/src/app/api/applications/list/route.ts` | GET /api/applications/list |
| `apps/web/src/app/api/applications/[id]/route.ts` | GET /api/applications/[id] |
| `apps/web/src/app/api/generate/[id]/stream/route.ts` | **CRITICAL** — SSE endpoint. Runs pipeline, streams events to frontend |
| `apps/web/src/components/pipeline/pipeline-view.tsx` | Live pipeline progress UI. Listens to SSE events, renders step progress |
| `apps/web/src/components/results/results-view.tsx` | Results tabs: Resume (DOCX preview), Cover Letter, Strategy, ATS score |
| `apps/web/src/components/common/button.tsx` | Reusable button component (.rt-btn) |
| `apps/web/src/app/globals.css` | Global Tailwind setup, @layer components (design system) |

### 🗄️ Database & Schema
| File | Purpose |
|------|---------|
| `packages/db/src/schema.ts` | **CRITICAL** — Drizzle schema definition for all tables (users, profiles, applications, subscriptions, usageRecords, onboardingConversations) |
| `packages/db/src/types.ts` | TypeScript interfaces inferred from schema |
| `packages/db/src/client.ts` | SQLite client initialization |
| `packages/db/drizzle.config.ts` | Drizzle migration config |

### 🔐 Auth & Billing
| File | Purpose |
|------|---------|
| `packages/auth/src/local.ts` | LocalAuthProvider: bcrypt + JWT |
| `packages/auth/src/index.ts` | Exports |
| `packages/billing/src/index.ts` | recordUsage(), checkLimit() functions |

### 🐍 Python Scripts (Agent Workspace)
| File | Location | Purpose |
|------|----------|---------|
| `generate_resume.py` | `packages/scripts/` or `packages/agent/src/agent/` | Markdown → DOCX/PDF (ATS-safe). Called via `run_script("generate_resume", [...])` |
| `ats_score.py` | `packages/scripts/` or `packages/agent/src/agent/` | Resume vs JD keyword scorer (0–100). Called via `run_script("ats_score", [...])` |
| `validate_docx.py` | `packages/scripts/` or `packages/agent/src/agent/` | DOCX integrity validator. Called via `run_script("validate_docx", [...])` |

---

## When to Edit Each File

### I need to change the 8-step pipeline
→ Edit `packages/agent/src/knowledge/prompts/steering/03-8step-pipeline.md`
→ Then check `packages/agent/src/engine.ts` for step sequence changes

### I need to change bullet writing rules
→ Edit `packages/agent/src/prompt-assembler.ts` function `getBulletGuide()`
→ Or update `steering/03-8step-pipeline.md` for documentation

### I need to add a new subagent type
→ Edit `packages/agent/src/engine.ts` to define new agentDef
→ Edit `packages/agent/src/prompt-assembler.ts` to add new assembleSubagentPrompt case
→ Edit `packages/agent/src/types.ts` if adding new agent parameters

### I need to change the database schema
→ Edit `packages/db/src/schema.ts`
→ Create new migration: `packages/db/migrations/0xyz_description.sql`
→ Run `pnpm db:migrate`
→ Update `packages/db/src/types.ts` if needed (usually auto-generated)

### I need to change SSE events or add new ones
→ Edit `apps/web/src/app/api/generate/[id]/stream/route.ts`
→ Update `apps/web/src/components/pipeline/pipeline-view.tsx` event listeners

### I need to change the frontend UI
→ Edit relevant component in `apps/web/src/components/`
→ Check `apps/web/src/app/globals.css` for design system classes

### I need to change market rules (US vs UK)
→ Edit `packages/agent/src/prompt-assembler.ts` function `getMarketRules()`
→ Or update `steering/06-market-rules.md` for documentation

### I need to change authentication flow
→ Edit `packages/auth/src/local.ts`
→ Update `apps/web/src/app/api/auth/` routes if needed

### I need to track billing differently
→ Edit `packages/billing/src/index.ts`
→ Update `apps/web/src/app/api/generate/[id]/stream/route.ts` to call new functions

---

## File Size Reference

| File | Approx Lines | Complexity |
|------|--------------|------------|
| engine.ts | 300+ | HIGH—orchestration logic, agent setup, step tracking |
| prompt-assembler.ts | 685+ | HIGH—complex prompt assembly with multiple market rules |
| stream/route.ts | 100+ | HIGH—SSE setup, pipeline orchestration, error handling |
| pipeline-view.tsx | 200+ | HIGH—SSE event handling, state management, real-time progress |
| schema.ts | 150+ | MEDIUM—Drizzle table definitions |
| local.ts | 100+ | MEDIUM—auth logic |
| ats_score.py | 150+ | MEDIUM—keyword matching, scoring algorithm |
| generate_resume.py | 200+ | MEDIUM—DOCX generation from markdown |

---

## Code Dependencies

```
frontend
  ├── /api/generate/[id]/stream
  │   └── engine.ts (orchestrator)
  │       ├── prompt-assembler.ts (system prompts)
  │       │   └── knowledge/prompts/ (13 markdown files)
  │       ├── types.ts
  │       └── tools/ (web_search, web_fetch, file_ops, run_script)
  │
  ├── /api/auth/*
  │   └── auth/local.ts
  │
  ├── /api/profile/*
  │   └── db/schema.ts
  │
  └── /api/applications/*
      └── db/schema.ts

db/schema.ts
  └── auth (bcrypt)
  └── billing (usage tracking)

billing/index.ts
  └── db/schema.ts

python/generate_resume.py
  └── docx (python-docx library)

python/ats_score.py
  └── nltk or spacy (NLP for keyword matching)
```

---

## Quick Navigation

- **Add business logic:** engine.ts, prompt-assembler.ts
- **Fix a bug in the pipeline:** engine.ts (step tracking) or prompt-assembler.ts (logic)
- **Update documentation:** steering/*.md files
- **Change frontend UI:** components/*.tsx
- **Change database:** schema.ts (+ new migration)
- **Modify auth:** auth/local.ts
- **Track billing differently:** billing/index.ts + stream/route.ts
- **Fix resume generation:** generate_resume.py or prompt-assembler.ts (resume structure)
- **Fix ATS scoring:** ats_score.py or python scripts
