"use client";

import { JdPrompt } from "@/components/generate/jd-prompt";
import { useRouter } from "next/navigation";

export function LandingDemoCard() {
  const router = useRouter();

  return (
    <section className="mx-auto w-full max-w-3xl pt-6">
      <JdPrompt
        onStart={({ mode, jdText, jdUrl }) => {
          const params = new URLSearchParams();
          if (mode === "text" && jdText) params.set("jd", jdText);
          if (mode === "url" && jdUrl) params.set("url", jdUrl);
          router.push(`/signup?${params.toString()}`);
        }}
      />
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Sign up to run a real tuning on your resume - 3 free generations, no credit card.
      </p>
    </section>
  );
}
