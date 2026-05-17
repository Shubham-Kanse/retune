import { getOnboardingStatus } from "@/lib/onboarding-gate";
import { getSession } from "@/lib/session";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  // Already-onboarded users should not loop back through onboarding.
  // The chat route can still be hit directly via API (intentional — users
  // can revise individual fields), but the wizard UI is one-shot.
  const status = await getOnboardingStatus(session.userId);
  if (!status.emailVerified) {
    redirect(`/verify-email?email=${encodeURIComponent(session.email)}`);
  }
  if (status.onboardingCompleted) redirect("/dashboard");

  return (
    <div className="relative h-[100dvh] w-full bg-background text-foreground">
      <main id="main-content" className="relative z-10 h-full overflow-hidden">
        {children}
      </main>
    </div>
  );
}
