// Onboarding V2 — Upload Debouncing
//
// When a user rapidly submits multiple files (e.g. drag-drop a file then
// immediately drop a second), we need to abort the in-flight extraction and
// LLM calls for the first one so the latest upload "wins". We track an
// AbortController per userId in module-level state.
//
// This module-level Map is intentional: it lives for the lifetime of the
// Next.js server worker and serves as a per-user singleton for in-flight
// upload work. Across multiple workers we accept the rare race; the user
// will simply see two parallel completions.

const inFlightControllers = new Map<string, AbortController>();

/**
 * Begin a new upload for `userId`. Aborts any prior in-flight controller
 * for the same user and returns a fresh AbortSignal for the new work.
 */
export function beginUpload(userId: string): AbortSignal {
  const previous = inFlightControllers.get(userId);
  if (previous) {
    try {
      previous.abort();
    } catch {
      /* noop */
    }
  }
  const controller = new AbortController();
  inFlightControllers.set(userId, controller);
  return controller.signal;
}

/**
 * Mark the in-flight upload for `userId` as complete. Safe to call multiple
 * times — only matches the latest controller.
 */
export function endUpload(userId: string, signal: AbortSignal | null): void {
  const current = inFlightControllers.get(userId);
  if (!current) return;
  if (signal && current.signal !== signal) return;
  inFlightControllers.delete(userId);
}

/** True if the upload for `userId` was aborted (i.e. superseded). */
export function isUploadAborted(signal: AbortSignal | null): boolean {
  return Boolean(signal?.aborted);
}
