import { createRequire } from "node:module";
import mammoth from "mammoth";

// `pdf-parse` ships as CJS only and re-exports a constructor that depends on a
// runtime side-effect bundled with the .cjs entry. `import` in ESM hits a
// resolution edge case that some bundlers/tsx versions don't handle, so we
// resolve it via `createRequire` to work uniformly in Next.js dev, prod, and
// standalone tsx scripts.
const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse") as {
  PDFParse: new (opts: { data: Uint8Array }) => { getText(): Promise<{ text: string }>; destroy(): Promise<void> };
};

export async function extractDocumentText(params: {
  filename: string;
  mediaType: string;
  buffer: Buffer;
}): Promise<string> {
  const name = params.filename.toLowerCase();

  try {
    if (name.endsWith(".pdf") || params.mediaType === "application/pdf") {
      const parser = new PDFParse({ data: new Uint8Array(params.buffer) });
      try {
        const result = await parser.getText();
        return (result.text ?? "").trim();
      } finally {
        await parser.destroy();
      }
    }

    if (
      name.endsWith(".docx") ||
      params.mediaType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const result = await mammoth.extractRawText({ buffer: params.buffer });
      return (result.value ?? "").trim();
    }
  } catch (error) {
    console.warn("[profile-domain] text extraction failed", error);
  }

  return "";
}
