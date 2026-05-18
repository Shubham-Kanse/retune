import { getOnboardingStatus } from "@/lib/onboarding-gate";
import { getSession } from "@/lib/session";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const headerList = await headers();
  const path = headerList.get("x-pathname") || headerList.get("x-invoke-path") || "";
  const url = headerList.get("x-url") || "";
  const enhanceMode = url.includes("enhance=1") || path.includes("enhance=1");

  const status = await getOnboardingStatus(session.userId);
  if (!status.emailVerified) {
    redirect(`/verify-email?email=${encodeURIComponent(session.email)}`);
  }
  // Already-onboarded users are normally bounced to /dashboard, *unless*
  // they explicitly opted into v2 enrichment via ?enhance=1.
  if (status.onboardingCompleted && !enhanceMode) redirect("/dashboard");

  // v2 is the only active onboarding flow. Keep a compatibility redirect for
  // old /onboarding links, but never run the removed v1 client.
  if (path.startsWith("/onboarding") && !path.startsWith("/onboarding-v2")) {
    redirect("/onboarding-v2");
  }

  return (
    <div className="relative h-[100dvh] w-full bg-background text-foreground">
      <main id="main-content" className="relative z-10 h-full overflow-hidden">
        {children}
      </main>
    </div>
  );
}
