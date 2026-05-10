import type { ResumeDocument } from "../schemas";

export interface VoiceAuthenticityResult {
  passed: boolean;
  aiDetectionScore: number; // 0-100: 0=likely AI, 100=likely human
  issues: Array<{
    type: "ai_signal" | "structure_warning" | "authenticity";
    message: string;
    location: string;
    fix: string;
  }>;
}

export function authenticateVoice(
  resume: ResumeDocument,
  candidateVoiceNotes?: string,
): VoiceAuthenticityResult {
  const issues: VoiceAuthenticityResult["issues"] = [];
  let aiSignalCount = 0;

  const markdown = resume.markdownContent;
  const bullets = resume.experience.flatMap((exp) => exp.bullets.map((b) => b.text));

  // AI DETECTION PATTERNS (from research: 77% of employers screen for these)

  // 1. Overly formal, perfect grammar (AI signal)
  const formalPatterns = [
    /\bspearheaded\b/gi,
    /\bsynergy\b/gi,
    /\bleverag(e|ing)\b/gi,
    /\bdriven\b/gi,
    /\bpassionat/gi,
    /\bproven track record\b/gi,
    /\bresults-driven\b/gi,
    /\benhanced\b/gi,
    /\boptimized\b/gi,
    /\bstreamlined\b/gi,
  ];

  for (const pattern of formalPatterns) {
    const matches = markdown.match(pattern) || [];
    if (matches.length > 0) {
      aiSignalCount += matches.length;
      issues.push({
        type: "ai_signal",
        message: `Generic buzzword detected: "${matches[0]}" — AI resume writing signal`,
        location: `Used ${matches.length}x in resume`,
        fix: `Replace with specific action: Instead of "optimized," say "Reduced latency from 500ms to 150ms"`,
      });
    }
  }

  // 2. Uniform sentence structure (AI signal)
  // Check if all bullets start with action verb (suspicious uniformity)
  const actionVerbPattern = /^(improved|increased|developed|created|built|led|managed|designed)/i;
  const bulletsWithVerb = bullets.filter((b) => actionVerbPattern.test(b)).length;
  const uniformity = (bulletsWithVerb / Math.max(1, bullets.length)) * 100;

  if (uniformity > 85) {
    aiSignalCount += 5;
    issues.push({
      type: "ai_signal",
      message: `Uniform sentence structure (${Math.round(uniformity)}% start with action verb) — AI pattern`,
      location: "Work Experience section",
      fix: "Vary structure: Start 50% with verbs, 30% with context, 20% with outcome. Mix CAR (Context-Action-Result) with PAR (Problem-Action-Result)",
    });
  }

  // 3. No personality or asymmetrical details (AI signal)
  const hasSpecificNumbers = /\b\d{3,}\b/.test(markdown); // 3+ digit numbers (specific data)
  const hasNamedTools = /\b(React|Python|AWS|PostgreSQL|Kubernetes|Docker)\b/.test(markdown); // specific tech
  const hasContext = /\b(client|team|department|company|org|division)\b/i.test(markdown);

  if (!hasSpecificNumbers || !hasNamedTools) {
    aiSignalCount += 3;
    issues.push({
      type: "authenticity",
      message: "Missing specific, asymmetrical details (exact numbers, named tools, context)",
      location: "Throughout resume",
      fix: 'Add specificity: "Improved from $847K to $1.203M" (not "20%"), "Built in React 18 with Postgres," "For 3 enterprise clients"',
    });
  }

  // 4. Round numbers only (77% of candidates with only round numbers score as AI)
  const roundMetrics = markdown.match(/\b\d0%\b/g) || [];
  const totalMetrics = markdown.match(/\d+%\b/g) || [];

  if (roundMetrics.length > 0 && roundMetrics.length === totalMetrics.length) {
    aiSignalCount += 4;
    issues.push({
      type: "ai_signal",
      message: `All metrics are round numbers (${roundMetrics.join(", ")}) — hiring managers see this as guessing`,
      location: "Metrics throughout",
      fix: "Use asymmetrical numbers: 18% → 12%, not just 20%. $847K → $1.203M, not $1M. Specific implies you measured it.",
    });
  }

  // 5. No gaps or weaknesses acknowledged (AI tries to be perfect)
  const hasVoiceNotes = candidateVoiceNotes && candidateVoiceNotes.length > 50;
  if (!hasVoiceNotes) {
    aiSignalCount += 2;
    issues.push({
      type: "authenticity",
      message: "No voice notes or personality in resume",
      location: "Overall voice",
      fix: "Add personal context: Why did you change roles? What's your unique perspective? Voice notes help preserve authenticity.",
    });
  }

  // 6. Statistical smoothness (AI signal)
  // Check for too-perfect sentence lengths
  const sentences = markdown.split(/[.!?]+/).filter((s) => s.trim().length > 10);
  const avgLength = sentences.reduce((sum, s) => sum + s.length, 0) / Math.max(1, sentences.length);
  const variances = sentences.map((s) => Math.pow(s.length - avgLength, 2));
  const stdDev = Math.sqrt(
    variances.reduce((sum, v) => sum + v, 0) / Math.max(1, variances.length),
  );

  if (stdDev < 15) {
    // Low variance = AI pattern
    aiSignalCount += 3;
    issues.push({
      type: "ai_signal",
      message: "Sentence structure is too uniform (statistical smoothness — AI indicator)",
      location: "Bullet points",
      fix: "Vary length: Short punchy (5 words), medium (15 words), long detailed (30+ words). Mix structures.",
    });
  }

  // 7. Exact match to known AI resume templates
  const templatePatterns = [
    /Led a cross-functional team/gi,
    /Drove innovation and efficiency/gi,
    /Implemented best practices/gi,
    /Collaborated with stakeholders/gi,
  ];

  for (const pattern of templatePatterns) {
    if (pattern.test(markdown)) {
      aiSignalCount += 2;
      issues.push({
        type: "ai_signal",
        message: `Template phrase detected: "${pattern.source.split("/")[1]}" — common in AI-generated resumes`,
        location: "Work Experience",
        fix: "Replace with specific action: What exactly did you implement? Who were the stakeholders? What was the outcome?",
      });
    }
  }

  // Calculate AI detection score
  const maxSignals = 50; // Maximum possible signals
  const aiDetectionScore = Math.max(0, 100 - (aiSignalCount / maxSignals) * 100);

  const passed = aiDetectionScore >= 75 && issues.length < 3;

  return {
    passed,
    aiDetectionScore,
    issues,
  };
}
