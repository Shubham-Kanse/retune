import { withAuth } from "@/lib/api-handler";
import { applications, db, profiles, users } from "@retune/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const GET = withAuth(async (_request, session) => {
  const userRows = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  const user = userRows[0];

  const profileRows = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, session.userId))
    .limit(1);
  const profile = profileRows[0];

  const userApplications = await db
    .select({
      id: applications.id,
      userId: applications.userId,
      companyName: applications.companyName,
      roleTitle: applications.roleTitle,
      jdUrl: applications.jdUrl,
      status: applications.status,
      currentStep: applications.currentStep,
      atsScore: applications.atsScore,
      market: applications.market,
      generationDurationMs: applications.generationDurationMs,
      createdAt: applications.createdAt,
      updatedAt: applications.updatedAt,
    })
    .from(applications)
    .where(eq(applications.userId, session.userId));

  const payload = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      user,
      profile,
      applications: userApplications,
    },
    null,
    2,
  );

  return new NextResponse(payload, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="retune-export-${Date.now()}.json"`,
    },
  });
});
