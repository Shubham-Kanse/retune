# Epic 01: Secret Rotation & Git History Remediation

**Charter:** Security  
**Priority:** P0 — start Day 1, before any other work  
**Complexity:** M  
**Owner:** Staff Engineer + DevOps Engineer

---

## Goal

Remove all committed secrets from the git repository and rotate every credential that was exposed. The repository must be clean before any new contributor is onboarded or any CI pipeline runs.

## Definition of Done

- [ ] `gitleaks detect --source . --no-git` exits 0 on the full repo
- [ ] `git log --all --full-history -- .env.vercel` shows the file removed from all commits
- [ ] `git log --all --full-history -- keys/` shows the directory removed from all commits
- [ ] All 7 rotated credentials are confirmed working in production
- [ ] `.gitignore` blocks future commits of `.env*`, `keys/`, `*.json` service account files
- [ ] Force-push to `main` completed and all collaborators have re-cloned

---

## Context: What Is Exposed

The following files are committed in the current git history and contain live production credentials:

**File: `.env.vercel`**
- `OPENAI_API_KEY=sk-proj-MMlfjpZ9b03BW7...` — live OpenAI key
- `ANTHROPIC_API_KEY=sk-ant-api03-0qdvgfrvcR_4Yx...` — live Anthropic key
- `SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...` — Supabase admin JWT (bypasses all RLS)
- `RETUNE_DATABASE_URL=postgresql://postgres.jttnglsxzuxmqqdpdufm:LuffyTaro%40123@...` — DB with plaintext password
- `SMTP_PASS=LuffyTaro@123` — email account password
- `JWT_SECRET=6agj5oy9f+vZjEKwzUdtHU7f3Jq+9kP+fml/3ip+4w8=` — JWT signing secret

**File: `keys/retune-495722-8e3d69d74ce1.json`**
- Google Cloud service account private key for `vertex-express@retune-495722.iam.gserviceaccount.com`
- Full RSA private key in plaintext

---

## Story 1.1: Rotate All Exposed Credentials

**As a** security engineer,  
**I want** all exposed production credentials rotated before the git history is cleaned,  
**so that** even if someone has already cloned the repo, the stolen credentials are worthless.

**Rationale:** Cleaning git history does not invalidate credentials that have already been copied. Rotation must happen first.

**Acceptance Criteria:**
- [ ] New OpenAI API key generated at platform.openai.com; old key `sk-proj-MMlfjpZ9b03BW7...` revoked and confirmed returning 401
- [ ] New Anthropic API key generated at console.anthropic.com; old key `sk-ant-api03-0qdvgfrvcR_4Yx...` revoked and confirmed returning 401
- [ ] Supabase service role key regenerated at jttnglsxzuxmqqdpdufm.supabase.co → Settings → API; old JWT confirmed invalid
- [ ] Supabase database password changed; old password `LuffyTaro@123` confirmed rejected by `psql`
- [ ] `SMTP_PASS` changed on mail.privateemail.com; old password confirmed rejected by SMTP AUTH
- [ ] New `JWT_SECRET` generated (`openssl rand -base64 32`); old secret discarded
- [ ] Google Cloud service account key `8e3d69d74ce1` deleted at console.cloud.google.com → IAM → Service Accounts; new key generated if service account is still needed
- [ ] Production deployment updated with all new credentials and confirmed healthy (`GET /api/health` returns 200)

### Task 1.1.1: Rotate OpenAI API Key
**Owner:** Staff Engineer  
**Deliverable:** New OpenAI key active in production, old key revoked  
**Dependencies:** None

##### Subtask: Generate new OpenAI key
Go to platform.openai.com → API Keys → Create new secret key. Name it `retune-production-2`. Copy the key — it is shown only once.  
**Output:** New key string saved in a local password manager (not in any file)  
**Effort:** < 2 hours

##### Subtask: Update Vercel environment variable
In Vercel dashboard → retune project → Settings → Environment Variables, update `OPENAI_API_KEY` to the new value. Scope: Production only.  
**Output:** Vercel shows new key value (masked) for Production environment  
**Effort:** < 2 hours

