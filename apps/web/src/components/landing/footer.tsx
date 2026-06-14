"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";

export function Footer() {
  const t = useTranslations("footer");

  const socialLinks = [
    { href: "#", label: t("twitter") },
    { href: "#", label: t("linkedin") },
  ];

  const footerLinks = [
    { href: "/", label: t("home") },
    { href: "#about", label: t("about") },
    { href: "#works", label: t("features") },
    { href: "#contact", label: t("contact") },
  ];

  return (
    <footer className="border-t border-border">
      <div className="max-w-[1280px] mx-auto px-6 md:px-12 py-16 md:py-24">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 md:gap-8">
          <div className="md:col-span-2">
            <Link href="/" className="font-serif text-xl font-semibold tracking-tight text-foreground">Retuned</Link>
            <p className="mt-4 text-muted-foreground text-sm max-w-xs leading-relaxed">
              AI-powered job applications that get you interviews. Tailored resumes, cover letters, and strategy in minutes.
            </p>
            <div className="flex items-center gap-3 mt-6">
              {socialLinks.map((social) => (
                <Link key={social.label} href={social.href} className="px-3 py-1.5 rounded-full border border-border text-sm text-foreground transition-colors hover:bg-muted" aria-label={social.label}>
                  {social.label}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-4">{t("pages_heading")}</h4>
            <ul className="space-y-3">
              {footerLinks.map((link) => (
                <li key={link.label}><Link href={link.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">{link.label}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-4">{t("stay_updated_heading")}</h4>
            <p className="text-sm text-muted-foreground mb-4">{t("stay_updated_body")}</p>
            <form className="flex flex-col gap-3">
              <input type="email" placeholder={t("email_placeholder")} className="rt-input text-sm" />
              <button type="submit" className="rt-btn text-sm">
                {t("subscribe")}
              </button>
            </form>
          </div>
        </div>
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mt-16 pt-8 border-t border-border">
          <p className="text-xs text-muted-foreground">{t("copyright", { year: new Date().getFullYear() })}</p>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="text-xs text-muted-foreground hover:text-foreground transition-colors">{t("privacy_policy")}</Link>
            <Link href="/terms" className="text-xs text-muted-foreground hover:text-foreground transition-colors">{t("terms_of_service")}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
