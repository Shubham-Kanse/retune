const MAX_FILE_BYTES = 10 * 1024 * 1024;

export class ResumeFileValidationError extends Error {
  constructor(message: string, public readonly status: number = 400) {
    super(message);
  }
}

export function assertValidResumeFile(file: File): { buffer: Buffer; lowerName: string; mediaType: string } {
  if (!file) throw new ResumeFileValidationError("No file provided", 400);
  if (file.size > MAX_FILE_BYTES) {
    throw new ResumeFileValidationError("File too large. Maximum 10MB.", 400);
  }

  const lowerName = file.name.toLowerCase();
  const isPdfExt = lowerName.endsWith(".pdf");
  const isDocxExt = lowerName.endsWith(".docx");
  if (!isPdfExt && !isDocxExt) {
    throw new ResumeFileValidationError("Only PDF and DOCX files are supported.", 400);
  }

  return {
    buffer: Buffer.alloc(0),
    lowerName,
    mediaType: isPdfExt
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
}

export async function readAndValidateResumeFile(file: File): Promise<{ buffer: Buffer; lowerName: string; mediaType: string }> {
  const { lowerName, mediaType } = assertValidResumeFile(file);
  const buffer = Buffer.from(await file.arrayBuffer());

  const isPdf = buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
  const isDocx = buffer[0] === 0x50 && buffer[1] === 0x4b;

  if (lowerName.endsWith(".pdf") && !isPdf) {
    throw new ResumeFileValidationError("File does not appear to be a valid PDF.", 400);
  }
  if (lowerName.endsWith(".docx") && !isDocx) {
    throw new ResumeFileValidationError("File does not appear to be a valid DOCX.", 400);
  }

  return { buffer, lowerName, mediaType };
}
