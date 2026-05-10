import { Logo } from "@/components/ui/logo";
// PageBackground injected globally via root layout — no import needed here
import { getSession } from "@/lib/session";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="px-6 h-[56px] flex items-center justify-between">
          <Link href="/dashboard">
            <Logo variant="text" size="sm" />
          </Link>
          <span className="text-xs text-muted-foreground">Profile setup</span>
        </div>
      </header>
      <main id="main-content" className="px-6 py-8">
        {children}
      </main>
    </div>
  );
}
