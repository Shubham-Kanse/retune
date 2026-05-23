/**
 * Prompt-file loader (Charter 09 Epic 01).
 *
 * Reads markdown prompt files with frontmatter:
 *
 *   ---
 *   name: bullet-composer.system
 *   version: 1
 *   model_hint: smart
 *   ---
 *   <body...>
 *
 * Returns a PromptRecord ready for `register()`. Designed for Node
 * (tsx --test, Node runtime). Not for browser use — the agent runs
 * server-side, so this is fine.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PromptRecord } from "./registry";

interface LoadedPrompt extends PromptRecord {
  charter?: string;
}

/**
 * Parse a markdown file with YAML-ish frontmatter into a PromptRecord.
 * Frontmatter parser is intentionally tiny — we only need name, version,
 * model_hint, charter.
 */
function parseFrontmatter(raw: string): {
  meta: Record<string, string>;
  body: string;
} {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(raw);
  if (!match) {
    throw new Error("Prompt file missing --- frontmatter block");
  }
  const meta: Record<string, string> = {};
  const frontmatterBody = match[1] ?? "";
  for (const line of frontmatterBody.split("\n")) {
    const m = /^(\w+):\s*(.*)$/.exec(line.trim());
    if (m?.[1] && m[2] !== undefined) {
      meta[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
  }
  const body = raw.slice(match[0].length).trim();
  return { meta, body };
}

/**
 * Load a prompt file relative to this module's directory.
 * `relativePath` is something like `bullet-composer.system.md`.
 */
export function loadPromptFile(relativePath: string): LoadedPrompt {
  // tsx + Node ESM: __dirname doesn't exist; derive from import.meta.url.
  // The .md files live alongside specialists at ../specialists/prompts/.
  const here = dirname(fileURLToPath(import.meta.url));
  const fullPath = resolve(here, "..", "specialists", "prompts", relativePath);
  const raw = readFileSync(fullPath, "utf-8");
  const { meta, body } = parseFrontmatter(raw);
  if (!meta.name) throw new Error(`${relativePath} missing required frontmatter: name`);
  if (!meta.version) throw new Error(`${relativePath} missing required frontmatter: version`);
  const version = Number.parseInt(meta.version, 10);
  if (!Number.isFinite(version)) {
    throw new Error(`${relativePath} version is not numeric: ${meta.version}`);
  }
  return {
    name: meta.name,
    version,
    model_hint: (meta.model_hint as PromptRecord["model_hint"]) ?? undefined,
    charter: meta.charter,
    body,
  };
}
