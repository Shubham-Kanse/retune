import { getSession } from "@/lib/session";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="relative h-[100dvh] w-full bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none fixed left-1/2 top-32 -z-0 hidden h-[360px] w-[820px] -translate-x-1/2 bg-orange-100 opacity-50 blur-3xl dark:opacity-20 md:block"
      />
      <main id="main-content" className="relative z-10 h-full overflow-hidden">
        {children}
      </main>
    </div>
  );
}
