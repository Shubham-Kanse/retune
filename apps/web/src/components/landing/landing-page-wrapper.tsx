import { getSession } from "@/lib/session";
import LandingPageClient from "./landing-page-client";

export default async function LandingPageWrapper() {
  const session = await getSession();
  return <LandingPageClient session={session} />;
}
