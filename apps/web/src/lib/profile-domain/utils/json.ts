export function parseJsonSafe<T>(raw: unknown, fallback: T): T {
  if (!raw) return fallback;
  if (typeof raw !== "string") return raw as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function stringifyCanonical(value: unknown): string {
  return JSON.stringify(value ?? [], Object.keys(value as object).sort());
}

export function stringifyJson(value: unknown): string {
  return JSON.stringify(value ?? []);
}
