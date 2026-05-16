/**
 * Real-world extraction smoke test.
 *
 * Loads N PDF resumes from disk, runs them through the EXACT same code path
 * the production /api/onboarding/upload route uses, and reports per-resume:
 *   • Wall-clock latency
 *   • Whether extraction succeeded (non-null)
 *   • Field coverage (which sections came back populated)
 *   • Any errors / null fields that should have been populated
 *
 * Run from `apps/web`:
 *   pnpm exec tsx scripts/extract-smoke-test.ts
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";

// Load .env manually (no dotenv dependency)
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

const RESUMES = [
  "/Users/shubhamkanse/JobHunt/Myao/Stripe/Komal_Andharikar_2.5yoe.pdf",
  "/Users/shubhamkanse/JobHunt/Myao/Datavant/Komal_Andharikar_2.8yoe.pdf",
  "/Users/shubhamkanse/JobHunt/Myao/Law Society/Komal_Andharikar_CV.pdf",
  "/Users/shubhamkanse/JobHunt/Myao/Reference/Resume_AkhilRane.pdf",
  "/Users/shubhamkanse/JobHunt/Reference CV/Amol_Ragit_CV.pdf",
  "/Users/shubhamkanse/JobHunt/Full-Time/Apple/Software Engineer (Java)/Shubham_Kanse_3.5yoe.pdf",
  "/Users/shubhamkanse/JobHunt/Full-Time/Stripe/SHUBHAM KANSE 3.5YOE.pdf",
  "/Users/shubhamkanse/JobHunt/Part-Time/Retail Sales Electronics/Shubham Kanse.pdf",
];

interface Outcome {
  file: string;
  bytes: number;
  ms: number;
  ok: boolean;
  error?: string;
  fields: {
    fullName: string | null;
    email: string | null;
    phone: string | null;
    location: string | null;
    currentTitle: string | null;
    experienceLevel: string | null;
    yearsOfExperience: number | null;
    experienceCount: number;
    educationCount: number;
    skillsTechnical: number;
    skillsTools: number;
    projectsCount: number;
    achievementsTotal: number;
    metricsTotal: number;
  };
  rawFirst200: string;
}

function summarize(extracted: Record<string, unknown> | null): Outcome["fields"] {
  const e = (extracted ?? {}) as Record<string, unknown>;
  const exp = Array.isArray(e.experience) ? (e.experience as Array<Record<string, unknown>>) : [];
  const edu = Array.isArray(e.education) ? (e.education as Array<Record<string, unknown>>) : [];
  const projects = Array.isArray(e.projects) ? (e.projects as Array<Record<string, unknown>>) : [];
  const arr = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  let achievementsTotal = 0;
  let metricsTotal = 0;
  for (const role of exp) {
    achievementsTotal += arr(role.achievements);
    metricsTotal += arr(role.metrics);
  }
  return {
    fullName: (e.fullName as string) ?? null,
    email: (e.email as string) ?? null,
    phone: (e.phone as string) ?? null,
    location: (e.location as string) ?? null,
    currentTitle: (e.currentTitle as string) ?? null,
    experienceLevel: (e.experienceLevel as string) ?? null,
    yearsOfExperience: typeof e.yearsOfExperience === "number" ? e.yearsOfExperience : null,
    experienceCount: exp.length,
    educationCount: edu.length,
    skillsTechnical: arr(e.technicalSkills),
    skillsTools: arr(e.tools),
    projectsCount: projects.length,
    achievementsTotal,
    metricsTotal,
  };
}

async function runOne(file: string): Promise<Outcome> {
  const buffer = readFileSync(file);
  const filename = basename(file);
  const t0 = Date.now();
  try {
    const result = await extractProfileFromResumeFile({
      filename,
      mediaType: "application/pdf",
      buffer,
    });
    const ms = Date.now() - t0;
    const ok = result.extracted !== null;
    const ex = result.extracted as Record<string, unknown> | null;
    return {
      file: filename,
      bytes: buffer.length,
      ms,
      ok,
      fields: summarize(result.extracted),
      rawFirst200: JSON.stringify({
        technicalSkills: ex?.technicalSkills,
        tools: ex?.tools,
        methodologies: ex?.methodologies,
        softSkills: ex?.softSkills,
        domainSkills: ex?.domainSkills,
        professionalSkills: ex?.professionalSkills,
      }).slice(0, 1500),
    };
  } catch (err) {
    const ms = Date.now() - t0;
    return {
      file: filename,
      bytes: buffer.length,
      ms,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      fields: summarize(null),
      rawFirst200: "",
    };
  }
}

(async () => {
  console.log(`\n=== Resume extraction smoke test (${RESUMES.length} resumes) ===\n`);
  const outcomes: Outcome[] = [];
  for (const file of RESUMES) {
    process.stdout.write(`Extracting ${basename(file)} ... `);
    const out = await runOne(file);
    outcomes.push(out);
    if (out.ok) {
      console.log(`✓ ${out.ms}ms  (${out.fields.experienceCount} jobs, ${out.fields.skillsTechnical}+${out.fields.skillsTools} skills, ${out.fields.achievementsTotal} achievements, ${out.fields.metricsTotal} metrics)`);
    } else {
      console.log(`✗ ${out.ms}ms  error: ${out.error ?? "extraction returned null"}`);
    }
  }

  console.log("\n=== Detailed Results ===\n");
  for (const o of outcomes) {
    console.log(`📄 ${o.file}  (${(o.bytes / 1024).toFixed(0)}KB, ${o.ms}ms, ${o.ok ? "OK" : "FAIL"})`);
    if (!o.ok) {
      console.log(`   ✗ ${o.error}`);
      continue;
    }
    const f = o.fields;
    console.log(`   identity: name=${JSON.stringify(f.fullName)}  email=${JSON.stringify(f.email)}  phone=${JSON.stringify(f.phone)}  location=${JSON.stringify(f.location)}`);
    console.log(`   role:     title=${JSON.stringify(f.currentTitle)}  level=${f.experienceLevel}  yoe=${f.yearsOfExperience}`);
    console.log(`   sections: experience=${f.experienceCount}  education=${f.educationCount}  projects=${f.projectsCount}`);
    console.log(`   skills:   technical=${f.skillsTechnical}  tools=${f.skillsTools}`);
    console.log(`   quality:  achievements=${f.achievementsTotal}  metrics=${f.metricsTotal}`);
  }

  console.log("\n=== Skills inspection (deep) ===\n");
  for (const o of outcomes) {
    if (!o.ok) continue;
    console.log(`📄 ${o.file}`);
    console.log(`   raw skills first 600 chars: ${o.rawFirst200}`);
  }
  console.log("\n=== Aggregate ===");
  const okCount = outcomes.filter((o) => o.ok).length;
  const avgMs = Math.round(outcomes.filter((o) => o.ok).reduce((a, b) => a + b.ms, 0) / Math.max(1, okCount));
  const minMs = Math.min(...outcomes.filter((o) => o.ok).map((o) => o.ms));
  const maxMs = Math.max(...outcomes.filter((o) => o.ok).map((o) => o.ms));
  console.log(`  Success: ${okCount}/${outcomes.length}`);
  console.log(`  Latency: avg=${avgMs}ms  min=${minMs}ms  max=${maxMs}ms`);
  const totalAchievements = outcomes.reduce((a, b) => a + b.fields.achievementsTotal, 0);
  const totalMetrics = outcomes.reduce((a, b) => a + b.fields.metricsTotal, 0);
  console.log(`  Quality: ${totalAchievements} achievements, ${totalMetrics} metrics across all resumes`);
  const missingPhone = outcomes.filter((o) => o.ok && !o.fields.phone).length;
  const missingTitle = outcomes.filter((o) => o.ok && !o.fields.currentTitle).length;
  const missingYoe = outcomes.filter((o) => o.ok && o.fields.yearsOfExperience == null).length;
  console.log(`  Gaps: ${missingPhone} missing phone, ${missingTitle} missing title, ${missingYoe} missing yoe`);
})();
