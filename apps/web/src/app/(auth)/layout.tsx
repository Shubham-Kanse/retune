import { AppSidebar } from "@/components/app/app-sidebar";
import { AppTopbar } from "@/components/app/topbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getOnboardingStatus, onboardingPath } from "@/lib/onboarding-gate";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  // Gate: users who haven't completed onboarding cannot enter the main app.
  // Without this, /dashboard and /profile render empty states for fresh
  // accounts, which is both confusing and breaks several downstream features
  // that assume a populated profile.
  const status = await getOnboardingStatus(session.userId);
  if (!status.emailVerified) {
    redirect(`/verify-email?email=${encodeURIComponent(session.email)}`);
  }
  if (!status.onboardingCompleted) redirect(onboardingPath());

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar userName={session.fullName} userEmail={session.email} />
        <SidebarInset className="flex min-h-screen flex-col">
          <AppTopbar />
          <main id="main-content" className="flex-1 overflow-y-auto">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