##### Subtask: Trigger production redeploy and verify
Trigger a redeploy in Vercel. After deploy completes, run: `curl -s https://retuned.cv/api/health | jq .` — confirm 200 response with no AI provider errors.  
**Output:** Production health check passes with new key  
**Effort:** < 2 hours

##### Subtask: Revoke old OpenAI key
In platform.openai.com → API Keys, delete the key starting with `sk-proj-MMlfjpZ9b03BW7`. Confirm it is gone from the list.  
**Output:** Old key deleted; any request using it returns 401  
**Effort:** < 2 hours

### Task 1.1.2: Rotate Anthropic API Key
**Owner:** Staff Engineer  
**Deliverable:** New Anthropic key active in production, old key revoked  
**Dependencies:** None (can run in parallel with 1.1.1)

##### Subtask: Generate new Anthropic key
Go to console.anthropic.com → API Keys → Create Key. Name it `retune-production-2`.  
**Output:** New key string saved in password manager  
**Effort:** < 2 hours

##### Subtask: Update Vercel and redeploy
Update `ANTHROPIC_API_KEY` in Vercel Production environment. Trigger redeploy. Verify health check.  
**Output:** Production healthy with new Anthropic key  
**Effort:** < 2 hours

##### Subtask: Revoke old Anthropic key
Delete key `sk-ant-api03-0qdvgfrvcR_4Yx...` from console.anthropic.com.  
**Output:** Old key deleted  
**Effort:** < 2 hours

### Task 1.1.3: Rotate Supabase Service Role Key
**Owner:** Staff Engineer  
**Deliverable:** New service role key active, old JWT invalid  
**Dependencies:** None

##### Subtask: Regenerate service role key
In Supabase dashboard → Project jttnglsxzuxmqqdpdufm → Settings → API → Service Role Key → Reset. Copy new JWT.  
**Output:** New service role JWT  
**Effort:** < 2 hours

##### Subtask: Update all consumers
Update `SUPABASE_SERVICE_ROLE_KEY` in Vercel Production. Search codebase for any other references: `grep -r "eyJhbGci" . --include="*.ts" --include="*.env*"` — confirm no hardcoded references remain.  
**Output:** All consumers using new key  
**Effort:** < 2 hours

##### Subtask: Verify old key is invalid
Run: `curl -H "apikey: <OLD_KEY>" -H "Authorization: Bearer <OLD_KEY>" https://jttnglsxzuxmqqdpdufm.supabase.co/rest/v1/users` — confirm 401.  
**Output:** Old key returns 401  
**Effort:** < 2 hours

### Task 1.1.4: Rotate Database Password
**Owner:** Staff Engineer  
**Deliverable:** New DB password active, old password rejected  
**Dependencies:** None

##### Subtask: Change database password
In Supabase dashboard → Settings → Database → Reset database password. Generate a strong password (min 32 chars, alphanumeric + symbols, no `@` or `%` to avoid URL encoding issues). Save in password manager.  
**Output:** New password set  
**Effort:** < 2 hours

##### Subtask: Update RETUNE_DATABASE_URL
Construct new connection string: `postgresql://postgres.jttnglsxzuxmqqdpdufm:<NEW_PASSWORD>@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`. Update in Vercel Production. Trigger redeploy.  
**Output:** Production connects to DB with new password  
**Effort:** < 2 hours

##### Subtask: Verify old password rejected
Run: `psql "postgresql://postgres.jttnglsxzuxmqqdpdufm:LuffyTaro%40123@aws-0-eu-west-1.pooler.supabase.com:6543/postgres" -c "SELECT 1"` — confirm connection refused.  
**Output:** Old password rejected  
**Effort:** < 2 hours

### Task 1.1.5: Rotate SMTP Password, JWT Secret, and Google Service Account Key
**Owner:** Staff Engineer  
**Deliverable:** All three rotated and production healthy  
**Dependencies:** None (parallel with other tasks)

##### Subtask: Change SMTP password
Log into mail.privateemail.com → Mailboxes → hello@retuned.cv → Change Password. Generate strong password. Update `SMTP_PASS` in Vercel Production.  
**Output:** New SMTP password active  
**Effort:** < 2 hours

