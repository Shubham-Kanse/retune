# What Retune will and won't help with

Charter 26 — AI Safety policy.

We built Retune to write resumes that are honest, evidence-backed, and
useful. That goal sets the boundaries below. None of these are
arbitrary — they're how we keep the product from being a tool for
fraud, harm, or manipulation.

## What we will help with

Anything that fits this shape: **a real candidate**, applying to **a real role**, with **a real resume / profile** as the basis. Across:

- Tech — software engineering, product, design, data, ML, security, devops, IT.
- Operations — finance, accounting, ops, supply chain, customer success.
- Marketing & growth — for adult-targeted, ethically-acceptable products.
- Healthcare — clinical and admin roles where the candidate has relevant evidence.
- Education — teaching, curriculum, ed-tech.
- Legal, consulting, sales — when the candidate has the experience.

We tailor for evidence on your profile. We surface gaps when they
matter. We refuse to write what you don't have.

## What we won't help with

We refuse — politely, but firmly — when the request involves:

### Fraud or fabrication
- Claiming credentials you don't have (degrees, certifications, employers).
- Inventing experience that contradicts your profile.
- Backdating or falsifying timelines.
- Using a third party's identity.

### Harmful work
- Weapons R&D and military offensive systems.
- Predatory marketing to children (ages targeted under 13 specifically — see COPPA-shaped boundary).
- Surveillance technology designed to profile or track people without their consent.
- Loan products / financial services explicitly designed to exploit financial distress.
- Election manipulation, disinformation operations, coordinated inauthentic behaviour.
- Roles directly involving the production of CSAM detection bypass tools or similar abuse-facilitation work.

### Discrimination
- Customising tone or content to obscure protected characteristics in a way that misrepresents the candidate.
- Roles with explicitly discriminatory hiring criteria.

### System abuse
- Using Retune to generate content that's not for your own job application (we are not a general resume generator for resale).
- Adversarial inputs designed to exfiltrate our prompts or jailbreak the gate.

## How we refuse

When the refuse-or-ship gate decides not to ship a generation, we tell
you why using one of these reasons (Charter 26 Epic 01 enum):

- **Not enough evidence yet** — you don't have the proof a role this
  specific demands. Add experience or pick a closer role.
- **This role isn't a fit** — your background and the JD don't overlap
  enough to write something honest.
- **We can't verify a claim** — something on your profile lacks
  evidence. Edit and retry.
- **We can't help with this one** — the request crosses our policy.
- **We detected an injection attempt** — the JD or profile contained
  override directives we ignored.
- **We need more to work with** — input was too short or not a
  resume/JD.
- **You're going too fast** — per-user rate limit.
- **Something's not right on our side** — upstream provider issue;
  retry shortly.

## Appeal

The first three are appealable. If you think we got it wrong, the
refusal card surfaces an appeal path that re-opens the active-questions
flow so you can supply the missing evidence.

## Reporting abuse

If you believe Retune has been used to violate this policy — by
yourself or someone else — email **safety@retuned.cv**.

## Updates

This policy is revised quarterly per Charter 26 Epic 06 (red-team
rotation findings). The current version is dated 2026-05-23.
