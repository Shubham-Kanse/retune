// Onboarding V2 — Stage 4: Summary Presentation & User Confirmation

import { callLLM } from "../llm/calls";
import { SUMMARY_GENERATION_SYSTEM_PROMPT } from "../llm/prompts";
import type { ExtractionSchema, OnboardingV2Session } from "../types";

export interface ExtractionCard {
  section: string;
  title: string;
  items: Array<{ label: string; value: string }>;
}

export interface AmbiguityQuestion {
  field: "role_family" | "seniority";
  question: string;
  options: string[];
}

export interface SummaryPresentation {
  summaryMessage: string;
  extractionCards: ExtractionCard[];
  ambiguityQuestions: AmbiguityQuestion[];
  flags: {
    careerTransition: boolean;
    newGrad: boolean;
    lowExtractionQuality: boolean;
    inferenceFailed: boolean;
    roleAmbiguous: boolean;
    seniorityAmbiguous: boolean;
  };
}

export async function generateSummaryPresentation(
  session: OnboardingV2Session,
): Promise<SummaryPresentation> {
  const flags = {
    careerTransition: session.inference.career_transition_detected,
    newGrad: session.inference.new_grad,
    lowExtractionQuality: session.extraction.extraction_quality === "low",
    inferenceFailed: !session.inference.role_family,
    roleAmbiguous: session.inference.role_family_ambiguous,
    seniorityAmbiguous: session.inference.seniority_ambiguous,
  };

  const summaryMessage = await generateSummaryMessage(session, flags);
  const extractionCards = buildExtractionCards(session.dual_extraction.pure_extraction);
  const ambiguityQuestions = buildAmbiguityQuestions(session);

  return { summaryMessage, extractionCards, ambiguityQuestions, flags };
}

async function generateSummaryMessage(
  session: OnboardingV2Session,
  flags: SummaryPresentation["flags"],
): Promise<string> {
  try {
    const result = await callLLM({
      systemPrompt: SUMMARY_GENERATION_SYSTEM_PROMPT,
      userMessage: [
        `Structured extraction: ${JSON.stringify(session.dual_extraction.pure_extraction)}`,
        `Professional narrative: ${session.dual_extraction.inferred_summary || "Not available"}`,
        `Inferred industry: ${session.inference.industry} (confidence: ${session.inference.industry_confidence})`,
        `Inferred role family: ${session.inference.role_family} (confidence: ${session.inference.role_family_confidence})`,
        `Inferred seniority: ${session.inference.seniority} (confidence: ${session.inference.seniority_confidence})`,
        `Extraction quality: ${session.extraction.extraction_quality}`,
        `Flags: career_transition_detected=${flags.careerTransition}, new_grad=${flags.newGrad}, role_family_ambiguous=${flags.roleAmbiguous}, seniority_ambiguous=${flags.seniorityAmbiguous}, industry_ambiguous=${session.inference.industry_ambiguous}`,
      ].join("\n"),
      model: "fast",
      temperature: 0.4,
      maxTokens: 256,
      stage: 4,
      callName: "summary_generation",
    });
    return result.content.trim();
  } catch {
    return buildTemplateSummary(session);
  }
}

function buildTemplateSummary(session: OnboardingV2Session): string {
  const ext = session.dual_extraction.pure_extraction;
  if (!ext)
    return "Thanks for sharing your resume. I've read through it — does this look right to you?";

  const companies = ext.experience
    ?.slice(0, 2)
    .map((e) => e.company)
    .filter(Boolean)
    .join(" and ");
  const skills = ext.skills?.raw_list?.slice(0, 3).join(", ");

  if (session.inference.new_grad) {
    return `Thanks for sharing your resume. It looks like you're earlier in your career — I've pulled in your projects and education since that's where most of your story is right now. Let's make sure I have the details right.`;
  }

  let msg =
    "Thanks for sharing your resume. I've read through it and pulled out your experience, skills, and education.";
  if (companies) msg += ` You've worked at ${companies}.`;
  if (skills) msg += ` Your technical focus appears to be around ${skills}.`;
  msg += " Does this look right to you?";
  return msg;
}

