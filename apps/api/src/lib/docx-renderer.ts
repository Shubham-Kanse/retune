/**
 * Render a generation's `draft.bullets`/`draft.sections` into an ATS-safe
 * DOCX (and optionally PDF) using the `generate_resume.py` script that
 * already lives in `packages/agent/src/agent/`. The script handles all
 * the python-docx complexity; this module just shuttles markdown +
 * metadata to it and streams the produced file back.
 *
 * The script is locked to the agent package's path so we don't ship two
 * copies. If `python3` or `python-docx` is missing on the host we return
 * a structured error rather than a 500.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Blackboard } from "@retune/types";
import { renderResumeMarkdown } from "./result-renderer";

export type DocumentKind = "resume" | "cover_letter";
export type DocumentFormat = "docx" | "pdf";

const SCRIPT_PATH = resolve(
  process.cwd(),
  "..",
  "..",
  "packages",
  "agent",
  "src",
  "agent",
  "generate_resume.py",
);

// Fallbacks: when running the API from /apps/api the cwd ends with that path.
// Resolve relative paths from a few likely roots so we don't bind to a single
// install layout (apps/api dev, apps/api tests, repo root).
function resolveScript(): string | null {
  const candidates = [
    SCRIPT_PATH,
    resolve(__dirname, "../../../../packages/agent/src/agent/generate_resume.py"),
    resolve(process.cwd(), "packages/agent/src/agent/generate_resume.py"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

interface DocxRenderInput {
  generation_id: string;
  blackboard: Blackboard;
  kind: DocumentKind;
  format: DocumentFormat;
  /** Optional override; otherwise pulled from chosen narrative arc / candidate company. */
  company?: string;
  /** Optional candidate name override. */
  candidate?: string;
  market?: "us" | "uk";
}

export interface DocxRenderResult {
  ok: boolean;
  /** Absolute filesystem path of the rendered file when `ok`. */
  filepath?: string;
  /** Suggested download filename. */
  filename: string;
  /** Mime type for the produced file. */
  mime: string;
  /** Human-readable error when `!ok`. */
  error?: string;
}

const MIME: Record<DocumentFormat, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
};

export function renderDocument(input: DocxRenderInput): DocxRenderResult {
  const { generation_id, blackboard, kind, format } = input;
  const market = input.market ?? "us";

  const filename = `${kind === "resume" ? "Resume" : "CoverLetter"}_${generation_id.slice(0, 8)}.${format}`;
  const mime = MIME[format];

  // Source content. Resume comes from blackboard; cover letter is deferred
  // to v2.1 — return a structured 501 so the result UI can hide the link.
  let markdown: string | null = null;
  if (kind === "resume") {
    markdown = renderResumeMarkdown(blackboard);
  } else if (kind === "cover_letter") {
    markdown = (blackboard.draft as { cover_letter?: string }).cover_letter ?? null;
  }

  if (!markdown) {
    return {
      ok: false,
      filename,
      mime,
      error: kind === "cover_letter" ? "cover_letter_not_generated" : "resume_not_available",
    };
  }

  const script = resolveScript();
  if (!script) {
    return {
      ok: false,
      filename,
      mime,
      error: "render_script_missing",
    };
  }

  // Pull metadata from the blackboard. Company comes from the company
  // schema if it ran, otherwise blank — the script tolerates "" for
  // candidate, but `--company` is required.
  const company =
    input.company ?? blackboard.hypotheses.company_schema?.display_name ?? "Application";
  const candidate = input.candidate ?? "";

  // Workspace dir for this render.
  const workspace = mkdtempSync(join(tmpdir(), `retune-docx-${generation_id.slice(0, 8)}-`));
  const contentPath = join(workspace, kind === "resume" ? "resume.md" : "cover_letter.md");
  writeFileSync(contentPath, markdown, "utf-8");

  const outName = kind === "resume" ? "resume" : "cover_letter";
  const outPath = join(workspace, `${outName}.docx`);

  const args: string[] = [
    script,
    "--company",
    company,
    "--candidate",
    candidate,
    "--market",
    market,
    "--content-file",
    contentPath,
    "--output-dir",
    workspace,
    "--type",
    kind === "resume" ? "resume" : "cover-letter",
  ];
  if (format === "pdf") args.push("--pdf");

  try {
    execFileSync("python3", args, {
      encoding: "utf-8",
      stdio: "pipe",
      env: { ...process.env, WORKSPACE: workspace },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      filename,
      mime,
      error: `render_failed: ${msg.slice(0, 240)}`,
    };
  }

  const finalPath = format === "pdf" ? outPath.replace(/\.docx$/, ".pdf") : outPath;

  if (!existsSync(finalPath)) {
    return {
      ok: false,
      filename,
      mime,
      error: format === "pdf" ? "pdf_render_unavailable" : "docx_not_produced",
    };
  }

  return { ok: true, filepath: finalPath, filename, mime };
}

export function readBytes(path: string): Buffer {
  return readFileSync(path);
}
