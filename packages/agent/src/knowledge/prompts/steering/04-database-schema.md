# Database Schema & Data Models

## SQLite + Drizzle ORM Structure

All tables are defined in `packages/db/src/schema.ts`.

### users
Stores user identity and authentication.

```typescript
{
  id: string (PK)
  email: string (UNIQUE, case-insensitive index)
  passwordHash: string (bcrypt, 12 rounds)
  name: string
  createdAt: timestamp
  updatedAt: timestamp
}
```

**Key Notes:**
- Email is unique and case-insensitive
- Password hashing: bcrypt with 12 rounds
- All timestamps are ISO 8601

---

### profiles
Stores candidate profile data (rich JSON blob structure).

```typescript
{
  id: string (PK)
  userId: string (FK → users.id)
  fullName: string
  email: string
  phone: string | null
  linkedin: string | null
  location: string
  visaStatus: string | null
  currentTitle: string | null
  relocationPreferences: string[] (JSON)
  targetRoles: string[] (JSON)
  experienceLevel: "entry" | "mid" | "senior"
  experience: Experience[] (JSON array)
    {
      company: string
      title: string
      titleForResume: string
      startDate: string (YYYY-MM)
      endDate: string (YYYY-MM or "present")
      description: string
      metrics: Metric[] (JSON array)
        {
          metric: string
          value: string
          context: string
          direction: "improved" | "reduced" | "achieved"
        }
      tools: string[] (JSON)
      teamSize: number | null
      client: string | null
      industry: string | null
    }
  education: Education[] (JSON array)
    {
      degree: string
      institution: string
      startDate: string (YYYY)
      endDate: string (YYYY)
      status: "completed" | "in_progress"
      coursework: string[] (JSON)
      capstone: string | null
    }
  certifications: string[] (JSON)
  projects: Project[] (JSON array)
    {
      name: string
      type: "personal" | "university" | "open-source"
      year: number
      description: string
      technologies: string[] (JSON)
      role: string
      keyMetric: string | null
    }
  skillsTier1: Skill[] (JSON array) - daily, battle-tested
    {
      name: string
      evidence: string
      years: number
    }
  skillsTier2: Skill[] (JSON array) - proficient, real-world use
  skillsTier3: Skill[] (JSON array) - exposure
  voiceNotes: string | null
  createdAt: timestamp
  updatedAt: timestamp
}
```

**Key Notes:**
- Stores entire candidate profile as JSON blob
- Tier system: Tier 1 (daily use) → Tier 2 (proficient) → Tier 3 (exposure)
- Experience includes real metrics with direction (improved/reduced/achieved)
- Rich enough for strong resume generation

---

### applications
Stores job application state and results.

```typescript
{
  id: string (PK)
  userId: string (FK → users.id)
  companyName: string
  roleTitle: string
  jdUrl: string (optional, if user provided URL)
  status: "draft" | "processing" | "completed" | "failed"
  atsScore: number | null (0–100, null until Step 4 complete)
  market: "us" | "uk" (determined from user profile location)
  workspaceId: string (reference to /tmp/retune_workspace/{id}/)
  resumeDocxUrl: string | null (S3 or local path after Step 6)
  resumePdfUrl: string | null
  coverLetterUrl: string | null
  strategyUrl: string | null
  errorMessage: string | null (if status = "failed")
  createdAt: timestamp
  updatedAt: timestamp
  completedAt: timestamp | null
}
```

**Key Notes:**
- workspaceId is unique per application (temporary directory)
- Status flow: draft → processing → completed (or failed)
- URLs populated as steps complete
- market inferred from user's location if not explicitly set

---

### onboardingConversations
Stores the profile-building conversation history.

```typescript
{
  id: string (PK)
  userId: string (FK → users.id)
  messages: Message[] (JSON array)
    {
      role: "user" | "assistant"
      content: string
      timestamp: string (ISO 8601)
    }
  status: "in_progress" | "completed"
  profileGeneratedFrom: string (reference to final profile JSON)
  createdAt: timestamp
  completedAt: timestamp | null
}
```

---

### subscriptions
Stores user subscription state.

```typescript
{
  id: string (PK)
  userId: string (FK → users.id)
  plan: "free" | "pro"
  status: "active" | "cancelled" | "past_due"
  billingCycleStart: timestamp
  billingCycleEnd: timestamp
  createdAt: timestamp
  updatedAt: timestamp
  cancelledAt: timestamp | null
}
```

---

### usageRecords
Tracks usage for billing enforcement.

```typescript
{
  id: string (PK)
  userId: string (FK → users.id)
  type: "generation" | "refinement"
  applicationId: string (FK → applications.id)
  createdAt: timestamp
}
```

**Billing Logic:**
- Free: 2 generations, 5 refinements per application
- Pro: unlimited
- Checked via `@retune/billing` before starting pipeline

---

## Key Relationships

```
users (1) ──── (N) profiles
         ──── (N) applications
         ──── (N) subscriptions
         ──── (N) usageRecords
         ──── (N) onboardingConversations

applications ──── (1) users
             ──── (1) usageRecords (optional, only if tracked)
```

---

## TypeScript Interfaces

Generated from schema in `packages/db/src/types.ts`:

```typescript
export type CandidateProfile = typeof profiles.$inferSelect
export type CandidateProfileInsert = typeof profiles.$inferInsert
export type Application = typeof applications.$inferSelect
export type ApplicationInsert = typeof applications.$inferInsert
export type User = typeof users.$inferSelect
export type Subscription = typeof subscriptions.$inferSelect
// ... etc
```

---

## Database Client

Located in `packages/db/src/client.ts`:

```typescript
import { Database } from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"

const db = drizzle(new Database(process.env.DATABASE_URL || "./retune.db"))
export default db
```

**Usage:**
```typescript
import db from "@retune/db"
import { users, profiles } from "@retune/db/schema"
import { eq } from "drizzle-orm"

// Query
const user = db.query.users.findFirst({
  where: eq(users.id, userId),
  with: { profiles: true }
})

// Insert
db.insert(applications).values({
  userId, companyName, roleTitle, status: "draft"
})

// Update
db.update(applications)
  .set({ atsScore: 87, status: "completed" })
  .where(eq(applications.id, appId))
```

---

## Migrations

Run with:
```bash
pnpm db:migrate
```

Migration files stored in `packages/db/migrations/`.

Drizzle Studio available via:
```bash
pnpm db:studio
```
