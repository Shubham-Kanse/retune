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
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border px-6 py-3">
        <span className="text-base font-semibold tracking-tight">Retuned</span>
      </header>
      <main id="main-content" className="flex-1 min-h-0 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
