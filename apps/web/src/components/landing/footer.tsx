"use client";

import Link from "next/link";

const socialLinks = [
  { href: "#", label: "Twitter" },
  { href: "#", label: "LinkedIn" },
];

const footerLinks = [
  { href: "/", label: "Home" },
  { href: "#about", label: "About" },
  { href: "#works", label: "Features" },
  { href: "#contact", label: "Contact" },
];

export function Footer() {
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
            <h4 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-4">Pages</h4>
            <ul className="space-y-3">
              {footerLinks.map((link) => (
                <li key={link.label}><Link href={link.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">{link.label}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-4">Stay Updated</h4>
            <p className="text-sm text-muted-foreground mb-4">Get career tips and product updates.</p>
            <form className="flex flex-col gap-3">
              <input type="email" placeholder="Enter your email" className="rt-input text-sm" />
              <button type="submit" className="rt-btn text-sm">
                Subscribe
              </button>
            </form>
          </div>
        </div>
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mt-16 pt-8 border-t border-border">
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Retuned. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
