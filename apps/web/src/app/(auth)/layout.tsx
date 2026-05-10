import { AuthSidebar } from "@/components/layout/auth-sidebar";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-[#faf8f5] flex">
      <AuthSidebar userName={session.fullName} userEmail={session.email} />
      <main className="flex-1 border-l border-[#e5e2dd] min-h-screen bg-[#faf8f5]">{children}</main>
    </div>
  );
}
