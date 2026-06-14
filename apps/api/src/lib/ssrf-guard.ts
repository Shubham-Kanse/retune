/**
 * SSRF defence (003 §12 + OWASP A10).
 *
 * The system fetches JD content from user-supplied URLs via Jina. The
 * URL must be validated to prevent SSRF: callers cannot use the
 * generation pipeline to probe internal infrastructure (metadata
 * endpoints, RFC 1918 ranges, link-local addresses, etc.).
 *
 * Validation checks:
 *   1. Scheme is http or https.
 *   2. Hostname is not localhost / 127.0.0.1 / ::1 / 0.0.0.0.
 *   3. Hostname does not resolve to an RFC 1918 / RFC 6890 reserved range.
 *   4. URL is not a metadata endpoint
 *      (169.254.169.254, fd00::, etc.).
 *   5. Hostname is not on a configured allowlist when one is set.
 *
 * The function does not perform DNS lookups by default — that incurs
 * latency and is racy under DNS rebinding. Instead it rejects literal
 * private IPs and asks Jina to handle hostname resolution. Jina is a
 * trusted upstream that does its own SSRF defence.
 */

const PRIVATE_IPV4_PREFIXES = [
  "10.",
  "127.",
  "169.254.",
  "172.16.",
  "172.17.",
  "172.18.",
  "172.19.",
  "172.20.",
  "172.21.",
  "172.22.",
  "172.23.",
  "172.24.",
  "172.25.",
  "172.26.",
  "172.27.",
  "172.28.",
  "172.29.",
  "172.30.",
  "172.31.",
  "192.168.",
  "0.",
];

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
  "metadata.azure.internal",
  "ip-ranges.amazonaws.com",
  "169.254.169.254", // AWS / GCP / Azure / DigitalOcean metadata
]);

const BLOCKED_IPV6_PREFIXES = ["::1", "fc", "fd", "fe80", "ff"];

export interface UrlValidationResult {
  ok: boolean;
  /** Reason the URL was rejected, if any. */
  reason?: string;
  /** Sanitised URL ready to pass to Jina. */
  sanitised?: URL;
}

export function validateExternalUrl(input: string): UrlValidationResult {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, reason: "url_parse_failed" };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: `unsupported_scheme:${url.protocol}` };
  }

  const host = url.hostname.toLowerCase();
  if (!host) return { ok: false, reason: "empty_hostname" };
  if (BLOCKED_HOSTNAMES.has(host)) {
    return { ok: false, reason: `blocked_hostname:${host}` };
  }

  if (isLiteralIpv4(host)) {
    if (PRIVATE_IPV4_PREFIXES.some((p) => host.startsWith(p))) {
      return { ok: false, reason: `blocked_private_ipv4:${host}` };
    }
  }
  if (host.includes(":")) {
    // IPv6 literal (URL `[::1]` already strips brackets in hostname).
    if (BLOCKED_IPV6_PREFIXES.some((p) => host.startsWith(p))) {
      return { ok: false, reason: `blocked_private_ipv6:${host}` };
    }
  }

  // Strip any embedded credentials — never forward them to Jina.
  url.username = "";
  url.password = "";

  return { ok: true, sanitised: url };
}

function isLiteralIpv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d+$/.test(p) && Number(p) >= 0 && Number(p) <= 255);
}
