export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-[#e5e2dd] rounded ${className ?? ""}`}
      aria-hidden="true"
    />
  );
}

// Shared page wrapper — matches all real pages
function PageShell({ children }: { children: React.ReactNode }) {
  return <div className="w-full max-w-4xl px-10 md:px-16 py-12">{children}</div>;
}

// Shared header — matches rt-label + font-serif h1 pattern
function HeaderSkeleton() {
  return (
    <div className="mb-12">
      <Skeleton className="h-3 w-16 mb-3 rounded-full" />
      <Skeleton className="h-14 w-56 rounded-lg" />
    </div>
  );
}

export function DashboardCardSkeleton() {
  return (
    <div className="relative flex flex-col rounded-3xl border border-[#e0ddd9] bg-white/90 p-8 min-h-[220px] overflow-hidden">
      <div className="w-9 h-9 rounded-full bg-[#f0ede8]" />
      <div className="mt-6 flex-1">
        <Skeleton className="h-7 w-32 mb-2 rounded-lg" />
        <Skeleton className="h-4 w-24 mb-1 rounded" />
        <Skeleton className="h-3 w-40 rounded" />
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <PageShell>
      <HeaderSkeleton />
      <div className="grid grid-cols-2 gap-4">
        <DashboardCardSkeleton />
        <DashboardCardSkeleton />
        <DashboardCardSkeleton />
        <DashboardCardSkeleton />
      </div>
    </PageShell>
  );
}

export function SettingsSkeleton() {
  return (
    <PageShell>
      <HeaderSkeleton />
      {/* Main settings list */}
      <div className="rounded-3xl border border-[#e0ddd9] bg-white/90 overflow-hidden mb-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4 px-6 py-5 border-b border-[#e0ddd9] last:border-b-0">
            <div className="w-9 h-9 rounded-full bg-[#f0ede8]" />
            <Skeleton className="flex-1 h-4 w-32 rounded" />
            <div className="w-4 h-4" />
          </div>
        ))}
      </div>
      {/* Subscription card */}
      <div className="rounded-3xl border border-[#e0ddd9] bg-white/90 overflow-hidden">
        <div className="flex items-center gap-4 px-6 py-5 border-b border-[#e0ddd9]">
          <div className="w-9 h-9 rounded-full bg-[#f0ede8]" />
          <div>
            <Skeleton className="h-4 w-20 mb-1 rounded" />
            <Skeleton className="h-3 w-32 rounded" />
          </div>
        </div>
        <div className="flex items-center gap-4 px-6 py-5">
          <div className="w-9 h-9 rounded-full bg-[#f0ede8]" />
          <Skeleton className="flex-1 h-4 w-16 rounded" />
        </div>
      </div>
    </PageShell>
  );
}

export function ProfileSkeleton() {
  return (
    <PageShell>
      <HeaderSkeleton />
      {/* Progress bar */}
      <div className="mb-6 rounded-3xl border border-[#e0ddd9] bg-white/90 px-5 py-3 flex items-center gap-4">
        <div className="flex-1 h-1.5 bg-[#f0ede8] rounded-full" />
        <Skeleton className="h-3 w-12 rounded" />
      </div>
      {/* Form sections */}
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-3xl border border-[#e0ddd9] bg-white/90 p-6">
            <Skeleton className="h-5 w-32 mb-4 rounded" />
            <div className="space-y-3">
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}

export function ApplicationsSkeleton() {
  return (
    <PageShell>
      <HeaderSkeleton />
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4 p-5 rounded-3xl border border-[#e0ddd9] bg-white/90">
            <Skeleton className="h-3 w-20 rounded" />
            <div className="flex-1">
              <Skeleton className="h-4 w-48 mb-1.5 rounded" />
              <Skeleton className="h-3 w-32 rounded" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-4 w-14 rounded" />
          </div>
        ))}
      </div>
    </PageShell>
  );
}
