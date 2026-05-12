import { db, onboardingConversations } from "@retune/db";
import { eq } from "drizzle-orm";
import type { OnboardingStage } from "../enums";

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export async function upsertOnboardingConversation(params: {
  userId: string;
  stage: OnboardingStage;
  messages: ConversationMessage[];
}) {
  const now = new Date();
  const rows = await db
    .select()
    .from(onboardingConversations)
    .where(eq(onboardingConversations.userId, params.userId))
    .limit(1);
  const existing = rows[0];

  if (!existing) {
    await db.insert(onboardingConversations).values({
      userId: params.userId,
      stage: params.stage,
      messages: JSON.stringify(params.messages),
      updatedAt: now,
    });
    return;
  }

  await db
    .update(onboardingConversations)
    .set({ stage: params.stage, messages: JSON.stringify(params.messages), updatedAt: now })
    .where(eq(onboardingConversations.id, existing.id));
}
