import { PageHeader, PageShell } from "@/components/app/page-shell";
import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  // Use <span> + `inline-block` so the skeleton is a valid descendant of <p>,
  // <a>, <button>, etc. — avoids hydration errors when used inside PageHeader.
  return (
    <span
      className={cn("inline-block animate-pulse rounded-md bg-muted align-top", className)}
      aria-hidden="true"
    />
  );
}

/* ─── Dashboard ─────────────────────────────────────────────────────────────
   Mirrors @/components/dashboard/dashboard-shell.tsx:
   centered greeting → JdPrompt card + suggestion chips → recent tunings list → 3 stat tiles. */
export function DashboardSkeleton() {
  return (
    <PageShell width="wide">
      <div className="mb-10 flex flex-col items-center gap-3 text-center">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-[420px] max-w-full" />
      </div>

      {/* JdPrompt card */}
      <div className="rounded-3xl border border-border bg-card/60 p-3 shadow-sm">
        <div className="space-y-3 p-3">
          <Skeleton className="h-[140px] w-full rounded-md" />
          <div className="flex items-center justify-between pt-2">
            <div className="flex gap-2">
              <Skeleton className="h-7 w-24 rounded-full" />
              <Skeleton className="h-7 w-28 rounded-full" />
            </div>
            <Skeleton className="size-9 rounded-full" />
          </div>
        </div>
      </div>

      {/* Suggestion chips */}
      <div className="mt-4 flex flex-wrap gap-2">
        {["w-[140px]", "w-[200px]", "w-[160px]", "w-[180px]"].map((w, i) => (
          <Skeleton key={i} className={cn("h-8 rounded-full", w)} />
        ))}
      </div>

      {/* Recent tunings */}
      <div className="mt-14">
        <div className="mb-4 flex items-end justify-between">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={cn(
                "flex items-center gap-4 px-4 py-3",
                i < 2 && "border-b border-border",
              )}
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="hidden h-3 w-14 sm:block" />
              <Skeleton className="size-4 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Stat tiles */}
      <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2 h-7 w-16" />
          </div>
        ))}
      </div>
    </PageShell>
  );
}

/* ─── Settings ──────────────────────────────────────────────────────────────
   Mirrors @/components/settings/settings-client.tsx:
   PageHeader → nav list of 5 rows → subscription card with progress + sign-out row → account info → danger zone. */
export function SettingsSkeleton() {
  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow={<Skeleton className="h-3 w-16" />}
        title={<Skeleton className="h-8 w-40" />}
        subtitle={<Skeleton className="h-3 w-72" />}
      />

      <div className="mb-4 overflow-hidden rounded-xl border border-border bg-card">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn(
              "flex items-center gap-4 px-5 py-4",
              i < 4 && "border-b border-border",
            )}
          >
            <Skeleton className="size-9 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="size-4 rounded" />
          </div>
        ))}
      </div>

      <div className="mb-4 overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-28" />
            </div>
            <Skeleton className="h-8 w-20 rounded-md" />
          </div>
          <div className="mt-4 space-y-1.5">
            <div className="flex justify-between">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-8" />
            </div>
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
        </div>
        <div className="flex items-center gap-4 px-5 py-4">
          <Skeleton className="size-9 shrink-0 rounded-lg" />
          <Skeleton className="h-3.5 w-20" />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card px-5 py-4">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-2 h-3.5 w-56" />
        <Skeleton className="mt-1.5 h-3 w-40" />
      </div>
    </PageShell>
  );
}

/* ─── Profile ───────────────────────────────────────────────────────────────
   Mirrors @/components/profile/profile-editor.tsx:
   intro header → sticky progress bar with buttons → 4 Section cards (icon header + form fields). */
export function ProfileSkeleton() {
  return (
    <PageShell width="wide">
      <header className="mb-8 flex flex-col gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-3 w-80" />
      </header>

      <div className="sticky top-2 z-30 mb-6 flex items-center justify-between gap-4 rounded-xl border border-border bg-background/85 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Skeleton className="h-1.5 flex-1 rounded-full" />
          <Skeleton className="h-3 w-10" />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className="h-8 w-16 rounded-md" />
        </div>
      </div>

      <div className="space-y-4">
        {[0, 1, 2, 3].map((i) => (
          <section key={i} className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border px-5 py-4">
              <Skeleton className="size-9 shrink-0 rounded-lg" />
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
            <div className="space-y-3 p-5">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-9 w-full rounded-md" />
                </div>
                <div className="space-y-1.5">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-9 w-full rounded-md" />
                </div>
              </div>
            </div>
          </section>
        ))}
      </div>
    </PageShell>
  );
}

/* ─── Applications ──────────────────────────────────────────────────────────
   Mirrors @/app/(auth)/applications/page.tsx:
   PageHeader with action → divided list card of rows (date · role/company · status · score · chevron). */
export function ApplicationsSkeleton() {
  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow={<Skeleton className="h-3 w-14" />}
        title={<Skeleton className="h-8 w-44" />}
        subtitle={<Skeleton className="h-3 w-80" />}
        action={<Skeleton className="h-8 w-28 rounded-md" />}
      />
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i} className="flex items-center gap-4 px-4 py-3">
            <Skeleton className="hidden h-3 w-20 sm:block" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="hidden h-3 w-14 sm:block" />
            <Skeleton className="size-4 rounded" />
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
