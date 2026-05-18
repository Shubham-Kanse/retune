import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

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
      params.mediaType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const result = await mammoth.extractRawText({ buffer: params.buffer });
      return (result.value ?? "").trim();
    }
  } catch (error) {
    console.warn("[profile-domain] text extraction failed", error);
  }

  return "";
}
