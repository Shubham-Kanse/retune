import { AuthSidebar } from "@/components/layout/auth-sidebar";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import Image from "next/image";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="h-screen bg-background text-foreground flex relative overflow-hidden">
      {/* Orb — same position/size as landing page hero */}
      <div className="pointer-events-none absolute -right-32 md:-right-48 top-32 md:top-40 w-[500px] h-[500px] md:w-[750px] md:h-[750px] animate-orb-rotate scale-125 z-0">
        <Image src="/images/orb.png" alt="" width={750} height={750} className="w-full h-full" priority unoptimized />
      </div>

      <AuthSidebar userName={session.fullName} userEmail={session.email} />
      <main className="flex-1 border-l border-[#e0ddd9] h-full relative z-10 overflow-y-auto flex justify-center pb-10 scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {children}
      </main>
    </div>
  );
}
