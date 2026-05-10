import { withAuth } from "@/lib/api-handler";
import { AgentError, BillingError, NotFoundError, ValidationError } from "@/lib/errors";
import { type ResumeDocument, type ToolDefinition, authenticateVoice, getModels, getProvider } from "@retune/agent/web";
import { claimRefinementAttempt } from "@retune/billing";
import { applications, db } from "@retune/db";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

const LIMITS = {
  maxSelection: 2000,
  maxInstruction: 500,
  maxParagraph: 4000,
};
const MAX_REFINEMENT_HISTORY = 50;

// ── Selection classification ───────────────────────────────────────────────

type SelectionKind =
  | "single_action_verb"
  | "weak_phrase"
  | "filler_qualifier"
  | "short_phrase"
  | "metric_fragment"
  | "full_bullet"
  | "multi_line"
  | "generic";

const WEAK_PHRASES = [
  "responsible for",
  "worked on",
  "helped with",
  "assisted with",
  "assisted in",
  "involved in",
  "part of",
  "contributed to",
  "participated in",
  "supported",
  "helped",
  "worked with",
  "tasked with",
  "assigned to",
];

const FILLER_QUALIFIERS = new Set([
  "key",
  "major",
  "significant",
  "various",
  "several",
  "multiple",
  "many",
  "numerous",
  "important",
  "critical",
  "essential",
  "main",
  "primary",
  "different",
  "certain",
  "relevant",
  "some",
]);

function classifySelection(
  selectedText: string,
  before: string,
  after: string,
  paragraphText: string,
): SelectionKind {
  const sel = selectedText.trim();
  const words = sel.split(/\s+/).filter(Boolean);
  const selLower = sel.toLowerCase();
  const paraWords = paragraphText.trim().split(/\s+/).filter(Boolean);

  if (/\n/.test(sel)) return "multi_line";

  // Metric fragment — check before full_bullet so "$2.4m" in a short line isn't misclassified
  if (/^[\$£€]?[\d,.]+(k|m|b|%)?$/i.test(sel)) return "metric_fragment";

  // Weak phrase — check before full_bullet so "responsible for" isn't swallowed
  if (WEAK_PHRASES.some((p) => selLower.includes(p))) return "weak_phrase";

  // Single-word checks — must come before full_bullet so a verb/filler at bullet start
  // in a short paragraph isn't misclassified as full_bullet
  if (words.length === 1) {
    const trimmedBefore = before.trim();
    if (trimmedBefore === "" || /[•\-–—]$/.test(trimmedBefore)) {
      return "single_action_verb";
    }
    if (FILLER_QUALIFIERS.has(selLower)) return "filler_qualifier";
    return "short_phrase";
  }

  // Nearly the full paragraph — only applies to multi-word selections
  if (words.length >= Math.max(paraWords.length - 2, 2)) return "full_bullet";

  if (words.length <= 6) {
    if (WEAK_PHRASES.some((p) => selLower.startsWith(p))) return "weak_phrase";
    return "short_phrase";
  }

  return "generic";
}

// ── Kind-specific guidance ────────────────────────────────────────────────

const KIND_GUIDANCE: Record<SelectionKind, string> = {
  single_action_verb: `
The selected text is a single action verb at the start of a bullet point.
Replace it with a stronger, more precise verb that better signals ownership, seniority, and impact.
Match the tense of the original (usually past tense for resume bullets).
Output: exactly one word with matching capitalization.
Strong verb examples by domain:
  Engineering: Architected, Engineered, Implemented, Automated, Optimized, Deployed, Refactored, Spearheaded
  Leadership:  Directed, Orchestrated, Championed, Mentored, Established, Launched, Scaled
  Analysis:    Synthesized, Uncovered, Modeled, Drove, Identified, Prioritized, Validated
  Product:     Shipped, Defined, Roadmapped, Piloted, Iterated, Positioned
`.trim(),

  weak_phrase: `
The selected text is a weak, passive, or vague phrase.
Replace it with a direct, active, ownership-conveying construction.
Examples:
  "responsible for managing" → "managed"
  "helped with the development" → "developed"
  "worked on a team that built" → "built"
  "was involved in" → the actual action verb
Keep the replacement as short as possible while being precise.
Maintain grammatical fit with the text before and after it.
`.trim(),

  filler_qualifier: `
The selected text is a vague filler qualifier.
Replace it with a stronger, specific qualifier — or return an empty string if the sentence is better without it.
Examples:
  "key" → "mission-critical" / "revenue-driving" / "high-impact"
  "major" → "company-wide" / "enterprise-level" / "cross-functional"
  "various" or "several" → remove (output empty string) unless count is known
Output: 1–3 words, or empty string for removal.
`.trim(),

  short_phrase: `
The selected text is a short phrase within a larger sentence.
Improve it: make it more concrete, specific, and aligned with the role.
Preserve grammatical flow with the surrounding text — your output must slot naturally between the before and after text.
Use precise industry terminology matching the job title.
Do not change semantic meaning unless instructed.
`.trim(),

  metric_fragment: `
The selected text is a metric (number, percentage, currency amount).
Do NOT change or fabricate the number itself.
If the user's instruction asks to reframe or contextualize the metric, do so in minimal words.
Output: the metric, optionally with 1–3 words of framing if explicitly instructed.
`.trim(),

  full_bullet: `
The selected text is an entire bullet point or sentence.
Rewrite it using the best-fit bullet structure:
  CAR: [Challenge] + [Action] + [Result]
  PAR: [Problem] + [Action] + [Result]
  XYZ: Accomplished X by doing Y, resulting in Z
Rules:
  - Front-load with the most impressive element (result or strong action verb — never setup)
  - Start with a strong past-tense action verb
  - Quantify impact wherever possible; use [X]% / [N] / $[X]K as placeholders if metrics are absent
  - Keep to one line (under 25 words) unless the original is multi-line
  - Eliminate hedge words: "helped", "assisted", "worked on", "was responsible for"
  - Use exact terminology from the role context for ATS alignment
`.trim(),

  multi_line: `
The selected text contains multiple bullet points.
Rewrite all of them. Rules:
  - Each bullet starts with a different strong past-tense action verb
  - Parallel grammatical structure across all bullets (verb + object + result)
  - Quantify wherever possible; use [X] placeholders for missing metrics
  - Return bullets separated by newlines — no bullet characters (•, -, *)
  - Match the count: same number of output bullets as input bullets
`.trim(),

  generic: `
Improve the selected text to be more concise, specific, and impactful.
Use precise language; remove vague superlatives.
Align terminology with the job title and company.
Preserve grammatical structure relative to surrounding text.
`.trim(),
};

