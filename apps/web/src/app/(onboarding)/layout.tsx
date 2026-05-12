import { getSession } from "@/lib/session";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Image from "next/image";
import { OnboardingHeader } from "@/components/onboarding/OnboardingHeader";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="h-dvh overflow-hidden bg-[#faf8f5] relative">
      {/* Orb background */}
      <div className="absolute -right-32 md:-right-48 top-32 md:top-40 w-[500px] h-[500px] md:w-[750px] md:h-[750px] pointer-events-none animate-orb-rotate scale-125">
        <Image src="/images/orb.png" alt="" width={750} height={750} className="w-full h-full" priority unoptimized />
      </div>

      <OnboardingHeader />

      <main
        id="main-content"
        className="relative z-10 mt-16 md:mt-20 h-[calc(100dvh-4rem)] md:h-[calc(100dvh-5rem)] overflow-hidden min-h-0"
      >
        {children}
      </main>
    </div>
  );
}
