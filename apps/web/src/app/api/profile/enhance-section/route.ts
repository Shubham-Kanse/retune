import { withAuth } from "@/lib/api-handler";
import { getModels, getProvider } from "@retune/agent/web";
import { NextResponse } from "next/server";
import { z } from "zod";

const allowedSections = ["summary", "experience", "projects"] as const;
const allowedIntents = [
  "make_recruiter_ready",
  "align_to_target_roles",
  "strengthen_bullets",
  "add_metric_prompts",
] as const;

type Section = (typeof allowedSections)[number];
type Intent = (typeof allowedIntents)[number];

const sectionPatchKeys: Record<Section, string[]> = {
  summary: ["voiceNotes"],
  experience: ["experience"],
  projects: ["projects"],
};

const intentDescriptions: Record<Intent, string> = {
  make_recruiter_ready:
    "Rewrite the selected section so it is concise, credible, recruiter-facing, and grounded in the candidate data.",
  align_to_target_roles:
    "Prioritise evidence and wording that supports the candidate's target roles without inventing facts.",
  strengthen_bullets:
    "Improve clarity, action verbs, and business impact while preserving only supported facts.",
  add_metric_prompts:
    "Keep known metrics and add metric placeholders only when the candidate should fill a missing value.",
};

const metricSchema = z.object({
  metric: z.string().optional(),
  value: z.string().optional(),
  context: z.string().optional(),
  direction: z.string().optional(),
});

const experienceSchema = z.object({
  company: z.string(),
  title: z.string(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  description: z.string().optional(),
  metrics: z.array(metricSchema).optional(),
  tools: z.array(z.string()).optional(),
});

const projectSchema = z.object({
  name: z.string().optional(),
  context: z.string().optional(),
  description: z.string().optional(),
  tools: z.array(z.string()).optional(),
  outcome: z.string().optional(),
});

const patchSchemaBySection: Record<Section, z.ZodTypeAny> = {
  summary: z.object({ voiceNotes: z.string() }),
  experience: z.object({ experience: z.array(experienceSchema) }),
  projects: z.object({ projects: z.array(projectSchema) }),
};

function isSection(value: unknown): value is Section {
  return typeof value === "string" && allowedSections.includes(value as Section);
}

function isIntent(value: unknown): value is Intent {
  return typeof value === "string" && allowedIntents.includes(value as Intent);
}

function pickPatch(section: Section, rawPatch: Record<string, unknown>): Record<string, unknown> {
  return sectionPatchKeys[section].reduce<Record<string, unknown>>((patch, key) => {
    if (key in rawPatch) patch[key] = rawPatch[key];
    return patch;
  }, {});
}

function normalise(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function violatesFactualConstraints(
  section: Section,
  profile: Record<string, unknown>,
  patch: Record<string, unknown>,
): boolean {
  if (section === "experience") {
    const source = Array.isArray(profile.experience) ? profile.experience : [];
    const allowed = new Set(
      source.map(
        (item) =>
          `${normalise((item as Record<string, unknown>).company)}::${normalise((item as Record<string, unknown>).title)}`,
      ),
    );
    const enhanced = Array.isArray(patch.experience) ? patch.experience : [];
    return enhanced.some((item) => {
      const key = `${normalise((item as Record<string, unknown>).company)}::${normalise((item as Record<string, unknown>).title)}`;
      return key !== "::" && !allowed.has(key);
    });
  }

  if (section === "projects") {
    const source = Array.isArray(profile.projects) ? profile.projects : [];
    const allowed = new Set(
      source.map((item) => normalise((item as Record<string, unknown>).name)).filter(Boolean),
    );
    const enhanced = Array.isArray(patch.projects) ? patch.projects : [];
    return enhanced.some((item) => {
      const name = normalise((item as Record<string, unknown>).name);
      return Boolean(name) && !allowed.has(name);
    });
  }

  return false;
}

export const POST = withAuth(async (request) => {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > 100_000) {
    return NextResponse.json({ error: "Request body too large" }, { status: 413 });
  }
  const body = await request.json().catch(() => null);
  if (!body || !isSection(body.section) || !isIntent(body.intent) || !body.profile) {
    return NextResponse.json({ error: "Invalid enhancement request" }, { status: 400 });
  }
  const section: Section = body.section;
  const intent: Intent = body.intent;

  const response = await getProvider().createMessage("enhance-section", {
    model: getModels().fast,
    maxTokens: 4096,
    system: `You are improving a structured candidate profile for an agentic resume-writing product.

Return ONLY JSON. No markdown fences.
Only return fields that belong to the selected section.
Never invent employers, degrees, certifications, metrics, dates, tools, or outcomes.
If a metric is missing but useful, use a placeholder like "[add %]" inside the relevant metric value or bullet.
Keep the same schema shape that the user provided.

Patch fields by section:
- summary: {"voiceNotes": string}
- experience: {"experience": [{"company":"","title":"","startDate":"","endDate":"","description":"","metrics":[{"metric":"","value":"","context":"","direction":""}],"tools":[]}]}
- projects: {"projects": [{"name":"","context":"","description":"","tools":[],"outcome":""}]}`,
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          section,
          intent,
          intentDescription: intentDescriptions[intent],
          profile: body.profile,
        }),
      },
    ],
  });

  const text = response.content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? text);
  } catch {
    return NextResponse.json({ error: "AI returned an invalid profile patch" }, { status: 502 });
  }

  const patch = pickPatch(section, parsed);
  if (!Object.keys(patch).length) {
    return NextResponse.json(
      { error: "AI did not return an editable section patch" },
      { status: 502 },
    );
  }

  const validated = patchSchemaBySection[section].safeParse(patch);
  if (!validated.success) {
    return NextResponse.json({ error: "AI patch failed schema validation" }, { status: 502 });
  }

  if (
    violatesFactualConstraints(
      section,
      body.profile as Record<string, unknown>,
      validated.data as Record<string, unknown>,
    )
  ) {
    return NextResponse.json(
      { error: "AI patch introduced unsupported entities" },
      { status: 502 },
    );
  }

  return NextResponse.json({ patch: validated.data });
});
