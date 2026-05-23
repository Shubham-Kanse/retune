/**
 * Offline fallback page (Charter 27 Epic 04).
 *
 * Served by the service worker when a navigation request fails and
 * we have no cached response for the requested route. Kept entirely
 * static + token-driven so it works without any client-side hydration.
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "You're offline",
  description: "Reconnect to keep working with Retune.",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 text-foreground">
      <div className="max-w-md text-center">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Offline
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">We're not connected.</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Retune needs the network to read your job description, your evidence graph, and the model
          providers. Re-establish a connection and we'll pick up where you left off.
        </p>
        <p className="mt-6 text-xs text-muted-foreground">
          Drafts you've already opened in this tab are still in memory until you close it.
        </p>
      </div>
    </main>
  );
}
