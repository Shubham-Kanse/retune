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
    <div className="flex flex-col h-full bg-[#faf8f5]">
      <main id="main-content" className="flex-1 min-h-0 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
