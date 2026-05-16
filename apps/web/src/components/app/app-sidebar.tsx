"use client";

import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import {
  Brain,
  FileText,
  LogOut,
  Settings,
  Sparkles,
  User,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type RecentTuning = {
  id: string;
  role: string;
  company: string;
};

const workspaceItems = [
  { href: "/generate/new", label: "New tuning", icon: Sparkles, accent: true },
  { href: "/applications", label: "Applications", icon: FileText },
  { href: "/profile", label: "Career profile", icon: User },
  { href: "/brain", label: "Brain", icon: Brain },
];

const accountItems = [
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar({
  userName,
  userEmail,
}: {
  userName: string | null | undefined;
  userEmail: string;
}) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { setOpenMobile } = useSidebar();
  const [recent, setRecent] = useState<RecentTuning[]>([]);

  useEffect(() => {
    setOpenMobile(false);
  }, [pathname, setOpenMobile]);

  useEffect(() => {
    let cancelled = false;
    function load() {
      fetch("/api/brain/generations")
        .then((r) => (r.ok ? r.json() : []))
        .then((data: unknown) => {
          if (cancelled) return;
          if (!Array.isArray(data)) return;
          setRecent(
            (data as Array<{ id: string; role?: string; company?: string }>)
              .slice(0, 8)
              .map((d) => ({
                id: d.id,
                role: d.role || "Untitled role",
                company: d.company || "Unknown",
              })),
          );
        })
        .catch(() => {});
    }
    load();
    window.addEventListener("retune:generations-changed", load);
    return () => {
      cancelled = true;
      window.removeEventListener("retune:generations-changed", load);
    };
  }, []);

  async function handleSignOut() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    router.push("/login");
    router.refresh();
  }

  const initials = (userName || userEmail)
    .split(/[\s@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");

  const itemClass = (active: boolean) =>
    cn(
      "hover:bg-sidebar-accent/50 active:bg-sidebar-accent/50 hover:text-primary w-full transition-all duration-150",
      active && "text-primary bg-sidebar-accent hover:bg-sidebar-accent font-medium",
    );

  return (
    <Sidebar className="h-full border-none shadow-none">
      <SidebarContent
        className="bg-sidebar border-border relative border-r"
        style={{ scrollbarWidth: "none" }}
      >
        <div className="flex h-full flex-col pb-4 pl-0">
          <SidebarHeader className="items-start px-5 pt-6">
            <Link
              href="/generate/new"
              className="pl-2 text-sm font-medium tracking-tight text-foreground/70 hover:text-foreground transition-colors"
            >
              Retuned
            </Link>
          </SidebarHeader>

          <SidebarGroup className="border-none px-2 pt-4 md:px-5">
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {workspaceItems.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.href} className="flex">
                      <SidebarMenuButton asChild className={itemClass(active)}>
                        <Link href={item.href} className="flex items-center gap-2">
                          <Icon className="size-4 shrink-0" />
                          <span>{item.label}</span>
                          {item.accent ? (
                            <span className="ml-auto rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                              N
                            </span>
                          ) : null}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>

            <SidebarGroupLabel className="mt-6">Recent tunings</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {recent.length === 0 ? (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground/80">
                    No tunings yet
                  </p>
                ) : (
                  recent.map((t) => {
                    const href = `/generate/${t.id}`;
                    const active = pathname === href;
                    return (
                      <SidebarMenuItem key={t.id} className="flex">
                        <SidebarMenuButton asChild className={cn(itemClass(active), "h-auto py-1.5")}>
                          <Link href={href} className="flex min-w-0 flex-col items-start gap-0">
                            <span className="w-full truncate text-sm">{t.role}</span>
                            <span className="w-full truncate text-[11px] text-muted-foreground">
                              {t.company}
                            </span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })
                )}
              </SidebarMenu>
            </SidebarGroupContent>

            <SidebarGroupLabel className="mt-6">Account</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {accountItems.map((item) => {
                  const active = pathname.startsWith(item.href);
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.href} className="flex">
                      <SidebarMenuButton asChild className={itemClass(active)}>
                        <Link href={item.href} className="flex items-center gap-2">
                          <Icon className="size-4 shrink-0" />
                          {item.label}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
                <SidebarMenuItem className="flex">
                  <SidebarMenuButton
                    type="button"
                    onClick={handleSignOut}
                    className="hover:bg-sidebar-accent/50 hover:text-primary w-full transition-all"
                  >
                    <LogOut className="size-4 shrink-0" />
                    Sign out
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>

          </SidebarGroup>

          <SidebarFooter className="mt-auto px-5 pb-4">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background/50 px-2.5 py-2">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                {initials || "RT"}
              </div>
              <p className="min-w-0 flex-1 truncate text-xs font-medium leading-tight">
                {userName || userEmail}
              </p>
              <AnimatedThemeToggler className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" />
            </div>
          </SidebarFooter>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
