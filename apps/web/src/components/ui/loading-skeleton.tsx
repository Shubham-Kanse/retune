export function LoadingSkeleton() {
  return (
    <div
      className="[--shimmer-duration:1.5s]"
      style={
        {
          "--shimmer-duration": "1.5s",
        } as React.CSSProperties
      }
    >
      <div className="space-y-6">
        <div className="h-8 w-1/3 overflow-hidden relative bg-muted">
          <div className="absolute inset-0 shimmer-sweep" />
        </div>
        <div className="space-y-3">
          <div className="h-4 w-full overflow-hidden relative bg-muted">
            <div className="absolute inset-0 shimmer-sweep" />
          </div>
          <div className="h-4 w-3/4 overflow-hidden relative bg-muted">
            <div className="absolute inset-0 shimmer-sweep" style={{ animationDelay: "0.15s" }} />
          </div>
          <div className="h-4 w-1/2 overflow-hidden relative bg-muted">
            <div className="absolute inset-0 shimmer-sweep" style={{ animationDelay: "0.3s" }} />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-32 overflow-hidden relative bg-muted">
              <div
                className="absolute inset-0 shimmer-sweep"
                style={{ animationDelay: `${i * 0.1}s` }}
              />
            </div>
          ))}
        </div>
      </div>
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .shimmer-sweep {
          background: linear-gradient(
            90deg,
            transparent 0%,
            hsl(var(--muted-foreground) / 0.08) 40%,
            hsl(var(--muted-foreground) / 0.12) 50%,
            hsl(var(--muted-foreground) / 0.08) 60%,
            transparent 100%
          );
          animation: shimmer var(--shimmer-duration, 1.5s) ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
