import { getSession } from "@/lib/session";
import { LandingDemoCard } from "@/components/landing/demo-card";
import { LandingHero } from "@/components/landing/hero";
import { FAQ, Features, HowItWorks } from "@/components/landing/sections";

export default async function HomePage() {
  const session = await getSession();

  return (
    <main id="main-content" className="mx-auto w-full max-w-6xl px-6 pb-20">
      <LandingHero isLoggedIn={!!session} />
      <LandingDemoCard />
      <HowItWorks />
      <Features />
      <FAQ />
    </main>
  );
}
