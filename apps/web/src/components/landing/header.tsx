"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

const navItems = [
  { href: "#works", label: "Features" },
  { href: "#about", label: "About" },
];

export function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    const el = document.querySelector(href);
    if (el) {
      const offset = el.getBoundingClientRect().top + window.pageYOffset - 80;
      window.scrollTo({ top: offset, behavior: "smooth" });
    }
    setIsMobileMenuOpen(false);
  };

  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 z-50 flex justify-center transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{
          padding: isScrolled ? "12px 16px 0" : "0",
        }}
      >
        <nav
          className="flex items-center justify-between w-full transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{
            maxWidth: isScrolled ? "420px" : "1280px",
            height: isScrolled ? "52px" : "80px",
            padding: isScrolled ? "0 16px" : "0 48px",
            borderRadius: isScrolled ? "9999px" : "0",
            background: isScrolled ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.3)",
            border: isScrolled ? "1px solid #e5e2dd" : "1px solid rgba(255,255,255,0.5)",
            boxShadow: isScrolled
              ? "0 4px 24px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)"
              : "none",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}
        >
          <Link
            href="/"
            onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            className="font-serif text-lg font-semibold tracking-tight text-foreground"
          >
            Retuned
          </Link>

          <div className="hidden md:flex items-center gap-8">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={(e) => handleNavClick(e, item.href)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </div>

          <Link href="/signup" className="hidden md:inline-flex rt-btn" style={{ fontSize: "1rem", padding: "0.35rem 1.1rem" }}>
            Join
          </Link>

          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="md:hidden p-2 -mr-2"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        </nav>
      </header>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-[#faf8f5] md:hidden">
          <div className="flex flex-col h-full p-6">
            <div className="flex items-center justify-between">
              <Link href="/" className="font-serif text-lg font-semibold tracking-tight">Retuned</Link>
              <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 -mr-2" aria-label="Close menu"><X className="w-5 h-5" /></button>
            </div>
            <nav className="flex flex-col gap-6 mt-12">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href} onClick={(e) => handleNavClick(e, item.href)} className="text-3xl font-semibold hover:text-muted-foreground transition-colors">{item.label}</Link>
              ))}
            </nav>
            <div className="mt-auto">
              <Link href="/signup" className="rt-btn w-full justify-center text-base">
                Join
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
