import { getTranslations } from "next-intl/server";
import Link from "next/link";

export async function PublicFooter() {
  const t = await getTranslations("footer");
  return (
    <footer className="border-t border-border/60 mt-32">
      <div className="container mx-auto flex flex-col items-start justify-between gap-6 px-6 py-10 text-sm text-muted-foreground md:flex-row md:items-center">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">Retuned</span>
          <span className="text-muted-foreground/70">- {t("tagline")}</span>
        </div>
        <div className="flex items-center gap-5">
          <Link href="/privacy" className="transition-colors hover:text-foreground">{t("privacy")}</Link>
          <Link href="/terms" className="transition-colors hover:text-foreground">{t("terms")}</Link>
          <Link href="/login" className="transition-colors hover:text-foreground">{t("sign_in")}</Link>
        </div>
      </div>
    </footer>
  );
}
