import { FileText, Home, type LucideIcon, Settings, Sparkles, User } from "lucide-react";

export type AuthNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  iconClass: string;
  exact?: boolean;
};

export const AUTH_NAV_ITEMS: AuthNavItem[] = [
  { href: "/dashboard", label: "Overview", icon: Home, iconClass: "text-amber-700", exact: true },
  { href: "/generate/new", label: "Generate", icon: Sparkles, iconClass: "text-violet-700" },
  { href: "/applications", label: "Applications", icon: FileText, iconClass: "text-sky-700" },
  { href: "/profile", label: "Profile", icon: User, iconClass: "text-rose-700" },
  { href: "/settings", label: "Settings", icon: Settings, iconClass: "text-emerald-700" },
];

export function isAuthNavItemActive(
  pathname: string | null | undefined,
  item: AuthNavItem,
): boolean {
  if (!pathname) return false;
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}
