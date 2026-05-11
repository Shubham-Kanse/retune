const DEFAULT_APP_URL = "https://retuned.cv";

export function resolveAppUrl(raw: string | undefined): URL {
  if (!raw) return new URL(DEFAULT_APP_URL);
  try {
    return new URL(raw);
  } catch {
    return new URL(DEFAULT_APP_URL);
  }
}

let logged = false;

export function logWebStartupDiagnostics(env: NodeJS.ProcessEnv = process.env): void {
  if (logged) return;
  logged = true;

  const raw = env.NEXT_PUBLIC_APP_URL;
  if (!raw) {
    // eslint-disable-next-line no-console
    console.warn(`[startup:web] NEXT_PUBLIC_APP_URL not set; falling back to ${DEFAULT_APP_URL}`);
    return;
  }
  try {
    // Validate URL format early so metadataBase never throws at runtime.
    // eslint-disable-next-line no-new
    new URL(raw);
  } catch {
    // eslint-disable-next-line no-console
    console.warn(
      `[startup:web] NEXT_PUBLIC_APP_URL is invalid ("${raw}"); falling back to ${DEFAULT_APP_URL}`,
    );
  }
}

