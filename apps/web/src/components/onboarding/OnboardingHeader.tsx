"use client";

import Link from "next/link";

export function OnboardingHeader() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#faf8f5]/80 backdrop-blur-md border-b border-[#e5e2dd]">
      <div className="max-w-[1280px] mx-auto px-6 md:px-12">
        <nav className="flex items-center justify-between h-16 md:h-20">
          <Link href="/" className="font-serif text-lg font-semibold tracking-tight text-[#1a1a1a]">
            Retuned
          </Link>
          <p className="text-sm text-[#6b6b6b]">Setting up your profile</p>
        </nav>
      </div>
    </header>
  );
}
