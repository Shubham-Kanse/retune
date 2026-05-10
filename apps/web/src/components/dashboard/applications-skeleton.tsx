export function ApplicationsSkeleton() {
  return (
    <div className="divide-y divide-border border-y border-border animate-pulse">
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className="grid w-full gap-3 py-4 px-4 md:grid-cols-[minmax(0,1fr)_140px_120px] md:items-center"
        >
          <div className="min-w-0 space-y-1.5">
            <div className="h-4 w-32 bg-muted rounded" />
            <div className="h-3 w-24 bg-muted rounded" />
          </div>
          <div className="h-6 w-20 bg-muted rounded" />
          <div className="h-5 w-16 bg-muted rounded" />
        </div>
      ))}
    </div>
  );
}
