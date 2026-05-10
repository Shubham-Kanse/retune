"use client";

import { ChevronRight, FileText, Home, Settings, Sparkles, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: Home, color: "text-[#ff8c42]" },
  { href: "/generate/new", label: "Generate", icon: Sparkles, color: "text-[#b84ed1]" },
  { href: "/applications", label: "Applications", icon: FileText, color: "text-[#00d4d4]" },
  { href: "/profile", label: "Profile", icon: User, color: "text-[#ff5555]" },
  { href: "/settings", label: "Settings", icon: Settings, color: "text-[#5fc3ff]" },
];

const AVATARS = [
  "🧑‍💻",
  "🦊",
  "🐻‍❄️",
  "🌵",
  "🍄",
  "🪴",
  "🎧",
  "🧩",
  "🪐",
  "🐝",
  "🦉",
  "🐙",
  "🌸",
  "🍋",
  "🎨",
  "🚀",
];

function RetunedLogoMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="3" y="15" width="2" height="2" fill="currentColor" />
      <rect x="3" y="13" width="2" height="2" fill="currentColor" />
      <rect x="3" y="11" width="2" height="2" fill="currentColor" />
      <rect x="3" y="9" width="2" height="2" fill="currentColor" />
      <rect x="3" y="7" width="2" height="2" fill="currentColor" />
      <rect x="3" y="5" width="2" height="2" fill="currentColor" />
      <rect x="5" y="3" width="2" height="2" fill="currentColor" />
      <rect x="7" y="3" width="2" height="2" fill="currentColor" />
      <rect x="9" y="3" width="2" height="2" fill="currentColor" />
      <rect x="11" y="5" width="2" height="2" fill="currentColor" />
      <rect x="11" y="7" width="2" height="2" fill="currentColor" />
      <rect x="11" y="15" width="2" height="2" fill="currentColor" />
      <rect x="9" y="13" width="2" height="2" fill="currentColor" />
      <rect x="13" y="13" width="2" height="2" fill="currentColor" />
      <rect x="7" y="11" width="2" height="2" fill="currentColor" />
      <rect x="15" y="11" width="2" height="2" fill="currentColor" />
    </svg>
  );
}

function AvatarPicker({
  current,
  onSelect,
}: { current: string; onSelect: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-10 h-10 rounded-full bg-[#f0ede8] flex items-center justify-center text-xl select-none hover:bg-[#e5e2dd] transition-colors cursor-pointer"
      >
        {current}
      </button>
      {open && (
        <div className="absolute top-12 left-0 z-50 bg-white border border-[#e5e2dd] rounded-xl shadow-lg p-2 flex gap-1 flex-wrap w-[200px] animate-in fade-in zoom-in-95 duration-150">
          {AVATARS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onSelect(emoji);
                setOpen(false);
              }}
              className={`w-8 h-8 rounded-lg flex items-center justify-center text-base hover:bg-[#f0ede8] transition-colors ${
                current === emoji ? "bg-[#d4f5e0] ring-1 ring-[#2d8a5e]" : ""
              }`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AuthSidebar({
  userName,
  userEmail,
}: {
  userName: string | null;
  userEmail: string;
}) {
  const pathname = usePathname();
  const firstName = (userName?.split(" ")[0] ?? userEmail.split("@")[0]) || "there";

  const defaultAvatar = AVATARS[firstName.charCodeAt(0) % AVATARS.length] ?? "🧑‍💻";
  const [avatar, setAvatar] = useState(defaultAvatar);

  useEffect(() => {
    const saved = localStorage.getItem("retune-avatar");
    if (saved) setAvatar(saved);
  }, []);

  function handleAvatarSelect(emoji: string) {
    setAvatar(emoji);
    localStorage.setItem("retune-avatar", emoji);
  }

  return (
    <aside className="w-[240px] shrink-0 flex flex-col h-screen sticky top-0">
      {/* User header */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <AvatarPicker current={avatar} onSelect={handleAvatarSelect} />
          <div>
            <p className="font-serif text-lg tracking-tight text-[#1a1a1a]">Hey {firstName}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-2">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : (pathname?.startsWith(item.href) ?? false);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all mb-0.5 group ${
                active
                  ? "bg-[#f0ede8] text-[#1a1a1a] font-medium"
                  : "text-[#8a8580] hover:bg-[#f0ede8] hover:text-[#1a1a1a]"
              }`}
            >
              <item.icon
                className={`w-4 h-4 ${item.color} group-hover:animate-[iconShine_1.2s_ease-in-out]`}
              />
              <span className="flex-1">{item.label}</span>
              <ChevronRight className="w-3.5 h-3.5 opacity-40 group-hover:opacity-70 transition-opacity" />
            </Link>
          );
        })}
      </nav>

      {/* Bottom brand bar */}
      <div className="px-3 pb-4">
        <div className="flex items-center gap-3 px-3 py-3 bg-[#f0ede8] rounded-lg">
          <div className="w-8 h-8 rounded-full bg-[#2d8a5e] flex items-center justify-center text-white">
            <RetunedLogoMark />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-serif text-lg tracking-tight text-[#1a1a1a]">Retuned</p>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-[#6b6b6b]" />
        </div>
      </div>
    </aside>
  );
}