// ── Prompt assembly ───────────────────────────────────────────────────────

function buildPrompt(
  kind: SelectionKind,
  selectedText: string,
  before: string,
  after: string,
  paragraphText: string,
  roleTitle: string,
  companyName: string,
  userInstruction: string,
  isAutoEnhance: boolean,
  documentType: "resume" | "cover_letter",
): string {
  const lines: string[] = [];

  lines.push(`Document type: ${documentType === "cover_letter" ? "Cover Letter" : "Resume"}`);
  lines.push(`Role: ${roleTitle} at ${companyName}`);
  lines.push(
    isAutoEnhance
      ? "Task: AI-enhance the selected text for maximum impact and ATS optimization."
      : `User instruction: "${userInstruction}"`,
  );
  lines.push("");

  if (paragraphText.trim()) {
    lines.push(`Full line context: "${paragraphText.trim()}"`);
  }
  if (before.trim()) lines.push(`Text before selection: "${before.trim()}"`);
  lines.push(`Selected text to replace: "${selectedText.trim()}"`);
  if (after.trim()) lines.push(`Text after selection: "${after.trim()}"`);

  lines.push("");
  lines.push("Selection type guidance:");
  lines.push(KIND_GUIDANCE[kind]);

  lines.push("");
  lines.push("Output rules (MANDATORY):");
  lines.push("- Call the output_replacement tool with your answer.");
  lines.push("- The replacement field must contain ONLY the text that replaces the selection.");
  lines.push("- No explanations, no preamble, no questions, no markdown.");
  lines.push(
    "- Never refuse or ask for more context — always produce the best possible replacement with what you have.",
  );
  lines.push(
    `- The result must read naturally as: "${before.trim()} [YOUR OUTPUT] ${after.trim()}"`,
  );

  return lines.join("\n");
}

// ── Tool schema for forced structured output ──────────────────────────────

const OUTPUT_TOOL: ToolDefinition = {
  name: "output_replacement",
  description:
    "Output the exact replacement text that will substitute the user's selected resume text. Always call this tool — never respond in plain text.",
  inputSchema: {
    type: "object" as const,
    properties: {
      replacement: {
        type: "string",
        description:
          "The replacement text. Must be ONLY the text that substitutes the selection — no explanations, no quotes, no bullet characters.",
      },
    },
    required: ["replacement"],
  },
};

const SYSTEM_PROMPT =
  "You are an expert resume and cover letter writer. Your ONLY job is to call the output_replacement tool with the best possible replacement text. " +
  "You MUST always call the tool — never respond in prose, never ask questions, never refuse. " +
  "Work with the context provided and produce the highest-quality replacement possible.";

const AUTO_ENHANCE_INSTRUCTION =
  "AI-enhance this selection for maximum impact and ATS optimization.";

// ── Post-processing guardrails ────────────────────────────────────────────