##### Subtask: Generate new JWT_SECRET
Run: `openssl rand -base64 32`. Update `JWT_SECRET` in Vercel Production. Note: this invalidates all existing JWT tokens — users will be logged out. Schedule for low-traffic window.  
**Output:** New JWT secret active; all existing sessions invalidated  
**Effort:** < 2 hours

##### Subtask: Delete Google service account key
In Google Cloud Console → IAM & Admin → Service Accounts → vertex-express@retune-495722.iam.gserviceaccount.com → Keys → Delete key `8e3d69d74ce1`. If the service account is still needed, create a new key and store it in a secrets manager (not in the repo).  
**Output:** Old key deleted from Google Cloud  
**Effort:** < 2 hours

---

## Story 1.2: Remove Secrets from Git History

**As a** staff engineer,  
**I want** all secret-containing files removed from the entire git history,  
**so that** `git clone` of any commit in history does not expose credentials.

**Rationale:** After rotation, the old credentials are worthless, but the files still exist in git history. Any future contributor who clones the repo and checks out an old commit will see the old (now invalid) secrets. This is a compliance and hygiene issue.

**Acceptance Criteria:**
- [ ] `git log --all --full-history -- .env.vercel` returns empty output
- [ ] `git log --all --full-history -- keys/` returns empty output
- [ ] `git log --all --full-history -- apps/web/.env` returns empty output (if it contains secrets)
- [ ] `git log --all --full-history -- apps/api/.env` returns empty output (if it contains secrets)
- [ ] `gitleaks detect --source . --no-git` exits 0 (scans working tree)
- [ ] `gitleaks detect --source . --log-opts="--all"` exits 0 (scans full history)
- [ ] All collaborators have been notified to re-clone; old local clones are invalidated
- [ ] Force-push to `main` and all other branches completed

**Pre-condition:** Story 1.1 (all credentials rotated) must be complete before this story starts.

### Task 1.2.1: Audit All Secret-Containing Files
**Owner:** Staff Engineer  
**Deliverable:** Complete list of files to remove from history  
**Dependencies:** Story 1.1 complete

##### Subtask: Run gitleaks on full history
```bash
brew install gitleaks
gitleaks detect --source . --log-opts="--all" --report-format json --report-path /tmp/gitleaks-report.json
cat /tmp/gitleaks-report.json | jq '.[].File' | sort -u
```
**Output:** List of all files containing secrets across all commits  
**Effort:** < 2 hours

##### Subtask: Check apps/web/.env and apps/api/.env
Run: `grep -E "(sk-|eyJ|password|secret|key)" apps/web/.env apps/api/.env` — determine if these local dev env files contain real secrets or only placeholder values.  
**Output:** Decision on whether these files also need history removal  
**Effort:** < 2 hours

### Task 1.2.2: Remove Files from Git History Using BFG
**Owner:** Staff Engineer  
**Deliverable:** Git history cleaned, force-pushed  
**Dependencies:** Task 1.2.1

##### Subtask: Install BFG Repo Cleaner
```bash
brew install bfg
```
**Output:** `bfg --version` works  
**Effort:** < 2 hours

##### Subtask: Create a fresh bare clone for BFG
```bash
cd /tmp
git clone --mirror git@github.com:<org>/retune.git retune-mirror.git
```
**Output:** Bare mirror clone at `/tmp/retune-mirror.git`  
**Effort:** < 2 hours

##### Subtask: Remove .env.vercel from all history
```bash
cd /tmp/retune-mirror.git
bfg --delete-files .env.vercel
```
**Output:** `.env.vercel` removed from all commits in the mirror  
**Effort:** < 2 hours

##### Subtask: Remove keys/ directory from all history
```bash
bfg --delete-folders keys
```
**Output:** `keys/` directory removed from all commits  
**Effort:** < 2 hours

##### Subtask: Remove apps/web/.env and apps/api/.env if they contain secrets
Only if Task 1.2.1 confirmed they contain real secrets:
```bash
bfg --delete-files .env
```
**Output:** `.env` files removed from history (or skipped if clean)  
**Effort:** < 2 hours

