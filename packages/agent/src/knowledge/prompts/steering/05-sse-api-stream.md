# SSE Pipeline Streaming & API Routes

## SSE Endpoint: /api/generate/[id]/stream

**Route File:** `apps/web/src/app/api/generate/[id]/stream/route.ts`

**Purpose:** Executes the 8-step pipeline and streams real-time progress to the frontend via Server-Sent Events.

### Request
```typescript
POST /api/generate/[id]/stream
Content-Type: application/json
Cookie: auth_token=<jwt>

{
  // Optional: if not resuming, agent will fetch from DB
  // Market inferred from user profile
}
```

### Response (SSE Stream)
```
event: step_start
data: {"step": "company_research", "timestamp": 1234567890}

event: step_complete
data: {"step": "company_research", "durationMs": 45000, "timestamp": 1234567945}

event: step_complete
data: {"step": "jd_analysis", "durationMs": 30000}

event: ats_score
data: {"score": 87, "matched": ["keyword1", "keyword2"], "missing": ["keyword3"], "timestamp": 1234568000}

event: agent_log
data: {"message": "Agent thinking about bullet structure...", "level": "info"}

event: step_complete
data: {"step": "cover_letter", "durationMs": 25000}

event: complete
data: {
  "resumeDocxUrl": "https://storage.example.com/app123_resume.docx",
  "resumePdfUrl": "https://storage.example.com/app123_resume.pdf",
  "coverLetterUrl": "https://storage.example.com/app123_cover.docx",
  "strategyUrl": "https://storage.example.com/app123_strategy.md",
  "atsScore": 87,
  "totalDurationMs": 180000,
  "timestamp": 1234568180
}

event: error
data: {
  "message": "ATS score below 75% despite revisions. Manual review recommended.",
  "step": "resume_writing",
  "code": "ATS_THRESHOLD_FAILED",
  "timestamp": 1234568200
}
```

---

## Event Types

### step_start
Emitted when a pipeline step begins.
```json
{
  "step": "company_research" | "jd_analysis" | "resume_writing" | "quality_gate" | "document_generation" | "cover_letter" | "application_strategy",
  "timestamp": number (unix ms)
}
```

### step_complete
Emitted when a step finishes.
```json
{
  "step": string,
  "durationMs": number,
  "timestamp": number (unix ms)
}
```

### ats_score
Emitted during Step 4 (ATS Score Check).
```json
{
  "score": number (0–100),
  "matched": string[] (matched keywords),
  "missing": string[] (missing keywords),
  "timestamp": number
}
```

### agent_log
Emitted periodically for debugging/progress feedback.
```json
{
  "message": string,
  "level": "debug" | "info" | "warn",
  "timestamp": number
}
```

### complete
Emitted when all 8 steps finish successfully.
```json
{
  "resumeDocxUrl": string,
  "resumePdfUrl": string | null,
  "coverLetterUrl": string | null,
  "strategyUrl": string | null,
  "atsScore": number,
  "totalDurationMs": number,
  "timestamp": number
}
```

### error
Emitted if pipeline fails at any step.
```json
{
  "message": string,
  "step": string,
  "code": string (error code for frontend handling),
  "timestamp": number
}
```

---

## Backend Implementation Flow

**File:** `apps/web/src/app/api/generate/[id]/stream/route.ts`

```typescript
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSession() // Auth
  const application = await db.query.applications.findFirst({
    where: eq(applications.id, params.id),
    with: { profile: true }
  })

  // Billing check via @retune/billing
  const canGenerate = await checkLimit(session.userId, "generation")
  if (!canGenerate) {
    return new Response(
      `event: error\ndata: {"message": "Limit exceeded"}\n\n`,
      { headers: { "Content-Type": "text/event-stream" } }
    )
  }

  const workspace = `/tmp/retune_workspace/${params.id}`
  const abortController = new AbortController()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Call engine.ts runAgent()
        const result = await runAgent({
          workspace,
          profile: application.profile,
          market: application.market,
          userMessage: application.jdUrl,
          signal: abortController.signal,
          onEvent: (event) => {
            // Stream SSE event to frontend
            controller.enqueue(
              new TextEncoder().encode(
                `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`
              )
            )
          }
        })

        // Update application with final results
        await db.update(applications).set({
          status: "completed",
          resumeDocxUrl: result.resumeDocxUrl,
          atsScore: result.atsScore,
          updatedAt: new Date()
        })

        // Record usage for billing
        await recordUsage(session.userId, "generation", params.id)

        controller.close()
      } catch (err) {
        controller.enqueue(
          new TextEncoder().encode(
            `event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`
          )
        )
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    }
  })
}
```

---

## Frontend Event Handling

**File:** `apps/web/src/components/pipeline/pipeline-view.tsx`

```typescript
useEffect(() => {
  const eventSource = new EventSource(`/api/generate/${applicationId}/stream`)

  eventSource.addEventListener("step_start", (e) => {
    const { step } = JSON.parse(e.data)
    setCurrentStep(step)
  })

  eventSource.addEventListener("step_complete", (e) => {
    const { step, durationMs } = JSON.parse(e.data)
    setCompletedSteps(prev => [...prev, step])
    setStepDuration(prev => ({ ...prev, [step]: durationMs }))
  })

  eventSource.addEventListener("ats_score", (e) => {
    const { score, matched, missing } = JSON.parse(e.data)
    setAtsScore(score)
    setAtsDetails({ matched, missing })
  })

  eventSource.addEventListener("complete", (e) => {
    const result = JSON.parse(e.data)
    setResults(result)
    setIsComplete(true)
    eventSource.close()
  })

  eventSource.addEventListener("error", (e) => {
    const { message, step } = JSON.parse(e.data)
    setError({ message, step })
    eventSource.close()
  })

  return () => eventSource.close()
}, [applicationId])
```

---

## Step Transition Logic

The backend maps agent tool calls to step transitions:

| Tool Call | Signal | New Step |
|-----------|--------|----------|
| write_file → company_intel | Tool complete | company_research ✓ |
| write_file → jd_analysis | Tool complete | jd_analysis ✓ |
| run_script → ats_score | Script output | resume_writing ✓ |
| run_script → generate_resume | Script output | document_generation ✓ |
| Agent completes | Final state | application_strategy ✓ |

---

## Error Handling

**Recoverable Errors:**
- ATS score below 75% after 3 revision attempts → emit warning, continue
- Missing workspace file → recreate, retry

**Unrecoverable Errors:**
- Auth failure → HTTP 401
- Billing limit exceeded → HTTP 402
- Tool execution failure (web_search times out, generate_resume.py crash) → emit error event, stop
- Agent exceeds max iterations → emit error event, stop

---

## File Output Handling

After pipeline completes, DOCX/PDF files are:
1. Stored in workspace directory
2. Optionally uploaded to S3 or CDN (via env var `STORAGE_BACKEND`)
3. URLs returned in `complete` event
4. URLs persisted in applications table (resumeDocxUrl, resumePdfUrl)

If no external storage is configured, files remain in workspace and URLs are workspace-relative paths.
