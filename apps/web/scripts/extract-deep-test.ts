/**
 * End-to-end extraction → normalization → career-profile validation test.
 * Mirrors EXACTLY what /api/onboarding/upload does after the AI returns.
 *
 * Run from `apps/web`:
 *   pnpm exec tsx scripts/extract-deep-test.ts
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";

// Load .env
const envFile = readFileSync(`${process.cwd()}/.env`, "utf8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) {
    const key = m[1] as string;
    const value = m[2] as string;
    if (!process.env[key]) process.env[key] = value;
  }
}

import { extractProfileFromResumeFile } from "../src/lib/profile-domain/extractors/openai-resume-extractor";
import { normalizeProfile } from "../src/lib/profile-domain/services/normalizer";

const RESUME = process.argv[2] || "/Users/shubhamkanse/JobHunt/Full-Time/Apple/Software Engineer (Java)/Shubham_Kanse_3.5yoe.pdf";

(async () => {
  const buffer = readFileSync(RESUME);
  const filename = basename(RESUME);
  console.log(`\n📄 ${filename} (${(buffer.length / 1024).toFixed(0)}KB)\n`);

  console.log("─── Stage 1: AI extraction ───");
  const t0 = Date.now();
  const result = await extractProfileFromResumeFile({
    filename,
    mediaType: "application/pdf",
    buffer,
  });
  const t1 = Date.now() - t0;
  if (!result.extracted) {
    console.error("❌ extraction failed");
    return;
  }
  console.log(`✓ AI returned in ${t1}ms`);
  const e = result.extracted as Record<string, unknown>;
  console.log(`  Top-level keys: ${Object.keys(e).join(", ")}`);

  console.log("\n─── Stage 2: Normalization (extraction → ProfileNormalized) ───");
  const t2 = Date.now();
  const normalized = normalizeProfile(result.extracted, "test@example.com", "Test User");
  const t3 = Date.now() - t2;
  console.log(`✓ Normalized in ${t3}ms`);
  console.log(`  Normalized keys: ${Object.keys(normalized).join(", ")}`);

  console.log("\n─── Stage 3: Field-by-field comparison ───");
  const cmp = (label: string, raw: unknown, norm: unknown) => {
    const rawDesc = Array.isArray(raw) ? `[${raw.length}]` : typeof raw === "string" ? JSON.stringify(raw).slice(0, 60) : String(raw);
    const normDesc = Array.isArray(norm) ? `[${norm.length}]` : typeof norm === "string" ? JSON.stringify(norm).slice(0, 60) : String(norm);
    const match = JSON.stringify(raw) === JSON.stringify(norm) ? "✓" : raw && !norm ? "⚠️ DROPPED" : raw !== norm ? "→" : "✓";
    console.log(`  ${match} ${label.padEnd(28)} extracted=${rawDesc.padEnd(30)} normalized=${normDesc}`);
  };

  cmp("fullName", e.fullName, (normalized as unknown as Record<string, unknown>).fullName);
  cmp("email", e.email, (normalized as unknown as Record<string, unknown>).email);
  cmp("phone", e.phone, (normalized as unknown as Record<string, unknown>).phone);
  cmp("location", e.location, (normalized as unknown as Record<string, unknown>).location);
  cmp("linkedin", e.linkedin, (normalized as unknown as Record<string, unknown>).linkedin);
  cmp("github", e.github, (normalized as unknown as Record<string, unknown>).github);
  cmp("portfolio", e.portfolio, (normalized as unknown as Record<string, unknown>).portfolio);
  cmp("currentTitle", e.currentTitle, (normalized as unknown as Record<string, unknown>).currentTitle);
  cmp("yearsOfExperience", e.yearsOfExperience, (normalized as unknown as Record<string, unknown>).yearsOfExperience);
  cmp("experienceLevel", e.experienceLevel, (normalized as unknown as Record<string, unknown>).experienceLevel);
  cmp("experience", e.experience, (normalized as unknown as Record<string, unknown>).experience);
  cmp("education", e.education, (normalized as unknown as Record<string, unknown>).education);
  cmp("projects", e.projects, (normalized as unknown as Record<string, unknown>).projects);
  cmp("certifications", e.certifications, (normalized as unknown as Record<string, unknown>).certifications);
  cmp("languages", e.languages, (normalized as unknown as Record<string, unknown>).languages);
  cmp("awards", e.awards, (normalized as unknown as Record<string, unknown>).awards);
  cmp("publications", e.publications, (normalized as unknown as Record<string, unknown>).publications);
  cmp("volunteering", e.volunteering, (normalized as unknown as Record<string, unknown>).volunteering);
  cmp("technicalSkills", e.technicalSkills, (normalized as unknown as Record<string, unknown>).technicalSkills);
  cmp("tools", e.tools, (normalized as unknown as Record<string, unknown>).tools);
  cmp("methodologies", e.methodologies, (normalized as unknown as Record<string, unknown>).methodologies);
  cmp("softSkills", e.softSkills, (normalized as unknown as Record<string, unknown>).softSkills);
  cmp("domainSkills", e.domainSkills, (normalized as unknown as Record<string, unknown>).domainSkills);
  cmp("professionalSkills", e.professionalSkills, (normalized as unknown as Record<string, unknown>).professionalSkills);
  cmp("summarySignals", e.summarySignals, (normalized as unknown as Record<string, unknown>).summarySignals);
  cmp("careerHighlights", e.careerHighlights, (normalized as unknown as Record<string, unknown>).careerHighlights);
  cmp("domainExperience", e.domainExperience, (normalized as unknown as Record<string, unknown>).domainExperience);
  cmp("targetRoles", e.targetRoles, (normalized as unknown as Record<string, unknown>).targetRoles);

  console.log("\n─── Stage 4: Sample experience entry ───");
  const exp0 = Array.isArray(normalized.experience) && normalized.experience.length > 0 ? normalized.experience[0] : null;
  if (exp0) {
    console.log(JSON.stringify(exp0, null, 2));
  }

  console.log("\n─── Stage 5: Sample skills ───");
  const n = normalized as unknown as Record<string, unknown>;
  console.log(`  technicalSkills (${(n.technicalSkills as string[])?.length ?? 0}):`, n.technicalSkills);
  console.log(`  tools (${(n.tools as string[])?.length ?? 0}):`, n.tools);
  console.log(`  methodologies (${(n.methodologies as string[])?.length ?? 0}):`, n.methodologies);
  console.log(`  softSkills (${(n.softSkills as string[])?.length ?? 0}):`, n.softSkills);
  console.log(`  domainSkills (${(n.domainSkills as string[])?.length ?? 0}):`, n.domainSkills);
  console.log(`  professionalSkills (${(n.professionalSkills as string[])?.length ?? 0}):`, n.professionalSkills);

  console.log(`\n✓ Total time: ${t1 + t3}ms\n`);
})();
