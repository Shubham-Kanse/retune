import { AppSidebar } from "@/components/app/app-sidebar";
import { AppTopbar } from "@/components/app/topbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

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
