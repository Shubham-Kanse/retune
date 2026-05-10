import { spawn } from "node:child_process";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getSession } from "@/lib/session";
import { getModels, getProvider } from "@retune/agent/web";
import { db, onboardingConversations } from "@retune/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large. Maximum 10MB." }, { status: 400 });
  }

  const name = file.name.toLowerCase();
  if (!name.endsWith(".pdf") && !name.endsWith(".docx")) {
    return NextResponse.json({ error: "Only PDF and DOCX files are supported." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Validate file magic bytes — reject files that don't match their claimed extension
  const isPdf =
    buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46; // %PDF
  const isDocx = buffer[0] === 0x50 && buffer[1] === 0x4b; // PK ZIP header (DOCX/XLSX/PPTX)
  if (name.endsWith(".pdf") && !isPdf) {
    return NextResponse.json({ error: "File does not appear to be a valid PDF." }, { status: 400 });
  }
  if (name.endsWith(".docx") && !isDocx) {
    return NextResponse.json(
      { error: "File does not appear to be a valid DOCX." },
      { status: 400 },
    );
  }

  // Save file temporarily for extraction
  const uploadDir = resolve(process.cwd(), "data", "uploads", session.userId);
  mkdirSync(uploadDir, { recursive: true });
  const filePath = resolve(
    uploadDir,
    `resume_${Date.now()}${name.endsWith(".pdf") ? ".pdf" : ".docx"}`,
  );
  writeFileSync(filePath, buffer);

  // Extract text using Python, then delete temp file
  let extractedText = "";
  try {
    extractedText = await extractText(filePath);
  } catch {
    extractedText = `[Could not parse file. The user uploaded ${file.name} (${(file.size / 1024).toFixed(0)}KB)]`;
  } finally {
    try {
      unlinkSync(filePath);
    } catch {
      /* non-fatal */
    }
  }

  // Store in onboarding conversation
  const now = new Date();
  const convoRows = await db
    .select()
    .from(onboardingConversations)
    .where(eq(onboardingConversations.userId, session.userId))
    .limit(1);
  let convo = convoRows[0];

  if (!convo) {
    const inserted = await db
      .insert(onboardingConversations)
      .values({
        userId: session.userId,
        messages: "[]",
        stage: "upload",
        resumeText: extractedText,
      })
      .returning();
    convo = inserted[0];
    if (!convo) {
      return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 });
    }
  } else {
    await db
      .update(onboardingConversations)
      .set({ resumeText: extractedText, updatedAt: now })
      .where(eq(onboardingConversations.id, convo.id));
  }

  // Feed to onboarding conversation as a message
  const messages: Array<{ role: string; content: string }> = JSON.parse(convo.messages);
  messages.push({
    role: "user",
    content: `[Uploaded resume: ${file.name}]\n\nExtracted text:\n${extractedText.slice(0, 5000)}`,
  });

  // Get AI response via the provider-agnostic interface.
  // IMPORTANT: import from `@retune/agent/web` (technical-2.0 §12.2) —
  // the bare `@retune/agent` barrel pulls in `@temporalio/worker` which
  // wants `@swc/wasm` and breaks the Next.js bundle.
  const { assembleSystemPrompt } = await import("@retune/agent/web");
  const provider = getProvider();

  const systemPromptText = assembleSystemPrompt({ agentType: "profile-builder" });
  const response = await provider.createMessage("onboarding", {
    model: getModels().fast,
    maxTokens: 4096,
    system: [{ type: "text", text: systemPromptText, cacheHint: true }],
    messages: messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  });

  const assistantText = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  messages.push({ role: "assistant", content: assistantText });

  await db
    .update(onboardingConversations)
    .set({ messages: JSON.stringify(messages), stage: "experience", updatedAt: now })
    .where(eq(onboardingConversations.id, convo.id));

  // Parse structured JSON from AI response
  let extracted: Record<string, unknown> | null = null;
  const jsonMatch = assistantText.match(/```json\s*([\s\S]*?)```/);
  if (jsonMatch?.[1]) {
    try {
      extracted = JSON.parse(jsonMatch[1]);
    } catch {
      // If AI didn't return valid JSON, fall back to raw text
    }
  }

  // Determine which fields are missing
  const missing: string[] = [];
  if (extracted) {
    if (!extracted.fullName) missing.push("fullName");
    if (!extracted.currentTitle) missing.push("currentTitle");
    if (!extracted.experienceLevel) missing.push("experienceLevel");
    if (!Array.isArray(extracted.targetRoles) || extracted.targetRoles.length === 0) missing.push("targetRoles");
    if (!extracted.linkedin) missing.push("linkedin");
    if (!extracted.visaStatus) missing.push("visaStatus");
    if (!Array.isArray(extracted.relocationPreferences) || extracted.relocationPreferences.length === 0) missing.push("relocationPreferences");
    if (!extracted.location) missing.push("location");
    if (!extracted.email) missing.push("email");
    if (!extracted.phone) missing.push("phone");
  }

  return NextResponse.json({
    response: assistantText,
    extracted,
    missing,
    stage: 1,
  });
}

function extractText(filePath: string): Promise<string> {
  return new Promise((res, rej) => {
    // Simple Python script to extract text
    const script = `
import sys
path = sys.argv[1]
if path.endswith('.pdf'):
    try:
        import fitz
        doc = fitz.open(path)
        text = '\\n'.join(page.get_text() for page in doc)
        print(text)
    except ImportError:
        with open(path, 'rb') as f:
            content = f.read()
            # Fallback: extract ASCII text
            text = content.decode('utf-8', errors='ignore')
            print(text[:5000])
elif path.endswith('.docx'):
    try:
        from docx import Document
        doc = Document(path)
        text = '\\n'.join(p.text for p in doc.paragraphs)
        print(text)
    except ImportError:
        print('[DOCX parsing requires python-docx]')
`;
    const proc = spawn("python3", ["-c", script, filePath], { timeout: 15000 });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => {
      stdout += d;
    });
    proc.stderr.on("data", (d) => {
      stderr += d;
    });
    proc.on("close", (code) => {
      if (code === 0) res(stdout);
      else rej(new Error(stderr || "Extraction failed"));
    });
    proc.on("error", rej);
  });
}
