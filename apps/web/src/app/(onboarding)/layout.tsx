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
      <main id="main-content" className="relative z-10 h-full overflow-hidden">
        {children}
      </main>
    </div>
  );
}