function sanitizeReplacement(text: string): string {
  return (
    text
      .trim()
      // Strip wrapping quotes the model might add
      .replace(/^["'`"']+|["'`"']+$/g, "")
      // Strip leading bullet characters
      .replace(/^[\s•\-–—*]+/, "")
      .trim()
  );
}

function looksLikePromptDump(text: string): boolean {
  const lower = text.toLowerCase();
  const markers = [
    "i'm ready to help optimize",
    "to provide the best rewrite",
    "i don't see the complete context yet",
    "however, i don't see",
    "the full bullet point",
  ];
  return markers.some((m) => lower.includes(m));
}

// ── Route handler ─────────────────────────────────────────────────────────

export const POST = withAuth(async (request, session) => {
  const body = await request.json().catch(() => {
    throw new ValidationError("Invalid JSON body");
  });

  const applicationId = typeof body.applicationId === "string" ? body.applicationId : "";
  const selectedText = typeof body.selectedText === "string" ? body.selectedText.trim() : "";
  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
  const paragraphText = typeof body.paragraphText === "string" ? body.paragraphText : "";
  const before = typeof body.before === "string" ? body.before : "";
  const after = typeof body.after === "string" ? body.after : "";
  const documentType =
    body.documentType === "cover_letter" ? ("cover_letter" as const) : ("resume" as const);

  if (!applicationId) throw new ValidationError("applicationId is required");
  if (!selectedText) throw new ValidationError("selectedText is required");
  if (!instruction) throw new ValidationError("instruction is required");
  if (selectedText.length > LIMITS.maxSelection) throw new ValidationError("selectedText too long");
  if (instruction.length > LIMITS.maxInstruction) throw new ValidationError("instruction too long");
  if (
    paragraphText.length > LIMITS.maxParagraph ||
    before.length > LIMITS.maxParagraph ||
    after.length > LIMITS.maxParagraph
  ) {
    throw new ValidationError("Context fields too long");
  }

  const appRows = await db
    .select({
      id: applications.id,
      roleTitle: applications.roleTitle,
      companyName: applications.companyName,
      refinementHistory: applications.refinementHistory,
    })
    .from(applications)
    .where(and(eq(applications.id, applicationId), eq(applications.userId, session.userId)))
    .limit(1);
  const app = appRows[0];
  if (!app) throw new NotFoundError("Application not found");

  const rateCheck = await claimRefinementAttempt(session.userId, applicationId);
  if (!rateCheck.allowed) {
    throw new BillingError(
      rateCheck.reason === "refinement_rate_limited"
        ? "Too many refinements in a short period. Please wait a moment."
        : "Refinement limit reached for this application or insufficient credits. Upgrade to continue.",
    );
  }

  const isAutoEnhance = instruction === AUTO_ENHANCE_INSTRUCTION;
  const kind = classifySelection(selectedText, before, after, paragraphText);

  const userMessage = buildPrompt(
    kind,
    selectedText,
    before,
    after,
    paragraphText,
    app.roleTitle,
    app.companyName,
    instruction,
    isAutoEnhance,
    documentType,
  );

  let replacementText = "";
  try {
    const input = await getProvider().createMessageWithTool<{ replacement?: string }>(
      "refine-selection",
      {
        model: getModels().fast,
        maxTokens: 600,
        system: [{ type: "text", text: SYSTEM_PROMPT, cacheHint: true }],
        tools: [OUTPUT_TOOL],
        forceTool: "output_replacement",
        messages: [{ role: "user", content: userMessage }],
      },
      "output_replacement",
    );
    replacementText = sanitizeReplacement(input.replacement ?? "");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI service unavailable";
    throw new AgentError(`Selection refinement failed: ${msg}`);
  }

  if (!replacementText && kind !== "filler_qualifier")
    throw new ValidationError("No replacement text returned");

  const maxAllowed = Math.max(selectedText.length * 2, 320);
  if (replacementText.length > maxAllowed) {
    throw new ValidationError("Replacement output is unexpectedly long for the selected text");
  }
  if (looksLikePromptDump(replacementText)) {
    throw new ValidationError("Replacement output looks like assistant prompt text, rejected");
  }

  const parseHistory = (raw: string | null | undefined): unknown[] => {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const priorHistory = parseHistory(app.refinementHistory);
  const nextHistory = [
    ...priorHistory,
    {
      timestamp: new Date().toISOString(),
      documentType,
      kind,
      instruction,
      selectedText,
      replacementText,
    },
  ].slice(-MAX_REFINEMENT_HISTORY);

  await db
    .update(applications)
    .set({ refinementHistory: JSON.stringify(nextHistory) })
    .where(and(eq(applications.id, applicationId), eq(applications.userId, session.userId)));

  // Voice authenticity check — build a minimal ResumeDocument from the refined text
  const minimalDoc: ResumeDocument = {
    markdownContent: `${before}${replacementText}${after}`,
    header: { name: "", title: "", contact: "" },
    summary: "",
    skills: { categories: [] },
    experience: [],
    education: [],
    atsScore: null,
    qualityChecks: [],
  };
  const voiceResult = authenticateVoice(minimalDoc);
  const aiDetectionScore = voiceResult.aiDetectionScore;
  const warning =
    aiDetectionScore < 60
      ? "Refined text may not sound like you. Review before applying."
      : undefined;

  return NextResponse.json({ refined: replacementText, voiceScore: aiDetectionScore, warning });
});