##### Subtask: Run git reflog expire and gc
```bash
cd /tmp/retune-mirror.git
git reflog expire --expire=now --all
git gc --prune=now --aggressive
```
**Output:** Old objects pruned from the mirror  
**Effort:** < 2 hours

##### Subtask: Force-push cleaned history
```bash
git push --force
```
Notify all collaborators: "The git history has been rewritten. You must delete your local clone and re-clone: `git clone git@github.com:<org>/retune.git`"  
**Output:** Remote history is clean; all collaborators notified  
**Effort:** < 2 hours

### Task 1.2.3: Verify Clean History
**Owner:** Staff Engineer  
**Deliverable:** Confirmed clean scan  
**Dependencies:** Task 1.2.2

##### Subtask: Run gitleaks on cleaned history
```bash
git clone git@github.com:<org>/retune.git /tmp/retune-clean
cd /tmp/retune-clean
gitleaks detect --source . --log-opts="--all"
```
Expected: exit 0, no findings.  
**Output:** gitleaks exits 0 on full history  
**Effort:** < 2 hours

##### Subtask: Verify specific files are gone
```bash
git log --all --full-history -- .env.vercel
git log --all --full-history -- keys/
```
Expected: both return empty output.  
**Output:** Files confirmed absent from all history  
**Effort:** < 2 hours

---

## Story 1.3: Harden .gitignore to Prevent Future Secret Commits

**As a** developer,  
**I want** `.gitignore` to block all secret-containing file patterns,  
**so that** no future developer can accidentally commit credentials.

**Acceptance Criteria:**
- [ ] `.gitignore` at repo root contains entries for: `.env`, `.env.*`, `!.env.example`, `keys/`, `*.pem`, `*.p12`, `*-service-account*.json`, `*credentials*.json`
- [ ] `git add .env.vercel` returns: `The following paths are ignored by one of your .gitignore files: .env.vercel`
- [ ] `git add keys/` returns ignored
- [ ] `.env.example` is NOT ignored (it must be committed as a template)
- [ ] Pre-commit hook (from Epic 2) runs `gitleaks` before every commit

### Task 1.3.1: Update .gitignore
**Owner:** Frontend Engineer  
**Deliverable:** Updated `.gitignore` with all secret patterns blocked  
**Dependencies:** None

##### Subtask: Add secret file patterns to root .gitignore
Open `/Users/shubhamkanse/retune/.gitignore`. Add the following block after the existing entries:
```
# ── Secrets (never commit) ──────────────────────────────────────────────────
.env
.env.*
!.env.example
keys/
*.pem
*.p12
*.pfx
*-service-account*.json
*credentials*.json
*-key.json
```
**Output:** `.gitignore` updated  
**Effort:** < 2 hours

##### Subtask: Verify .env.example is still tracked
Run: `git check-ignore -v .env.example` — should return nothing (not ignored).  
Run: `git check-ignore -v .env.vercel` — should return `.gitignore:.env.*:.env.vercel`.  
**Output:** `.env.example` tracked, `.env.vercel` ignored  
**Effort:** < 2 hours

##### Subtask: Commit and push .gitignore change
```bash
git add .gitignore
git commit -m "security: harden .gitignore to block secret file patterns"
git push
```
**Output:** Updated `.gitignore` in main branch  
**Effort:** < 2 hours

---

## Unit Tests Required

These tests live in `apps/web/src/app/api/auth/__tests__/` and verify that the auth routes do not leak credentials in responses.

```typescript
// File: apps/web/src/app/api/auth/__tests__/credential-leak.test.ts
describe("Auth routes do not leak credentials in responses", () => {
  it("POST /api/auth/login response body does not contain any env var values", async () => {
    // Verify that OPENAI_API_KEY, ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY
    // are not present in any JSON response body from auth routes
  });
});
```

## Integration Tests Required

None for this epic — this is an operational task, not a code change. Verification is done via `gitleaks` scan and manual credential testing.
