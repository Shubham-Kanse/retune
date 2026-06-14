"use client";

export default function GlobalError({
  error,
  reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-background text-foreground font-sans">
        <div
          className="max-w-md w-full px-6 text-center animate-in fade-in slide-in-from-bottom-2 duration-400"
          style={{ animationFillMode: "both" }}
        >
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-3">Error</p>
          <h1 className="text-xl font-normal mb-2">Something went wrong</h1>
          <p className="text-sm text-muted-foreground mb-4">
            We hit an unexpected error. Refresh the page — if it keeps happening, contact support@retuned.cv.
          </p>

          {(error.message || error.digest) && (
            <pre className="bg-muted p-4 text-xs font-mono text-left overflow-auto max-h-32 mt-4 mb-6 whitespace-pre-wrap break-words">
              {error.message ? error.message : null}
              {error.digest ? `\nError ID: ${error.digest}` : null}
            </pre>
          )}

          <div className="flex gap-3 justify-center">
            <button type="button" onClick={reset} className="rt-btn">
              Reload page
            </button>
            <button
              type="button"
              onClick={() => (window.location.href = "/dashboard")}
              className="rt-btn-ghost"
            >
              Go to dashboard
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
