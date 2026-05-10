// Migration SQL is loaded lazily by migrator.ts (pglite only).
// This file is kept for backward-compat imports but exports nothing at module load time
// to avoid crashing on Vercel where SQL files are not bundled.
export const MIGRATIONS: ReadonlyArray<{ name: string; sql: string }> = [];
