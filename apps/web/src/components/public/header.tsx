import { MainNav } from "@/components/public/main-nav";
import { MobileNav } from "@/components/public/mobile-nav";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/session";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

export async function PublicHeader() {
  const [session, t] = await Promise.all([getSession(), getTranslations("nav")]);

  return (
    <header className="sticky top-0 left-0 z-50 w-full border-b bg-background/80 px-0 py-3 backdrop-blur-md md:px-6">
      <div className="container mx-auto flex items-center justify-between">
        <div>
          <MainNav />
          <MobileNav />
        </div>
        <div className="flex items-center gap-1.5">
          {session ? (
            <Button asChild size="sm">
              <Link href="/dashboard">{t("go_to_dashboard")}</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
                <Link href="/login">{t("sign_in")}</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/signup">{t("get_started")}</Link>
              </Button>
            </>
          )}
          <AnimatedThemeToggler className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors hover:bg-accent" />
        </div>
      </div>
    </header>
  );
}
