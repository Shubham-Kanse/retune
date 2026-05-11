export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-[#e5e2dd] rounded ${className ?? ""}`}
      aria-hidden="true"
    />
  );
}

export function DashboardCardSkeleton() {
  return (
    <div className="flex flex-col border border-[#e5e2dd] rounded-2xl p-6 bg-white min-h-[220px]">
      {/* Icon placeholder */}
      <div className="w-10 h-10 rounded-xl bg-[#f0ede8]" />
      
      {/* Content */}
      <div className="mt-6 flex-1">
        <Skeleton className="h-8 w-32 mb-1" /> {/* Title */}
        <Skeleton className="h-5 w-24 mb-1" /> {/* Subtitle */}
        <Skeleton className="h-4 w-40" /> {/* Description */}
      </div>
      
      {/* Chevron placeholder */}
      <div className="mt-4 h-4 w-4" />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="px-10 py-12 max-w-3xl mx-auto">
      <Skeleton className="h-12 w-64 mb-1" />
      <Skeleton className="h-4 w-48 mb-12" />
      <div className="grid grid-cols-2 gap-4">
        <DashboardCardSkeleton />
        <DashboardCardSkeleton />
        <DashboardCardSkeleton />
        <DashboardCardSkeleton />
      </div>
    </div>
  );
}

export function SettingsSkeleton() {
  return (
    <div className="min-h-screen flex items-start justify-center pt-16 px-6">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#f0ede8]" />
            <div>
              <Skeleton className="h-3 w-16 mb-1" />
              <Skeleton className="h-8 w-24" />
            </div>
          </div>
        </div>

        {/* Main settings list */}
        <div className="bg-white border border-[#e5e2dd] rounded-2xl overflow-hidden mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex items-center gap-4 px-6 py-5 border-b border-[#e5e2dd] last:border-b-0"
            >
              <div className="w-9 h-9 rounded-full bg-[#f0ede8]" />
              <Skeleton className="flex-1 h-5 w-32" />
              <div className="w-4 h-4" />
            </div>
          ))}
        </div>

        {/* Subscription card */}
        <div className="bg-white border border-[#e5e2dd] rounded-2xl overflow-hidden mb-6">
          <div className="px-6 py-5 border-b border-[#e5e2dd]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-full bg-[#f0ede8]" />
                <div>
                  <Skeleton className="h-5 w-20 mb-1" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </div>
              <Skeleton className="h-8 w-24 rounded-full" />
            </div>
          </div>
          <div className="px-6 py-4">
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>

        {/* Account info */}
        <div className="mt-8 space-y-3">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="px-10 py-12 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#f0ede8]" />
          <div>
            <Skeleton className="h-3 w-20 mb-1" />
            <Skeleton className="h-8 w-16" />
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-6 border border-[#e5e2dd] rounded-2xl bg-white px-5 py-3 flex items-center justify-between gap-4">
        <div className="flex-1 h-1.5 bg-[#f0ede8] rounded-full" />
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-8 w-20 rounded-full" />
      </div>

      {/* Form sections */}
      <div className="space-y-6">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="border border-[#e5e2dd] rounded-2xl p-6 bg-white">
            <div className="flex items-center justify-between mb-4">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-16" />
            </div>
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ApplicationsSkeleton() {
  return (
    <div className="px-10 py-12 max-w-5xl mx-auto">
      <Skeleton className="h-10 w-48 mb-8" />
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="border border-[#e5e2dd] rounded-xl p-6 bg-white">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <Skeleton className="h-6 w-48 mb-2" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-8 w-20 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
