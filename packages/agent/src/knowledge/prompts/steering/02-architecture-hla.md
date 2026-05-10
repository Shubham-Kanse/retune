# Retune Architecture & High-Level Design

## Monorepo Structure

```
retune/
├── apps/web/                        # Next.js 15 frontend (App Router)
│   ├── src/app/(auth)/              # Protected routes
│   │   ├── dashboard/page.tsx       # Application list
│   │   ├── profile/page.tsx         # User profile
│   │   └── applications/[id]/page.tsx
│   ├── src/app/(public)/            # Public routes
│   │   ├── page.tsx                 # Landing
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── src/app/api/                 # API routes & SSE
│   │   ├── auth/                    # Login, signup, logout
│   │   ├── profile/                 # Get, update profile
│   │   ├── applications/            # List, get application
│   │   └── generate/[id]/stream/    # SSE pipeline (CRITICAL)
│   └── src/components/              # UI components
│       ├── pipeline/pipeline-view.tsx   # Live progress UI
│       ├── results/results-view.tsx     # Resume, cover letter, strategy tabs
│       └── common/                      # Buttons, inputs, cards
│
├── packages/
│   ├── agent/                       # AI agent runtime (@retune/agent)
│   │   ├── src/
│   │   │   ├── engine.ts            # Agent orchestrator (Claude Agent SDK)
│   │   │   ├── prompt-assembler.ts  # System prompt builder (CRITICAL)
│   │   │   ├── types.ts             # Agent types, tool definitions
│   │   │   └── knowledge/prompts/   # 13 markdown instruction files
│   │   │       ├── resume-writer-prompt.md
│   │   │       ├── steering/        # Market rules, architecture docs
│   │   │       └── skills/          # Pipeline skills
│   │   └── src/agent/               # Python scripts
│   │       ├── generate_resume.py
│   │       ├── ats_score.py
│   │       └── validate_docx.py
│   │
│   ├── auth/                        # JWT auth (@retune/auth)
│   │   └── src/local.ts             # bcrypt + JWT provider
│   │
│   ├── billing/                     # Usage tracking (@retune/billing)
│   │   └── src/index.ts             # recordUsage(), checkLimit()
│   │
│   ├── db/                          # SQLite + Drizzle (@retune/db)
│   │   ├── src/schema.ts            # Schema: users, profiles, applications, subscriptions
│   │   ├── src/types.ts             # TypeScript interfaces
│   │   └── drizzle.config.ts        # Migration config
│   │
│   └── scripts/                     # Python tools (also in agent/src/agent/)
│       ├── generate_resume.py
│       ├── ats_score.py
│       └── validate_docx.py
│
└── .claude/                         # Claude Code project config
    ├── settings.json
    ├── agents/                      # Custom subagents
    └── skills/                      # Custom skills
```

## Critical Files & Their Roles

### Agent & Prompt Assembly
| File | Purpose |
|------|---------|
| `packages/agent/src/engine.ts` | Orchestrates subagents using Claude Agent SDK. Sets up workspace, defines agent configs, tracks pipeline steps |
| `packages/agent/src/prompt-assembler.ts` | Assembles system prompts per agent type (company-researcher, jd-analyzer, resume-writer, cover-letter-writer, strategy-planner) |
| `packages/agent/src/types.ts` | AgentParams, AgentResult, tool definitions |
| `packages/agent/src/knowledge/prompts/` | 13 markdown files: master prompt + 12 skill/steering docs |

### Frontend SSE Pipeline
| File | Purpose |
|------|---------|
| `apps/web/src/app/api/generate/[id]/stream/route.ts` | SSE endpoint. Calls engine.ts, streams agent events to frontend |
| `apps/web/src/components/pipeline/pipeline-view.tsx` | Live progress UI. Maps SSE events to step progress |
| `apps/web/src/components/results/results-view.tsx` | Results tabs: Resume (DOCX), Cover Letter, Strategy |
| `apps/web/src/app/(auth)/dashboard/page.tsx` | Application list & create form |

### Database
| File | Purpose |
|------|---------|
| `packages/db/src/schema.ts` | Drizzle schema: users, profiles, applications, onboardingConversations, subscriptions, usageRecords |
| `packages/db/src/types.ts` | TypeScript types from schema |
| `packages/db/src/client.ts` | SQLite client init |

### Auth & Billing
| File | Purpose |
|------|---------|
| `packages/auth/src/local.ts` | bcrypt + JWT (httpOnly cookies) |
| `packages/billing/src/index.ts` | recordUsage(userId, type, appId), checkLimit(userId, type) |

### Python Scripts
| File | Purpose |
|------|---------|
| `generate_resume.py` | Markdown → DOCX/PDF (ATS-safe) |
| `ats_score.py` | Resume vs JD keyword coverage (0–100) |
| `validate_docx.py` | DOCX structural integrity checker |

## Technology Stack
- **Frontend:** Next.js 15 (App Router, Server Components), Tailwind v4, Framer Motion
- **Backend:** Node.js, TypeScript, Claude Agent SDK
- **Database:** SQLite + Drizzle ORM
- **Auth:** JWT in httpOnly cookies
- **Scripts:** Python 3 (docx, python-pptx, etc.)
- **AI:** Claude Sonnet 4.6 (agent loop), Claude Haiku (orchestrator)

## Design System
- **Colors:** oklch color space, dark mode via `.dark` class
- **Components:** Sharp corners (no border-radius), Tailwind v4 @layer components
- **Typography:** Inter (sans), JetBrains Mono (mono)
- **Animations:** Framer Motion + Tailwind animate utilities
- **Header:** 56px sticky header, z-40

## Data Flow
1. User provides JD URL via `/dashboard`
2. POST `/api/generate/[id]/stream` with application ID
3. Backend calls `runAgent()` from engine.ts
4. Engine orchestrates subagents sequentially: researcher → jd-analyzer → resume-writer → cover-letter-writer → strategy-planner
5. Each subagent writes to workspace, parent tracks events
6. SSE streams events to frontend (step_start, step_complete, ats_score, complete, error)
7. Frontend renders live progress + final results (DOCX, cover letter, strategy)

## Key Principles
- **Workspace isolation:** Each application gets a unique workspace directory
- **File-based communication:** Subagents communicate via workspace files
- **Streaming feedback:** SSE provides real-time progress to user
- **Graceful degradation:** Agents complete pipeline steps sequentially; failures are surfaced