function buildExtractionCards(extraction: ExtractionSchema | null): ExtractionCard[] {
  if (!extraction) return [];
  const cards: ExtractionCard[] = [];
  const r = extraction as unknown as Record<string, unknown>;

  // Contact — check nested identity first, fall back to top-level fields (handles both old and new session formats)
  const identity = (extraction.identity ?? {}) as Record<string, string | null | undefined>;
  const isRealUrl = (v: string) => !!v && v !== "null" && v.length > 4 && !["linkedin", "github", "portfolio", "website"].includes(v.toLowerCase());
  const get = (nested: string | null | undefined, ...fallbacks: (string | null | undefined)[]) =>
    [nested, ...fallbacks].find(v => v && v !== "null") || "";
  const contactItems = [
    { label: "Name", value: get(identity.full_name, r.full_name as string, r.name as string) },
    { label: "Email", value: get(identity.email, r.email as string) },
    { label: "Phone", value: get(identity.phone, r.phone_number as string, r.phone as string) },
    { label: "Location", value: get(identity.location, r.location as string) },
    { label: "LinkedIn", value: isRealUrl(get(identity.linkedin_url, r.linkedin_url as string)) ? get(identity.linkedin_url, r.linkedin_url as string) : "" },
    { label: "GitHub", value: isRealUrl(get(identity.github_url, r.github_url as string)) ? get(identity.github_url, r.github_url as string) : "" },
    { label: "Portfolio", value: isRealUrl(get(identity.portfolio_url, r.portfolio_url as string)) ? get(identity.portfolio_url, r.portfolio_url as string) : "" },
  ].filter((i) => i.value);
  if (contactItems.length) cards.push({ section: "identity", title: "Contact", items: contactItems });

  // Summary
  const summary = (r.professional_summary ?? r.summary) as string | null | undefined;
  if (summary) {
    cards.push({ section: "summary", title: "Professional summary", items: [{ label: "", value: summary }] });
  }

  // Experience — handle both normalized (title/company/bullets) and raw (job_title/description)
  const expArray = (extraction.experience ?? (r.work_experience as typeof extraction.experience) ?? []) as unknown as Record<string, unknown>[];
  if (expArray.length) {
    cards.push({
      section: "experience",
      title: `Experience — ${expArray.length} role${expArray.length > 1 ? "s" : ""}`,
      items: expArray.flatMap((e) => {
        const title = (e.title ?? e.job_title ?? e.role ?? "Role") as string;
        const company = (e.company ?? e.employer ?? "Company") as string;
        const start = (e.start_date ?? "?") as string;
        const end = (e.end_date ?? (e.is_current ? "Present" : "?")) as string;
        const header = { label: `${title} · ${company}`, value: `${start} – ${end}` };
        const rawBullets = Array.isArray(e.bullets) ? e.bullets as string[]
          : typeof e.description === "string"
            ? (e.description as string).split("\n")
                .map((s: string) => s.replace(/^[\s•\-\t]+/, "").trim())
                .filter((s: string) => s.length > 15 && !s.endsWith(":") && !/^[A-Z][A-Za-z\s&/]+$/.test(s))
            : [];
        const bullets = rawBullets.map((b: string) => ({ label: "•", value: b }));
        return [header, ...bullets];
      }),
    });
  }

  // Education
  const eduArray = (extraction.education ?? []) as unknown as Record<string, unknown>[];
  if (eduArray.length) {
    cards.push({
      section: "education",
      title: "Education",
      items: eduArray.map((e) => ({
        label: `${(e.degree ?? "") as string}${e.field ?? e.field_of_study ? ` in ${(e.field ?? e.field_of_study) as string}` : ""}`.trim() || "Degree",
        value: `${(e.institution ?? e.school ?? "") as string}${e.end_date ? ` · ${e.end_date as string}` : ""}`.trim(),
      })),
    });
  }

  // Skills
  const skillsList = extraction.skills?.raw_list ?? (Array.isArray(r.skills) ? r.skills as string[] : []);
  if (skillsList.length) {
    cards.push({
      section: "skills",
      title: `Skills — ${skillsList.length} found`,
      items: [{ label: "", value: skillsList.join(" · ") }],
    });
  }

  // Projects
  const projArray = (extraction.projects ?? (r.projects as typeof extraction.projects) ?? []) as unknown as Record<string, unknown>[];
  if (projArray.length) {
    cards.push({
      section: "projects",
      title: `Projects — ${projArray.length}`,
      items: projArray.map((p) => ({
        label: (p.name ?? p.title ?? "Project") as string,
        value: [
          (p.description ?? "") as string,
          Array.isArray(p.technologies) && p.technologies.length ? `Tech: ${(p.technologies as string[]).join(", ")}` : "",
        ].filter(Boolean).join("\n"),
      })),
    });
  }

  // Certifications
  const certArray = (extraction.certifications ?? []) as unknown as Record<string, unknown>[];
  if (certArray.length) {
    cards.push({
      section: "certifications",
      title: "Certifications",
      items: certArray.map((c) => ({
        label: (c.name ?? "Cert") as string,
        value: [(c.issuer as string), (c.date as string)].filter(Boolean).join(" · "),
      })),
    });
  }

  return cards;
}

function buildAmbiguityQuestions(session: OnboardingV2Session): AmbiguityQuestion[] {
  const questions: AmbiguityQuestion[] = [];

  if (session.inference.role_family_ambiguous && session.inference.role_family_candidates?.length) {
    questions.push({
      field: "role_family",
      question: `It looks like you could be positioned as either a ${session.inference.role_family_candidates.join(" or a ")} — which feels more accurate to how you see yourself?`,
      options: session.inference.role_family_candidates,
    });
  }

  if (session.inference.seniority_ambiguous && session.inference.seniority) {
    questions.push({
      field: "seniority",
      question: `I've estimated you're at ${session.inference.seniority} level — does that feel right, or would you describe yourself differently?`,
      options: [session.inference.seniority, "I'd describe it differently"],
    });
  }

  return questions;
}
