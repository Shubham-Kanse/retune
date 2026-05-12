"use client";

import { Header } from "@/components/landing/header";
import { Footer } from "@/components/landing/footer";
import { Hero } from "@/components/landing/sections/hero";
import { SelectedWorks } from "@/components/landing/sections/selected-works";
import { About } from "@/components/landing/sections/about";
import { ClientLogos } from "@/components/landing/sections/client-logos";
import { FinalCTA } from "@/components/landing/sections/final-cta";

export default function HomePage() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <SelectedWorks />
        <About />
        <ClientLogos />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
