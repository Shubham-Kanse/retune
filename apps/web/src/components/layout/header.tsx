"use client";

import { LogOut, Plus, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Applications" },
  { href: "/profile", label: "Profile" },
  { href: "/settings/voice", label: "Voice" },
];

function RetunedLogoMark({ size = 20 }: { size?: number }) {
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
        <rect key={i} x={x} y={y} width={2} height={2} fill="#1B3028" />
      ))}
    </svg>
  );
}

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  return (
    <header
      className="sticky top-0 z-50 bg-[rgba(242,237,227,0.88)] backdrop-blur-md border-b border-[rgba(26,26,26,0.08)]"
      style={{ height: 56 }}
    >
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-6">
        {/* Logo + nav */}
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="flex items-center gap-2 group">
            <RetunedLogoMark size={20} />
            <span
              className="text-[0.9375rem] font-bold text-[#1a1a1a] tracking-tight"
              style={{ letterSpacing: "-0.02em", fontFamily: "'Lora', Georgia, serif" }}
            >
              retune
            </span>
          </Link>

          {/* Nav links — pill group like standout.work */}
          <nav className="hidden md:flex items-center gap-1 bg-[rgba(26,26,26,0.05)] rounded-full px-1 py-1">
            {NAV.map((item) => {
              const active = pathname?.startsWith(item.href) ?? false;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3.5 py-1.5 text-[0.8125rem] font-medium rounded-full transition-all ${
                    active
                      ? "bg-white text-[#1a1a1a] shadow-sm"
                      : "text-[#6b6b5b] hover:text-[#1a1a1a] hover:bg-white/60"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-3">
          <Link href="/generate/new" className="rt-btn !py-2 !px-4 !text-[0.8125rem]">
            <Plus className="h-3.5 w-3.5" />
            New application
          </Link>

          <div className="w-px h-4 bg-[rgba(26,26,26,0.12)]" />

          <Link
            href="/profile"
            aria-label="Profile"
            className="p-1.5 rounded-full text-[#6b6b5b] hover:text-[#1a1a1a] hover:bg-[rgba(26,26,26,0.06)] transition-all"
          >
            <User className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Sign out"
            className="p-1.5 rounded-full text-[#6b6b5b] hover:text-[#1a1a1a] hover:bg-[rgba(26,26,26,0.06)] transition-all"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
