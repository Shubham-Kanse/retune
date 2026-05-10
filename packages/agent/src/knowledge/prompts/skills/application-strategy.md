---
name: application-strategy
description: Build a complete job application strategy beyond the resume. Use after resume and cover letter are ready. Produces referral search queries, LinkedIn outreach drafts, follow-up timeline, and interview prep. Works for any candidate and any role.
compatibility: Anthropic Console agents, claude.ai, API tool use, website resume generators
---

# Application Strategy Protocol

## When to Use
After the resume and cover letter are ready. This skill turns a passive application into an active campaign. A tailored resume submitted passively converts at 2–5%. The same resume with strategic networking converts at 10–30%.

---

## What the Agent Generates vs What the Candidate Executes

The agent generates: strategy, search queries, message drafts, timeline with real dates.
The candidate executes: LinkedIn searches, message sends, follow-ups, connection requests.

Make outputs specific enough to copy-paste and act on immediately.

---

## Strategy Components

### 1. Application Channel Optimisation

| Channel | Conversion rate | When to use |
|---|---|---|
| Referral | ~10× vs cold apply | Always — highest priority when any connection exists |
| Hiring manager outreach | High | After submitting — within 48 hours |
| Direct apply (company careers page) | 3–5% | Always — primary application channel |
| Recruiter outreach | 2–3% | If internal recruiter is identified |
| LinkedIn Easy Apply | 1–2% | Only if role is listed there AND direct apply not available |

**Priority order:** Referral → Hiring manager outreach → Direct apply → Internal recruiter → LinkedIn Easy Apply

---

### 2. Referral Mining

Generate specific LinkedIn search queries for the candidate:

```
"{CompanyName}" + "{candidate's university}"                    → alumni connections
"{CompanyName}" + "{candidate's previous employers}"            → former colleague connections  
"{CompanyName}" + "{department from JD}"                        → team members
"{CompanyName}" + "{role title from JD}"                        → peers in equivalent roles
```

For each potential referrer type, provide a draft message:

**For alumni / former colleagues:**
```
Hi {Name}, I noticed you're at {Company} — I'm applying for the {Role} position 
and your perspective on the team and culture would be really valuable. 
Would you have 10 minutes for a quick chat this week?
```

**For team members (cold outreach):**
```
Hi {Name}, I'm exploring the {Role} opening on your team. I've spent {N} years 
in {function} — most recently {brief relevant achievement}. Would love to hear 
what the team is working on. Happy to keep it brief.
```

Rules for referral messages:
- Under 75 words
- Specific about the role
- Low-commitment ask ("10 minutes," "quick chat")
- No resume attachment in first message

---

### 3. Hiring Manager Outreach

After submitting the application (24–48 hours later, not same day):

```
Hi {Name}, I just applied for the {Role} on your team. I was particularly 
drawn to {specific thing from company intel — product, initiative, challenge}. 
My background in {relevant experience} maps directly to what you're building. 
Happy to share more context beyond the application.
```

Rules:
- Send 24–48 hours after applying (same day looks desperate)
- Under 100 words
- Reference something specific — not "I'm excited about the opportunity"
- Never attach the resume in the message
- Find the hiring manager via LinkedIn search: `"{CompanyName}" "{role department}" "{city}" site:linkedin.com/in`

---

### 4. LinkedIn Optimisation Checklist

Before applying, verify the candidate's LinkedIn profile:

- [ ] Headline matches the target role title (not just current job title)
- [ ] About section echoes this resume's summary themes
- [ ] Skills section includes the JD's top 5 keywords
- [ ] Recent activity: engage with 2–3 recent company posts (like / thoughtful comment) to appear in the company's activity feed
- [ ] Recommendations: at least one visible and relevant
- [ ] Profile photo present and professional

---

### 5. Follow-Up Timeline

Calculate actual calendar dates from today's date:

| Date | Action |
|---|---|
| {today} | Submit application via primary channel |
| {today + 1 day} | Send referral messages (if connections identified) |
| {today + 2 days} | Send hiring manager LinkedIn message |
| {today + 4 days} | Engage with company content on LinkedIn |
| {today + 7 days} | If no response: follow up with internal recruiter (if identified) |
| {today + 14 days} | If still no response: one polite follow-up to hiring manager |
| {today + 21 days} | Move on — but keep the company on radar for future roles |

---

### 6. Interview Prep Seed

From the company-intel brief and JD, pre-generate:

**3 likely behavioural questions** based on the JD's key requirements:
> "Tell me about a time you had to gather requirements from stakeholders with conflicting priorities..."

**2 technical / case questions** based on the role's deliverables:
> "Walk me through how you'd approach building a dashboard for [domain from JD]..."

**3 questions the candidate should ask** — referencing recent company activity from intel brief:
> "I saw you recently [launched X / announced Y / expanded to Z] — how is the [role's team] involved in that initiative?"

**3–4 STAR stories** mapping the candidate's strongest achievements to the JD's top requirements:
```
Achievement: {title}
Maps to JD requirement: "{exact requirement phrase}"
S: {situation — 1–2 sentences}
T: {task — what was the candidate's specific responsibility}
A: {action — what they specifically did}
R: {result — metric, scope, or comparative outcome}
```

---

## Output Format

Save to `resumes/{CandidateName}/{CompanyName}/application_strategy.md`:

```markdown
# Application Strategy: {CompanyName} — {Role Title}
## Generated: {date}

### Application Channels
1. {Primary channel + link if available}
2. {Secondary channel}

### LinkedIn Search Queries
1. {query — purpose}
2. {query — purpose}
3. {query — purpose}

### Referral Outreach Templates
**For alumni / former colleagues:**
{draft message}

**For team members:**
{draft message}

### Hiring Manager Outreach
**Search query to find them:** {LinkedIn search string}
**Message (send on {specific date}):**
{draft message}

### Follow-Up Schedule
| Date | Action |
|---|---|
| {actual date} | {action} |

### Interview Prep
**Likely Behavioural Questions:**
1. {question} — *Prep: use {specific candidate achievement}*
2. {question} — *Prep: use {specific candidate achievement}*
3. {question}

**Likely Technical / Case Questions:**
1. {question}
2. {question}

**Questions to Ask Them:**
1. {research-backed question from company intel}
2. {research-backed question}
3. {research-backed question}

**STAR Stories to Prepare:**
1. **{Achievement}** → maps to: "{JD requirement}"
   S: {situation}
   T: {task}
   A: {action}
   R: {result}
```
