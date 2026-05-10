/**
 * Production-grade integration test fixtures.
 *
 * Three realistic candidate × JD pairings that exercise the full
 * cognitive pipeline (comprehension → evidence mapping → arc selection
 * → bullet composition → refuse-or-ship gate).
 *
 * Each fixture exports `{ jd_title, company, market, jd_text, profile_text }`
 * together with the expected pipeline verdicts so integration tests can
 * assert correctness without running LLM calls.
 *
 * Expected verdicts:
 *   - ALEX_MORGAN_STRIPE      → strong_match,   arc: deep_specialist
 *   - SARAH_CHEN_FIGMA        → moderate_match, arc: built_from_zero | scaled_it
 *   - MARCUS_WILLIAMS_OPENAI  → weak_match,     arc: domain_pivoter
 */

export interface TestFixture {
  jd_title: string;
  company: string;
  market: "US" | "UK";
  jd_text: string;
  profile_text: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixture 1 — Alex Morgan — Senior Software Engineer (Platform) at Stripe
// Expected: strong_match, arc: deep_specialist
// ─────────────────────────────────────────────────────────────────────────────

export const ALEX_MORGAN_STRIPE: TestFixture = {
  jd_title: "Senior Software Engineer — Platform",
  company: "Stripe",
  market: "US",

  jd_text: `
# Senior Software Engineer — Platform
**Stripe · San Francisco, CA (Hybrid)**

Stripe's Platform Engineering team builds the foundational infrastructure that
powers hundreds of millions of API calls per day. We're looking for a Senior
Software Engineer who thrives in high-scale distributed systems and cares deeply
about reliability, developer experience, and long-term technical architecture.

## What you'll do

- Design, build, and own large-scale distributed services handling 10M+ transactions per day
- Lead cross-functional projects to improve reliability, latency, and cost efficiency
- Drive architectural decisions and mentor junior engineers
- Partner with product, security, and data teams to deliver platform capabilities
- Own the on-call rotation and proactively reduce operational toil through automation

## Minimum qualifications

- 5+ years of professional software engineering experience
- Deep expertise in TypeScript and Node.js for backend service development
- Strong working knowledge of PostgreSQL and Redis in high-throughput environments
- Demonstrated experience designing and operating distributed systems at scale
- Proven ability to debug complex, multi-service production incidents
- Strong written and verbal communication skills

## Preferred qualifications

- Experience with Kubernetes and Docker container orchestration in production
- Hands-on experience with AWS (ECS, RDS Aurora, ElastiCache, CloudWatch)
- Familiarity with React and TypeScript for internal tooling or developer portals
- Prior experience in fintech, payments, or regulated financial services
- Comfort with on-call responsibilities and incident response

## About the team

The Platform team at Stripe is responsible for the core API gateway, developer
SDKs, infrastructure automation, and internal engineering tooling. We operate at
fintech scale — our uptime SLAs are 99.99%+ and our p99 latency targets are
measured in single-digit milliseconds.
  `.trim(),

  profile_text: `
## Alex Morgan — Senior Software Engineer

**Location:** San Francisco, CA
**Email:** alex.morgan@email.com
**LinkedIn:** linkedin.com/in/alexmorgan-swe

---

### Professional Summary

Senior Software Engineer with 6.5 years of experience building high-throughput
payment and infrastructure systems. Most recently at Stripe (3 years) where I
led a platform team that reduced API gateway latency by 40% and achieved
99.99% uptime across 10M+ daily transactions. Previously at Intercom building
real-time messaging infrastructure at 50M+ requests/day.

---

### Experience

**Stripe** — Senior Software Engineer, Platform
*March 2022 – Present (3 years)*

- Architected a new API gateway routing layer in TypeScript/Node.js that reduced p99
  latency from 48ms to 29ms (40% reduction) across all Stripe API endpoints,
  processing 10M+ transactions per day
- Led the PostgreSQL → Aurora migration for the core payments database, reducing
  infrastructure costs by 25% ($1.2M annually) while maintaining 99.99% uptime
- Built an internal Redis-backed distributed rate-limiter that eliminated 98% of
  fraudulent API abuse attempts without impacting legitimate traffic
- Mentored 4 junior engineers; 2 subsequently promoted to mid-level within 18 months
- Led incident response for 3 SEV-1 outages; authored postmortems adopted as
  team-wide templates
- Deployed all services on Kubernetes (EKS) with Terraform-managed AWS infrastructure

**Intercom** — Software Engineer II
*September 2020 – March 2022 (18 months)*

- Rebuilt the real-time message fan-out service in Node.js/TypeScript, scaling from
  5M to 50M+ requests per day with zero downtime migration
- Reduced PostgreSQL query time by 60% through index optimisation and query rewriting;
  eliminated 3 recurring production slow-query incidents
- Shipped a React-based internal dashboard for support ops that reduced average
  ticket resolution time by 22%
- Owned the Docker/Kubernetes deployment pipeline for 6 backend microservices

**Helio Finance** — Software Engineer
*July 2018 – September 2020 (2.25 years)*

- Built the core payments ledger API in Node.js with PostgreSQL, handling
  $500K+ in daily transaction volume
- Introduced Redis caching layer that cut average API response time from 120ms to 18ms
- Implemented PCI-DSS compliant data encryption and key rotation for all card data

---

### Skills

**Languages:** TypeScript, Node.js, Python, Go (beginner)
**Databases:** PostgreSQL, Redis, MySQL, DynamoDB
**Infrastructure:** AWS (ECS, EKS, RDS Aurora, ElastiCache, CloudWatch, IAM),
  Kubernetes, Docker, Terraform
**Frontend:** React, Next.js (internal tooling)
**Observability:** Datadog, PagerDuty, OpenTelemetry
**Domains:** Payments, fintech, distributed systems, API platform engineering

---

### Education

**University of California, Berkeley** — B.S. Computer Science, 2018
  `.trim(),
};

// ─────────────────────────────────────────────────────────────────────────────
// Fixture 2 — Sarah Chen — Senior Frontend Engineer at Figma
// Expected: moderate_match, arc: built_from_zero | scaled_it
// ─────────────────────────────────────────────────────────────────────────────

export const SARAH_CHEN_FIGMA: TestFixture = {
  jd_title: "Senior Frontend Engineer",
  company: "Figma",
  market: "US",

  jd_text: `
# Senior Frontend Engineer
**Figma · New York, NY or Remote**

Figma is looking for a Senior Frontend Engineer to join our Editor team. You'll
work on the core editing surface that millions of designers use every day — one
of the most technically complex frontend applications ever built. We need people
who care deeply about rendering performance, accessibility, and the craft of
building exceptional user interfaces.

## What you'll do

- Build and maintain performance-critical UI components in React and TypeScript
- Collaborate with designers to implement pixel-perfect, accessible experiences
- Profile and optimise rendering performance across our browser-based editor
- Contribute to and evolve our internal design system (used by 500+ engineers)
- Partner with backend engineers on API design and data-fetching architecture
- Write thorough unit and integration tests; champion code quality across the team

## Minimum qualifications

- 4+ years of professional frontend engineering experience
- Expert-level React and TypeScript skills; deep understanding of the React
  rendering model (reconciliation, fibers, concurrent features)
- Strong CSS fundamentals: layout algorithms, CSS-in-JS, animations, responsive design
- Experience profiling and optimising JavaScript/browser rendering performance
- Track record of shipping production features used by hundreds of thousands of users
- Strong communication skills; comfortable driving design and technical decisions

## Preferred qualifications

- Experience with Canvas API, WebGL, or other 2D/3D rendering primitives
- Contributions to or ownership of a design system at scale
- Accessibility expertise (WCAG 2.1 AA, ARIA, keyboard navigation)
- Experience with Figma's own plugin/widget API or similar plugin architectures
- Background in design tooling, creative tools, or graphics-intensive applications

## Why Figma

Figma's frontend codebase is one of the most technically ambitious in the industry.
We render a collaborative infinite canvas with thousands of nodes in real time —
the engineering problems here are genuinely hard and deeply rewarding.
  `.trim(),

  profile_text: `
## Sarah Chen — Frontend Engineer

**Location:** Brooklyn, NY
**Email:** sarah.chen@email.com

---

### Professional Summary

Frontend engineer with 4 years of total experience (3 years at Canva, 1 year at a
Series A startup). Specialised in React and TypeScript with a strong focus on
design systems, bundle optimisation, and accessible UI components. Shipped the
Canva design system adopted by 500+ engineers and reduced main bundle size by 35%.
One year below the 4-year minimum but brings direct design-tool experience and
measurable impact at product scale.

---

### Experience

**Canva** — Frontend Engineer II
*January 2022 – Present (3 years)*

- Led the design system working group that shipped Canva's internal component library
  (72 components, full Storybook docs), now used by 500+ engineers across 12 product teams
- Reduced the main JavaScript bundle size by 35% (from 2.8MB to 1.82MB) through
  code-splitting, tree-shaking, and lazy-loading — improving LCP by 1.2 seconds
- Profiled and fixed 6 rendering bottlenecks in the canvas editor (React DevTools
  Profiler + Lighthouse); eliminated 3 major jank sources on lower-powered devices
- Implemented WCAG 2.1 AA accessibility standards across the entire design system;
  led training sessions that raised team accessibility scores from 61% to 94%
- Mentored 3 junior frontend engineers; ran weekly code review office hours

**Stackr** — Frontend Engineer
*August 2021 – January 2022 (6 months)*

- Built the core product dashboard in React/TypeScript from scratch for a Series A
  project management startup (30K MAU at launch)
- Integrated Figma's design token pipeline to keep the app visually in sync with
  design assets without manual updates
- Wrote 87% test coverage across all UI components using React Testing Library and Vitest

**Internship — Thoughtworks** — Associate Consultant (Frontend Track)
*June 2020 – August 2021 (14 months)*

- Delivered frontend components for 3 client projects in React and Angular
- Introduced automated visual regression testing with Chromatic; reduced designer
  sign-off cycle from 5 days to 1 day

---

### Skills

**Core:** React, TypeScript, JavaScript (ES2022+), CSS / CSS-in-JS (styled-components,
  CSS Modules), HTML5
**Tooling:** Webpack, Vite, esbuild, Storybook, Chromatic, Vitest, Playwright
**Performance:** React Profiler, Lighthouse, Core Web Vitals, bundle analysis
**Accessibility:** WCAG 2.1 AA, ARIA, axe-core, keyboard navigation patterns
**Design systems:** Design tokens, Figma design-to-code pipelines, component APIs
**Graphics (learning):** Canvas API basics, introductory WebGL — actively studying
**Testing:** React Testing Library, Vitest, Playwright, visual regression

---

### Education

**Cornell University** — B.S. Information Science, 2021
  `.trim(),
};

// ─────────────────────────────────────────────────────────────────────────────
// Fixture 3 — Marcus Williams — ML Engineer at OpenAI
// Expected: weak_match, arc: domain_pivoter
// ─────────────────────────────────────────────────────────────────────────────

export const MARCUS_WILLIAMS_OPENAI: TestFixture = {
  jd_title: "ML Engineer",
  company: "OpenAI",
  market: "US",

  jd_text: `
# ML Engineer
**OpenAI · San Francisco, CA**

OpenAI is looking for ML Engineers to join our Foundations team. You'll work on
pre-training, fine-tuning, and evaluating large language models — from data
pipeline engineering to distributed training infrastructure to model evaluation
frameworks. This role sits at the intersection of research and engineering: you'll
partner directly with research scientists to implement and scale their ideas.

## What you'll do

- Design and implement efficient data processing pipelines for large-scale model training
- Build and maintain distributed training infrastructure using PyTorch and CUDA
- Fine-tune and evaluate large language models using RLHF, DPO, and instruction tuning
- Implement custom CUDA kernels and optimise training throughput on H100 clusters
- Build automated model evaluation frameworks (evals) and regression tracking systems
- Collaborate with research scientists to translate research ideas into production code

## Minimum qualifications

- 3+ years of professional software engineering experience
- Strong Python programming skills with experience in scientific computing
- Deep hands-on experience with PyTorch or TensorFlow for model training
- Understanding of ML fundamentals: backpropagation, optimisers, regularisation,
  transformer architectures
- Experience running distributed training jobs (multi-GPU or multi-node)
- Familiarity with MLOps tooling: experiment tracking, model registries, CI/CD for ML

## Preferred qualifications

- Experience with CUDA C++ or Triton for custom kernel development
- Prior work on LLM pre-training, RLHF, or instruction tuning at scale
- Contributions to open-source ML frameworks (PyTorch, HuggingFace Transformers, etc.)
- Experience with JAX or other differentiable programming frameworks
- Publications or technical writing in the ML space

## About the role

This is a deeply technical role at the frontier of AI development. Candidates
without hands-on ML experience will find the ramp-up steep. We strongly prefer
candidates with prior LLM or large-scale model training experience.
  `.trim(),

  profile_text: `
## Marcus Williams — Senior Software Engineer

**Location:** Austin, TX
**Email:** marcus.williams@email.com

---

### Professional Summary

Senior Java/Spring backend engineer with 8 years of experience building
enterprise-grade APIs, microservices, and data pipelines in the financial services
and healthcare industries. Strong track record of system reliability and delivery.
Career-transitioning toward ML engineering: completed Andrew Ng's Deep Learning
Specialization (Coursera, 2024) and written several Python data processing scripts.
No professional ML experience to date.

---

### Experience

**JPMorgan Chase** — Senior Software Engineer
*June 2020 – Present (4.75 years)*

- Led a 6-person team building a real-time transaction fraud detection service
  in Java/Spring Boot, processing 2M+ events per day with <5ms p99 latency
- Designed and implemented a Kafka-based event streaming pipeline that reduced
  data ingestion latency from 8 seconds to 340ms
- Migrated 14 legacy SOAP services to REST APIs; reduced integration complexity
  and cut time-to-onboard new downstream consumers from 3 weeks to 2 days
- Conducted 200+ code reviews and led bi-weekly architecture review sessions
  for the broader 40-person engineering org

**Optum (UnitedHealth Group)** — Software Engineer II
*March 2017 – June 2020 (3.25 years)*

- Built a claims adjudication engine in Java/Spring Hibernate handling $120M+
  in annual claims volume with 99.97% uptime
- Implemented HIPAA-compliant audit logging and data masking for all PHI fields
  across 7 microservices
- Wrote 3 Python scripts for ETL batch jobs (pandas/CSV); first Python exposure

**Cognizant** — Software Engineer
*July 2015 – March 2017 (1.75 years)*

- Developed RESTful API endpoints in Java/Spring MVC for a retail banking portal
- Maintained Oracle SQL stored procedures and PL/SQL data transformation jobs

---

### Skills

**Languages:** Java (8 years, expert), Spring Boot, Spring MVC, Hibernate;
  Python (beginner — scripts only, no ML frameworks used professionally)
**Databases:** Oracle, PostgreSQL, MySQL
**Messaging:** Apache Kafka, RabbitMQ
**Infrastructure:** Docker, Jenkins CI/CD, on-premise Linux servers
**Testing:** JUnit 5, Mockito, integration tests
**ML (self-study only):** Completed Andrew Ng Deep Learning Specialization on
  Coursera (2024); built toy neural nets in Jupyter notebooks using NumPy;
  no PyTorch, TensorFlow, or GPU experience; zero LLM or transformer experience

---

### Education

**University of Texas at Austin** — B.S. Computer Science, 2015

### Certifications

- AWS Certified Solutions Architect — Associate (2023)
- Oracle Certified Professional Java SE 11 (2021)
  `.trim(),
};
