import { redirect } from "next/navigation";

export default function LegacyOnboardingRedirect() {
  redirect("/onboarding-v2");
}
