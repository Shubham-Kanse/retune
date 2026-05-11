import { cache } from "react";
import { applications, db, profiles } from "@retune/db";
import { eq } from "drizzle-orm";

/**
 * Cached profile query - deduped across server components in same request
 */
export const getCachedProfile = cache(async (userId: string) => {
  return db
    .select({
      fullName: profiles.fullName,
      email: profiles.email,
      phone: profiles.phone,
      linkedin: profiles.linkedin,
      location: profiles.location,
      currentTitle: profiles.currentTitle,
      targetRoles: profiles.targetRoles,
      experience: profiles.experience,
      education: profiles.education,
      skillsTier1: profiles.skillsTier1,
      voiceNotes: profiles.voiceNotes,
      profileMarkdown: profiles.profileMarkdown,
    })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
});

/**
 * Cached applications query - deduped across server components in same request
 */
export const getCachedApplications = cache(async (userId: string) => {
  return db
    .select({
      id: applications.id,
      status: applications.status,
    })
    .from(applications)
    .where(eq(applications.userId, userId))
    .limit(50);
});

/**
 * Cached user query - deduped across server components in same request
 */
export const getCachedUser = cache(async (userId: string) => {
  const { users } = await import("@retune/db");
  return db
    .select({ 
      createdAt: users.createdAt, 
      fullName: users.fullName 
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
});
