import { cpSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(root);

const pdfjsPkg = require.resolve("pdfjs-dist/package.json", {
  paths: [join(repoRoot, "apps/web")],
});
const pdfjsRoot = dirname(pdfjsPkg);
const srcWorker = join(pdfjsRoot, "build", "pdf.worker.min.mjs");
const outDir = join(repoRoot, "apps/web/public");
const outWorker = join(outDir, "pdf.worker.min.mjs");

if (!existsSync(srcWorker)) {
  throw new Error(`pdf.worker.min.mjs not found at ${srcWorker}`);
}

mkdirSync(outDir, { recursive: true });
cpSync(srcWorker, outWorker);
console.log(`Copied PDF worker to ${outWorker}`);
