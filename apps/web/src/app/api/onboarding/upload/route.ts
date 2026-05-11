import { findMissingCoreFields, persistProfileAssembly } from "@/lib/profile-assembly";
import { getSession } from "@/lib/session";
import { db, onboardingConversations } from "@retune/db";
import { eq } from "drizzle-orm";
import OpenAI from "openai";
import { NextResponse } from "next/server";
const DEFAULT_ONBOARDING_MODEL = "gpt-4.1-mini";

const PROFILE_SCHEMA = {
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
    experienceLevel: { type: "string" },
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
        required: ["company", "title", "titleForResume", "startDate", "endDate", "description", "metrics", "tools", "teamSize", "client", "industry"],
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
    "relocationPreferences",
    "targetRoles",
    "experienceLevel",
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
};

const PROFILE_EXTRACTION_PROMPT = `You are a resume extraction engine.
Return a single JSON object matching the provided schema exactly.

Extraction quality rules:
- Extract exhaustively. Do not summarize away details.
- For each work experience item, include ALL meaningful bullet points in description, one bullet per line separated by \\n.
- Preserve dates accurately. Use YYYY-MM when available; else YYYY.
- Keep field order and keys from the schema.
- If unknown, use empty string, 0, or [] as appropriate (never omit required fields).
- Infer experienceLevel from total years of work history: 0-2 entry, 2-4 early, 4-7 mid, 7-10 senior, 10+ staff.
- Populate targetRoles from explicit intent if present; otherwise infer from recent titles and skills.
- Skills tiering: Tier1 = repeated + recent production use, Tier2 = proven but less central, Tier3 = exposure only.`;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  if (file.size > 10 * 1024 * 1024)
    return NextResponse.json({ error: "File too large. Maximum 10MB." }, { status: 400 });

  const name = file.name.toLowerCase();
  if (!name.endsWith(".pdf") && !name.endsWith(".docx"))
    return NextResponse.json({ error: "Only PDF and DOCX files are supported." }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());

  // Validate magic bytes
  const isPdf = buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
  const isDocx = buffer[0] === 0x50 && buffer[1] === 0x4b;
  if (name.endsWith(".pdf") && !isPdf)
    return NextResponse.json({ error: "File does not appear to be a valid PDF." }, { status: 400 });
  if (name.endsWith(".docx") && !isDocx)
    return NextResponse.json({ error: "File does not appear to be a valid DOCX." }, { status: 400 });

  // Send file as a proper file input and require schema-shaped JSON output
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  let assistantText = "";
  let extracted: Record<string, unknown> | null = null;
  try {
    const mediaType = name.endsWith(".pdf")
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const fileData = `data:${mediaType};base64,${buffer.toString("base64")}`;

    const response: any = await openai.responses.create({
      model: process.env.ONBOARDING_EXTRACT_MODEL ?? process.env.OPENAI_NANO_MODEL ?? DEFAULT_ONBOARDING_MODEL,
      max_output_tokens: 8192,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: PROFILE_EXTRACTION_PROMPT }],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Extract all information from this resume into the profile JSON schema. Be exhaustive.",
            },
            {
              type: "input_file",
              filename: file.name,
              file_data: fileData,
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "profile_extraction",
          strict: true,
          schema: PROFILE_SCHEMA,
        },
      },
    });

    assistantText = response.output_text ?? "";
    if (assistantText) {
      try {
        extracted = JSON.parse(assistantText) as Record<string, unknown>;
      } catch {
        extracted = null;
      }
    }
  } catch (err) {
    console.error("[upload] AI extraction failed:", err);
    assistantText = "";
    extracted = null;
  }

  // Store conversation
  const now = new Date();
  const convoRows = await db
    .select()
    .from(onboardingConversations)
    .where(eq(onboardingConversations.userId, session.userId))
    .limit(1);
  let convo = convoRows[0];

  const messages = [
    { role: "user", content: `[Uploaded resume: ${file.name}]` },
    { role: "assistant", content: assistantText },
  ];

  if (!convo) {
    const inserted = await db
      .insert(onboardingConversations)
      .values({ userId: session.userId, messages: JSON.stringify(messages), stage: "conversation" })
      .returning();
    convo = inserted[0];
    if (!convo) return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 });
  } else {
    await db
      .update(onboardingConversations)
      .set({ messages: JSON.stringify(messages), stage: "conversation", updatedAt: now })
      .where(eq(onboardingConversations.id, convo.id));
  }

  const missing = extracted ? findMissingCoreFields(extracted) : [];

  if (extracted) {
    try {
      await persistProfileAssembly({
        userId: session.userId,
        sessionEmail: session.email,
        profile: extracted,
        now,
        // Upload should prefill profile data but not auto-complete onboarding.
        markOnboardingCompleted: false,
      });
    } catch (err) {
      console.error("[upload] Failed to persist extracted profile:", err);
    }
  }

  return NextResponse.json({ response: assistantText, extracted, missing, stage: 1 });
}
