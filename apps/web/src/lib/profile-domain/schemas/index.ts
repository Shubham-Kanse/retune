import { z } from "zod";
import { EDUCATION_STATUSES, EXPERIENCE_LEVELS } from "../enums";

export const skillSchema = z.object({
  name: z.string().max(100),
  evidence: z.string().max(500).optional(),
  years: z.number().min(0).max(80).optional(),
});

export const experienceSchema = z.object({
  company: z.string().max(200),
  title: z.string().max(200),
  titleForResume: z.string().max(200).optional(),
  startDate: z.string().max(20).optional(),
  endDate: z.string().max(20).optional(),
  description: z.string().max(5000).optional(),
  metrics: z.array(z.object({
    metric: z.string().max(200).optional(),
    value: z.string().max(200).optional(),
    context: z.string().max(500).optional(),
    direction: z.string().max(100).optional(),
  })).max(30).optional(),
  tools: z.array(z.string().max(100)).max(100).optional(),
  teamSize: z.number().min(0).max(100000).optional(),
  client: z.string().max(200).optional(),
  industry: z.string().max(200).optional(),
});

export const educationSchema = z.object({
  degree: z.string().max(200),
  institution: z.string().max(200),
  startDate: z.string().max(20).optional(),
  endDate: z.string().max(20).optional(),
  status: z.enum(EDUCATION_STATUSES).optional(),
  coursework: z.array(z.string().max(200)).max(100).optional(),
  capstone: z.string().max(500).optional(),
});

export const projectSchema = z.object({
  name: z.string().max(200).optional(),
  type: z.string().max(100).optional(),
  year: z.number().min(1900).max(2200).optional(),
  description: z.string().max(5000).optional(),
  technologies: z.array(z.string().max(100)).max(100).optional(),
  role: z.string().max(200).optional(),
  keyMetric: z.string().max(500).optional(),
  context: z.string().max(500).optional(),
  tools: z.array(z.string().max(100)).max(100).optional(),
  outcome: z.string().max(500).optional(),
});

export const profileSchema = z.object({
  fullName: z.string().max(100).default(""),
  email: z.string().email().or(z.literal("")) .default(""),
  phone: z.string().max(30).nullable().optional(),
  linkedin: z.string().max(200).nullable().optional(),
  location: z.string().max(200).default(""),
  visaStatus: z.string().max(100).nullable().optional(),
  currentTitle: z.string().max(100).nullable().optional(),
  relocationPreferences: z.array(z.string().max(100)).max(20).default([]),
  targetRoles: z.array(z.string().max(100)).max(20).default([]),
  experienceLevel: z.enum(EXPERIENCE_LEVELS).default("mid"),
  experience: z.array(experienceSchema).max(30).default([]),
  education: z.array(educationSchema).max(20).default([]),
  certifications: z.array(z.string().max(200)).max(50).default([]),
  projects: z.array(projectSchema).max(50).default([]),
  skillsTier1: z.array(skillSchema).max(50).default([]),
  skillsTier2: z.array(skillSchema).max(50).default([]),
  skillsTier3: z.array(skillSchema).max(50).default([]),
  voiceNotes: z.string().max(5000).nullable().optional(),
  summary: z.string().max(5000).optional(),
  profileMarkdown: z.string().max(20000).optional(),
});

export const patchProfileSchema = profileSchema.partial();

export const openAiProfileJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    fullName: { type: "string" },
    email: { type: "string" },
    phone: { type: "string" },
    linkedin: { type: "string" },
    location: { type: "string" },
    visaStatus: { type: "string" },
    currentTitle: { type: "string" },
    experienceLevel: { type: "string", enum: [...EXPERIENCE_LEVELS] },
    relocationPreferences: { type: "array", items: { type: "string" } },
    targetRoles: { type: "array", items: { type: "string" } },
    experience: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          company: { type: "string" },
          title: { type: "string" },
          titleForResume: { type: "string" },
          startDate: { type: "string" },
          endDate: { type: "string" },
          description: { type: "string" },
          metrics: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                metric: { type: "string" },
                value: { type: "string" },
                context: { type: "string" },
                direction: { type: "string" },
              },
              required: ["metric", "value", "context", "direction"],
            },
          },
          tools: { type: "array", items: { type: "string" } },
          teamSize: { type: "number" },
          client: { type: "string" },
          industry: { type: "string" },
        },
        required: [
          "company",
          "title",
          "titleForResume",
          "startDate",
          "endDate",
          "description",
          "metrics",
          "tools",
          "teamSize",
          "client",
          "industry",
        ],
      },
    },
    education: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          degree: { type: "string" },
          institution: { type: "string" },
          startDate: { type: "string" },
          endDate: { type: "string" },
          status: { type: "string" },
          coursework: { type: "array", items: { type: "string" } },
          capstone: { type: "string" },
        },
        required: ["degree", "institution", "startDate", "endDate", "status", "coursework", "capstone"],
      },
    },
    certifications: { type: "array", items: { type: "string" } },
    projects: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          type: { type: "string" },
          year: { type: "number" },
          description: { type: "string" },
          technologies: { type: "array", items: { type: "string" } },
          role: { type: "string" },
          keyMetric: { type: "string" },
        },
        required: ["name", "type", "year", "description", "technologies", "role", "keyMetric"],
      },
    },
    skillsTier1: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          evidence: { type: "string" },
          years: { type: "number" },
        },
        required: ["name", "evidence", "years"],
      },
    },
    skillsTier2: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          evidence: { type: "string" },
          years: { type: "number" },
        },
        required: ["name", "evidence", "years"],
      },
    },
    skillsTier3: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          evidence: { type: "string" },
          years: { type: "number" },
        },
        required: ["name", "evidence", "years"],
      },
    },
    summary: { type: "string" },
    voiceNotes: { type: "string" },
  },
  required: [
    "fullName",
    "email",
    "phone",
    "linkedin",
    "location",
    "visaStatus",
    "currentTitle",
    "experienceLevel",
    "relocationPreferences",
    "targetRoles",
    "experience",
    "education",
    "certifications",
    "projects",
    "skillsTier1",
    "skillsTier2",
    "skillsTier3",
    "summary",
    "voiceNotes",
  ],
} as const;
