import fs from 'node:fs';
import path from 'node:path';
import { extractDocumentText } from './src/lib/profile-domain/extractors/document-text-extractor';
import { extractProfileFromResumeFile } from './src/lib/profile-domain/extractors/openai-resume-extractor';

const TEST_DIR = path.resolve(process.cwd(), '../../test-data');

function mediaTypeFor(file: string): string {
  const lower = file.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return 'application/octet-stream';
}

function firstNonEmptyLine(text: string): string {
  return text.split(/\r?\n/).map((s) => s.trim()).find(Boolean) ?? '';
}

function extractExpectedFromText(text: string) {
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null;
  const linkedin = text.match(/https?:\/\/(?:www\.)?linkedin\.com\/[\w\-/?=&.%]+/i)?.[0]
    ?? text.match(/linkedin\.com\/[\w\-/?=&.%]+/i)?.[0]
    ?? null;
  const phone = text.match(/(?:\+?\d[\d\s()\-]{7,}\d)/)?.[0]?.trim() ?? null;
  const nameGuess = firstNonEmptyLine(text);
  return { email, linkedin, phone, nameGuess };
}

function compact(v: unknown): string {
  return JSON.stringify(v, null, 2);
}

async function run() {
  const files = fs
    .readdirSync(TEST_DIR)
    .filter((f) => /\.(pdf|docx)$/i.test(f))
    .sort((a, b) => a.localeCompare(b));

  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is missing');
    process.exit(1);
  }

  const results: Array<Record<string, unknown>> = [];

  for (const file of files) {
    console.log(`START `);
    const full = path.join(TEST_DIR, file);
    const buffer = fs.readFileSync(full);
    const mediaType = mediaTypeFor(file);
    const rawText = await extractDocumentText({ filename: file, mediaType, buffer });
    const expected = extractExpectedFromText(rawText);

    const start = Date.now();
    const { extracted } = await extractProfileFromResumeFile({
      filename: file,
      mediaType,
      buffer,
      existingProfile: null,
    });
    const ms = Date.now() - start;

    const extractedObj = extracted ?? {};
    const row = {
      file,
      parseMs: ms,
      rawTextChars: rawText.length,
      expected,
      extracted: {
        fullName: (extractedObj as any).fullName,
        email: (extractedObj as any).email,
        phone: (extractedObj as any).phone,
        linkedin: (extractedObj as any).linkedin,
        location: (extractedObj as any).location,
        currentTitle: (extractedObj as any).currentTitle,
        experienceLevel: (extractedObj as any).experienceLevel,
        targetRolesCount: Array.isArray((extractedObj as any).targetRoles) ? (extractedObj as any).targetRoles.length : 0,
        experienceCount: Array.isArray((extractedObj as any).experience) ? (extractedObj as any).experience.length : 0,
        educationCount: Array.isArray((extractedObj as any).education) ? (extractedObj as any).education.length : 0,
        skillsCount:
          (Array.isArray((extractedObj as any).skillsTier1) ? (extractedObj as any).skillsTier1.length : 0) +
          (Array.isArray((extractedObj as any).skillsTier2) ? (extractedObj as any).skillsTier2.length : 0) +
          (Array.isArray((extractedObj as any).skillsTier3) ? (extractedObj as any).skillsTier3.length : 0),
      },
      checks: {
        emailMatch: expected.email ? String((extractedObj as any).email || '').toLowerCase() === expected.email.toLowerCase() : null,
        linkedinPresentIfExpected: expected.linkedin ? Boolean((extractedObj as any).linkedin) : null,
        phonePresentIfExpected: expected.phone ? Boolean((extractedObj as any).phone) : null,
        hasName: Boolean((extractedObj as any).fullName),
        hasRoles: Array.isArray((extractedObj as any).targetRoles) && (extractedObj as any).targetRoles.length > 0,
      },
    };

    results.push(row);
    console.log(`DONE  in ms`);
  }

  const outPath = path.resolve(process.cwd(), '.tmp-resume-batch-check-output.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`Wrote ${outPath}`);
  for (const row of results) {
    console.log('\n' + compact(row));
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
