import { withAuth } from "@/lib/api-handler";
import { AgentError, ValidationError } from "@/lib/errors";
import { persistProfileAssembly } from "@/lib/profile-assembly";
import { assembleSystemPrompt, getModels, getProvider } from "@retune/agent/web";
import { db, onboardingConversations } from "@retune/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

const STAGES = ["upload", "experience", "education", "review"] as const;

export const POST = withAuth(async (request, session) => {
  const body = await request.json().catch(() => {
    throw new ValidationError("Invalid JSON body");
  });

  const { message } = body;
  if (!message || typeof message !== "string") {
    throw new ValidationError("Message is required");
  }
  if (message.length > 8000) {
    throw new ValidationError("Message too long (max 8000 characters)");
  }

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
      })
      .returning();
    convo = inserted[0];
    if (!convo) {
      throw new AgentError("Failed to create onboarding conversation");
    }
  }

  const messages: Array<{ role: string; content: string }> = JSON.parse(convo.messages);
  messages.push({ role: "user", content: message });

  let assistantText: string;
  try {
    const provider = getProvider();
    const systemPromptText = assembleSystemPrompt({ agentType: "profile-builder" });
    const response = await provider.createMessage("onboarding", {
      model: getModels().fast,
      maxTokens: 4096,
      system: [{ type: "text", text: systemPromptText, cacheHint: true }],
      messages: messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });
    assistantText = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI service unavailable";
    throw new AgentError(`Onboarding failed: ${msg}`);
  }

  messages.push({ role: "assistant", content: assistantText });

  const jsonMatch = assistantText.match(/```(?:json)?\s*\n([\s\S]*?)\n```/i);
  let complete = false;
  let stage = (STAGES as readonly string[]).indexOf(convo.stage);
  if (stage < 0) stage = 0;

  if (jsonMatch?.[1]) {
    try {
      const profileData = JSON.parse(jsonMatch[1]) as Record<string, unknown>;
      await persistProfileAssembly({
        userId: session.userId,
        sessionEmail: session.email,
        profile: profileData,
        now,
        markOnboardingCompleted: true,
      });

      complete = true;
      stage = 3;
    } catch {
      // JSON parse or persistence failed; continue conversation path.
    }
  }

  const lower = assistantText.toLowerCase();
  if (lower.includes("education") || lower.includes("degree")) stage = Math.max(stage, 2);
  else if (lower.includes("experience") || lower.includes("role") || lower.includes("company")) {
    stage = Math.max(stage, 1);
  }

  await db
    .update(onboardingConversations)
    .set({
      messages: JSON.stringify(messages),
      stage: STAGES[stage] ?? "upload",
      updatedAt: now,
    })
    .where(eq(onboardingConversations.id, convo.id));

  return NextResponse.json({ response: assistantText, stage, complete });
});
