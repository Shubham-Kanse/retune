// Onboarding V2 — Test Fixtures
//
// Sample resume + expected outputs for use across stage tests.

import type { ExtractionSchema, InferenceResult } from "../types";

export const SAMPLE_RESUME_TEXT = `
SHUBHAM KANSE
Dublin, Ireland | shubham@email.com | linkedin.com/in/shubham | github.com/shubham

EXPERIENCE

Senior Software Engineer — Fiserv (2022–Present)
• Designed and built real-time payment processing pipeline handling 5M transactions/day
• Led migration of legacy SOAP services to REST/gRPC microservices architecture
• Reduced API response latency by 40% through Redis caching and query optimization
• Mentored team of 4 junior engineers on distributed systems patterns

Software Engineer — Accenture (2020–2022)
• Built customer-facing React dashboard for financial analytics platform
• Implemented CI/CD pipeline reducing deployment time from 2 hours to 15 minutes
• Developed Python ETL pipelines processing 500GB daily data loads

EDUCATION

MSc Computer Science — Trinity College Dublin (2018–2020)
BSc Information Technology — University of Mumbai (2014–2018)

SKILLS
Python, Java, TypeScript, Go, React, Node.js, PostgreSQL, Redis, Kafka, AWS, Docker, Kubernetes, gRPC, System Design, Microservices

CERTIFICATIONS
AWS Solutions Architect Associate (2023)
`.trim();

export const EXPECTED_EXTRACTION: ExtractionSchema = {
  identity: {
    full_name: "Shubham Kanse",
    email: "shubham@email.com",
    phone: null,
    location: "Dublin, Ireland",
    linkedin_url: "linkedin.com/in/shubham",
    github_url: "github.com/shubham",
    portfolio_url: null,
  },
  experience: [
    {
      title: "Senior Software Engineer",
      company: "Fiserv",
      location: null,
      start_date: "2022",
      end_date: null,
      is_current: true,
      bullets: [
        "Designed and built real-time payment processing pipeline handling 5M transactions/day",
        "Led migration of legacy SOAP services to REST/gRPC microservices architecture",
        "Reduced API response latency by 40% through Redis caching and query optimization",
        "Mentored team of 4 junior engineers on distributed systems patterns",
      ],
    },
    {
      title: "Software Engineer",
      company: "Accenture",
      location: null,
      start_date: "2020",
      end_date: "2022",
      is_current: false,
      bullets: [
        "Built customer-facing React dashboard for financial analytics platform",
        "Implemented CI/CD pipeline reducing deployment time from 2 hours to 15 minutes",
        "Developed Python ETL pipelines processing 500GB daily data loads",
      ],
    },
  ],
  education: [
    {
      institution: "Trinity College Dublin",
      degree: "MSc",
      field: "Computer Science",
      start_date: "2018",
      end_date: "2020",
      gpa: null,
      honours: null,
    },
    {
      institution: "University of Mumbai",
      degree: "BSc",
      field: "Information Technology",
      start_date: "2014",
      end_date: "2018",
      gpa: null,
      honours: null,
    },
  ],
  skills: {
    raw_list: [
      "Python",
      "Java",
      "TypeScript",
      "Go",
      "React",
      "Node.js",
      "PostgreSQL",
      "Redis",
      "Kafka",
      "AWS",
      "Docker",
      "Kubernetes",
      "gRPC",
      "System Design",
      "Microservices",
    ],
    grouped: {},
  },
  projects: [],
  certifications: [{ name: "AWS Solutions Architect Associate", issuer: "AWS", date: "2023" }],
  languages: [],
  awards: [],
  publications: [],
  volunteering: [],
  extraction_confidence: "high",
  extraction_notes: "Clean, well-structured resume with all major sections present.",
};

export const EXPECTED_INFERENCE: InferenceResult = {
  industry: "Fintech",
  industry_confidence: "high",
  industry_note:
    "Payment processing at Fiserv and financial analytics at Accenture indicate fintech focus.",
  industry_ambiguous: false,
  industry_candidates: null,
  role_family: "Backend Engineering",
  role_family_confidence: "high",
  role_family_note: "Primary work is API design, microservices, and distributed systems.",
  role_family_ambiguous: false,
  role_family_candidates: null,
  seniority: "Senior IC",
  seniority_confidence: "high",
  seniority_note: "3.5 years experience with Senior title and mentoring responsibilities.",
  seniority_ambiguous: false,
  career_transition_detected: false,
  transition_note: null,
  new_grad: false,
  work_pattern: "permanent",
};

export const EXPECTED_SUMMARY =
  "Thanks for sharing your resume. You're a backend engineer with around 3.5 years of experience, primarily in fintech. You've worked at Fiserv and Accenture, with a strong focus on payment processing and microservices architecture. Your work on the 5M transactions/day pipeline and the 40% latency reduction stand out.";
