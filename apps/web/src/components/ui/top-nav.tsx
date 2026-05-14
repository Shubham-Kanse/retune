"use client";

import { cn } from "@/lib/utils";
import { Moon, Sun } from "lucide-react";
import { motion } from "motion/react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useEffect, useState } from "react";

// ─── Favicon pixel-art R logo ────────────────────────────────────────────────
function RetunedIcon({ size = 18 }: { size?: number }) {
  const rects: [number, number][] = [
    [3, 15],
    [3, 13],
    [3, 11],
    [3, 9],
    [3, 7],
    [3, 5],
    [5, 3],
    [7, 3],
    [9, 3],
    [11, 5],
    [11, 7],
    [11, 15],
    [9, 13],
    [13, 13],
    [7, 11],
    [15, 11],
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      {rects.map(([x, y], i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static pixel art
        <rect key={i} x={x} y={y} width={2} height={2} fill="currentColor" />
      ))}
    </svg>
  );
}

// ─── Theme toggle ─────────────────────────────────────────────────────────────
function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <button
        className="w-8 h-8 flex items-center justify-center text-[#888888]"
        aria-label="Toggle theme"
      >
        <div className="w-4 h-4" />
      </button>
    );
  }

  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label="Toggle theme"
      className="w-8 h-8 flex items-center justify-center rounded-lg text-[#888888] hover:text-[#ebebeb] dark:hover:text-[#ebebeb] hover:bg-[rgba(255,255,255,0.08)] transition-all"
    >
      {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}

// ─── Top Nav ──────────────────────────────────────────────────────────────────
export function TopNav({ className }: { className?: string }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className={cn("fixed top-4 left-1/2 -translate-x-1/2 z-50", className)}>
      <motion.nav
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", damping: 20, stiffness: 300, delay: 0.1 }}
        className={cn(
          "flex items-center gap-1 px-1.5 py-1.5 rounded-xl border transition-all duration-300",
          scrolled
            ? "bg-[rgba(17,17,17,0.92)] border-[rgba(255,255,255,0.1)] shadow-2xl backdrop-blur-xl"
            : "bg-[rgba(17,17,17,0.7)] border-[rgba(255,255,255,0.08)] shadow-lg backdrop-blur-md",
        )}
        style={{ fontFamily: "var(--font-roboto), Arial, Helvetica, sans-serif" }}
      >
        {/* ── Logo + brand name ─────────────────────────────────────────── */}
        <Link
          href="/"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[#ebebeb] hover:bg-[rgba(255,255,255,0.08)] transition-all group"
        >
          <span className="text-[#ebebeb] group-hover:text-[#ffffff] transition-colors">
            <RetunedIcon size={15} />
          </span>
          <span className="text-sm font-semibold tracking-tight text-[#ebebeb]">Retuned</span>
        </Link>

        {/* ── Divider ───────────────────────────────────────────────────── */}
        <div className="w-px h-4 bg-[rgba(255,255,255,0.1)] mx-0.5" />

        {/* ── Theme toggle ──────────────────────────────────────────────── */}
        <ThemeToggle />

        {/* ── CTA ───────────────────────────────────────────────────────── */}
        <Link
          href="/signup"
          className="px-3.5 py-1 text-sm font-bold rt-btn-dark rounded-lg"
        >
          Join
        </Link>
      </motion.nav>
    </div>
  );
}
