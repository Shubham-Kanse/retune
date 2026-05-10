import { withAuth } from "@/lib/api-handler";
import { AgentError, ValidationError } from "@/lib/errors";
import { assembleSystemPrompt, getModels, getProvider } from "@retune/agent/web";
import { computeCompletenessScore, db, onboardingConversations, profiles, users } from "@retune/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

const STAGES = ["upload", "experience", "education", "review"] as const;

function escapeMarkdown(text: string | null | undefined): string {
  if (!text) return "";
  return String(text).replace(/[\\`*_{}[\]()#+\-.!|]/g, "\\$&");
}

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

  // Get or create conversation
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

  // Call AI provider (respects AI_PROVIDER env — OpenAI or Anthropic)
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

  // Check if profile JSON is in the response
  const jsonMatch = assistantText.match(/```(?:json)?\s*\n([\s\S]*?)\n```/i);
  let complete = false;
  let stage = (STAGES as readonly string[]).indexOf(convo.stage);
  if (stage < 0) stage = 0;

  if (jsonMatch?.[1]) {
    try {
      const profileData = JSON.parse(jsonMatch[1]);

      // Compute completeness score using shared utility
      const completenessScore = computeCompletenessScore({
        ...profileData,
        email: profileData.email ?? session.email,
      });

      // Build a clean profileMarkdown from structured data rather than the raw Claude response
      const profileMarkdown = [
        `# ${escapeMarkdown(profileData.fullName) || "Candidate"}`,
        profileData.currentTitle ? `\n${escapeMarkdown(profileData.currentTitle)}` : "",
        profileData.location ? `\n**Location:** ${escapeMarkdown(profileData.location)}` : "",
        (profileData.targetRoles ?? []).length
          ? `\n## Target Roles\n${(profileData.targetRoles ?? [])
              .map((r: any) => escapeMarkdown(r))
              .join(", ")}`
          : "",
        (profileData.experience ?? []).length
          ? `\n## Experience\n${(profileData.experience ?? [])
              .map(
                (e: any) =>
                  `### ${escapeMarkdown(e.title) ?? "Role"} — ${escapeMarkdown(e.company) ?? "Company"}\n${[
                    e.startDate,
                    e.endDate,
                  ]
                    .filter(Boolean)
                    .join(" – ")}\n${escapeMarkdown(e.description)}`,
              )
              .join("\n\n")}`
          : "",
        (profileData.education ?? []).length
          ? `\n## Education\n${(profileData.education ?? [])
              .map(
                (e: any) =>
                  `${escapeMarkdown(e.degree) || ""} — ${escapeMarkdown(e.institution) || ""}`,
              )
              .join("\n")}`
          : "",
        (profileData.skillsTier1 ?? []).length
          ? `\n## Skills\n${(profileData.skillsTier1 ?? [])
              .map((s: any) => escapeMarkdown(s.name ?? s))
              .join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      const profileValues = {
        fullName: profileData.fullName ?? "",
        email: profileData.email ?? session.email,
        phone: profileData.phone ?? null,
        linkedin: profileData.linkedin ?? null,
        location: profileData.location ?? "",
        visaStatus: profileData.visaStatus ?? null,
        currentTitle: profileData.currentTitle ?? null,
        relocationPreferences: JSON.stringify(profileData.relocationPreferences ?? []),
        targetRoles: JSON.stringify(profileData.targetRoles ?? []),
        experienceLevel: profileData.experienceLevel ?? "mid",
        experience: JSON.stringify(profileData.experience ?? []),
        education: JSON.stringify(profileData.education ?? []),
        certifications: JSON.stringify(profileData.certifications ?? []),
        projects: JSON.stringify(profileData.projects ?? []),
        skillsTier1: JSON.stringify(profileData.skillsTier1 ?? []),
        skillsTier2: JSON.stringify(profileData.skillsTier2 ?? []),
        skillsTier3: JSON.stringify(profileData.skillsTier3 ?? []),
        voiceNotes: profileData.voiceNotes || profileData.summary || null,
        profileMarkdown,
        completenessScore,
        updatedAt: now,
      };

      await db.transaction(async (tx) => {
        await tx
          .insert(profiles)
          .values({
            userId: session.userId,
            ...profileValues,
          })
          .onConflictDoUpdate({
            target: profiles.userId,
            set: profileValues,
          });

        await tx
          .update(users)
          .set({ onboardingCompleted: true, fullName: profileData.fullName, updatedAt: now })
          .where(eq(users.id, session.userId));
      });

      complete = true;
      stage = 3;
    } catch {
      // JSON parse failed, continue conversation
    }
  }

  // Heuristic stage detection
  const lower = assistantText.toLowerCase();
  if (lower.includes("education") || lower.includes("degree")) stage = Math.max(stage, 2);
  else if (lower.includes("experience") || lower.includes("role") || lower.includes("company"))
    stage = Math.max(stage, 1);

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
