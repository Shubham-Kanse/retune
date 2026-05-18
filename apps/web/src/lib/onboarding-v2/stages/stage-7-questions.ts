// Onboarding V2 — Stage 7: Resume Generation Questions

import { callLLM } from "../llm/calls";
import { safeParseLLMJson } from "../llm/guardrails";
import { ANSWER_EVALUATION_SYSTEM_PROMPT } from "../llm/prompts";
import { updateSession } from "../session";
import type { Confidence, OnboardingV2Session, QuestionMap } from "../types";
import { generateRoleChips } from "./stage-3-inference";

export interface QuestionPresentation {
  field: keyof QuestionMap;
  prompt: string;
  chips: Array<{ label: string; value: string }> | null;
  freeTextAllowed: boolean;
  multiSelect: boolean;
  skipAllowed: boolean;
}

export interface AnswerResult {
  accepted: boolean;
  followUp?: string;
  nextQuestion: QuestionPresentation | null;
  stageComplete: boolean;
}

interface AnswerEvaluation {
  answer_valid: boolean;
  answer_actionable: boolean;
  extracted_value?: string | null;
  confidence?: Confidence;
  follow_up_question?: string | null;
  additional_fields_collected?: Record<string, { value?: string; confidence?: Confidence }>;
}

const QUESTION_ORDER: Array<keyof QuestionMap> = [
  "target_role",
  "target_role_specificity",
  "underrepresented_skills",
  "deemphasis_preferences",
  "resume_frame",
  "career_transition_framing",
  "gap_handling",
  "achievement_depth",
];

export function getNextQuestion(session: OnboardingV2Session): QuestionPresentation | null {
  for (const field of QUESTION_ORDER) {
    if (session.question_map[field].value !== null) continue;
    if (!isQuestionActive(field, session)) continue;
    return buildQuestion(field, session);
  }
  return null;
}

function isQuestionActive(field: keyof QuestionMap, session: OnboardingV2Session): boolean {
  switch (field) {
    case "target_role_specificity":
      // Activated only if target_role was answered with medium/low confidence
      return (
        session.question_map.target_role.value !== null &&
        session.question_map.target_role.confidence !== "high"
      );
    case "career_transition_framing":
      return session.inference.career_transition_detected;
    case "gap_handling":
      return session.completeness.employment_gaps_present;
    case "achievement_depth":
      return !session.completeness.has_quantified_achievements;
    default:
      return true;
  }
}

function buildQuestion(
  field: keyof QuestionMap,
  session: OnboardingV2Session,
): QuestionPresentation {
  switch (field) {
    case "target_role":
      return {
        field,
        prompt:
          "What kind of role is this resume being targeted at? You can be specific — a job title, a type of team, or a type of company works.",
        chips: generateRoleChips(session.confirmation.confirmed_role_family).map((c) => ({
          label: c,
          value: c,
        })),
        freeTextAllowed: true,
        multiSelect: false,
        skipAllowed: false,
      };
    case "target_role_specificity":
      return {
        field,
        prompt: `When you think about the kind of ${session.question_map.target_role.value} role you're targeting — is there a particular focus area, company size, or type of work that matters most to you?`,
        chips: inferRoleSpecificityChips(session),
        freeTextAllowed: true,
        multiSelect: false,
        skipAllowed: true,
      };
    case "underrepresented_skills":
      return {
        field,
        prompt:
          "Is there anything you're good at or have worked on that you feel isn't well represented in your resume right now?",
        chips: [
          { label: "Side projects", value: "side_projects" },
          { label: "Open source contributions", value: "open_source" },
          { label: "Leadership experience", value: "leadership" },
          { label: "Specific technologies", value: "specific_tech" },
          { label: "Domain knowledge", value: "domain_knowledge" },
          { label: "Nothing — it's all there", value: "none" },
        ],
        freeTextAllowed: true,
        multiSelect: true,
        skipAllowed: false,
      };
    case "deemphasis_preferences":
      return {
        field,
        prompt:
          "Is there anything in your background you'd prefer to keep minimal or not lead with in this resume?",
        chips: [
          { label: "Older roles (5+ years ago)", value: "older_roles" },
          { label: "Academic work", value: "academic" },
          { label: "A specific job or company", value: "specific_job" },
          { label: "A particular skill or tool", value: "specific_skill" },
          { label: "Nothing — include everything", value: "none" },
          { label: "Not sure", value: "not_sure" },
        ],
        freeTextAllowed: true,
        multiSelect: true,
        skipAllowed: false,
      };
    case "resume_frame":
      return {
        field,
        prompt:
          "When someone reads this resume, what's the single most important thing you want them to take away about you?",
        chips: inferResumeFrameChips(session),
        freeTextAllowed: true,
        multiSelect: false,
        skipAllowed: false,
      };
    case "career_transition_framing":
      return {
        field,
        prompt:
          "I noticed your background is shifting direction. How do you want your earlier experience to show up in this resume?",
        chips: [
          { label: "Feature it as relevant context", value: "feature_as_context" },
          { label: "Keep it brief — focus on where I'm going", value: "keep_brief" },
          { label: "Only include what transfers directly", value: "transferable_only" },
          { label: "I'll figure it out later", value: "deferred" },
        ],
        freeTextAllowed: true,
        multiSelect: false,
        skipAllowed: true,
      };
    case "gap_handling":
      return {
        field,
        prompt:
          "I noticed there are some gaps in the timeline on your resume. How would you like to handle those?",
        chips: [
          { label: "Leave them as is — no explanation", value: "leave_as_is" },
          { label: "I'd like to add a brief note for the main gap", value: "add_note" },
          { label: "Minimise them — don't draw attention", value: "minimise" },
          { label: "I'll handle it in the resume itself", value: "handle_in_resume" },
        ],
        freeTextAllowed: true,
        multiSelect: false,
        skipAllowed: true,
      };
    case "achievement_depth":
      return {
        field,
        prompt:
          "I noticed your resume doesn't have many specific numbers or outcomes yet — things like 'reduced load time by 40%' or 'grew the API to handle 10M requests/day'. Do you have any metrics or measurable results from your work that we could add?",
        chips: [
          { label: "Yes — I'll share some", value: "will_share" },
          { label: "My work isn't easily measured", value: "not_applicable" },
          { label: "I'd rather not include metrics", value: "prefer_not" },
          { label: "I'm not sure — help me think", value: "help_me" },
        ],
        freeTextAllowed: true,
        multiSelect: false,
        skipAllowed: true,
      };
  }
}

export async function processAnswer(
  session: OnboardingV2Session,
  userId: string,
  field: keyof QuestionMap,
  answer: string | string[],
): Promise<AnswerResult> {
  const answerStr = Array.isArray(answer) ? answer.join(", ") : answer;

  // Quick-accept patterns (no LLM needed)
  if (field === "underrepresented_skills" && answerStr === "none")
    return accept(session, userId, field, "none", "high", "chip");
  if (field === "deemphasis_preferences" && answerStr === "none")
    return accept(session, userId, field, "none", "high", "chip");
  if (field === "career_transition_framing" && answerStr === "deferred")
    return accept(session, userId, field, "deferred", "high", "chip");
  if (field === "gap_handling") return accept(session, userId, field, answerStr, "high", "chip");
  if (field === "achievement_depth" && ["not_applicable", "prefer_not"].includes(answerStr))
    return accept(session, userId, field, answerStr, "high", "chip");

  // Chips that need follow-up before accepting
  if (field === "underrepresented_skills" && answerStr === "specific_tech") {
    return {
      accepted: false,
      followUp: "Which technologies would you like to make sure are highlighted?",
      nextQuestion: null,
      stageComplete: false,
    };
  }
  if (field === "deemphasis_preferences" && answerStr === "specific_job") {
    return {
      accepted: false,
      followUp:
        "Which role or company are you thinking of? I won't ask why — I just need to know which one to keep minimal.",
      nextQuestion: null,
      stageComplete: false,
    };
  }

  // Chip selections for single-select fields
  const question = buildQuestion(field, session);
  const isChip = question.chips?.some((c) => c.value === answerStr);
  if (isChip && !["achievement_depth"].includes(field)) {
    return accept(session, userId, field, answerStr, "high", "chip");
  }

  // Achievement depth special flows
  if (field === "achievement_depth" && answerStr === "will_share") {
    return {
      accepted: false,
      followUp: "Great — go ahead and share whatever comes to mind. Even rough numbers are useful.",
      nextQuestion: null,
      stageComplete: false,
    };
  }
  if (field === "achievement_depth" && answerStr === "help_me") {
    const company =
      session.dual_extraction.pure_extraction?.experience?.[0]?.company || "your most recent role";
    return {
      accepted: false,
      followUp: `Think about a project you're proud of from ${company}. What changed because of your work? Who used it? How many people or how much did it affect?`,
      nextQuestion: null,
      stageComplete: false,
    };
  }

  // Free text — evaluate via LLM
  const evaluation = await evaluateAnswer(field, answerStr, session);
  if (!evaluation.answer_valid || !evaluation.answer_actionable) {
    if (evaluation.follow_up_question) {
      return {
        accepted: false,
        followUp: evaluation.follow_up_question,
        nextQuestion: null,
        stageComplete: false,
      };
    }
    // Accept anyway with low confidence after follow-up
    return accept(session, userId, field, answerStr, "low", "free_text");
  }

  // Apply cross-field answers
  if (evaluation.additional_fields_collected) {
    for (const [f, raw] of Object.entries(evaluation.additional_fields_collected)) {
      const qField = f as keyof QuestionMap;
      const data = raw;
      if (session.question_map[qField]?.value === null && data.value) {
        await updateSession(userId, {
          question_map: {
            ...session.question_map,
            [qField]: {
              value: data.value,
              confidence: (data.confidence as "high" | "medium" | "low") ?? "medium",
              source: "free_text",
            },
          },
        });
      }
    }
  }

  return accept(
    session,
    userId,
    field,
    evaluation.extracted_value || answerStr,
    evaluation.confidence ?? "medium",
    "free_text",
  );
}

export async function skipQuestion(
  session: OnboardingV2Session,
  userId: string,
  field: keyof QuestionMap,
): Promise<AnswerResult> {
  return accept(session, userId, field, "deferred", "low", "free_text");
}

async function accept(
  session: OnboardingV2Session,
  userId: string,
  field: keyof QuestionMap,
  value: string,
  confidence: string,
  source: "chip" | "free_text" | "inferred",
): Promise<AnswerResult> {
  const updatedMap = { ...session.question_map, [field]: { value, confidence, source } };
  const isComplete = QUESTION_ORDER.every(
    (f) =>
      updatedMap[f].value !== null ||
      !isQuestionActive(f, { ...session, question_map: updatedMap }),
  );

  await updateSession(userId, {
    question_map: updatedMap,
    ...(isComplete ? { onboarding_status: "resume_questions_complete" } : {}),
  });

  const updatedSession = {
    ...session,
    question_map: updatedMap,
    onboarding_status: isComplete
      ? ("resume_questions_complete" as const)
      : session.onboarding_status,
  };
  return {
    accepted: true,
    nextQuestion: isComplete ? null : getNextQuestion(updatedSession),
    stageComplete: isComplete,
  };
}

async function evaluateAnswer(
  field: keyof QuestionMap,
  answer: string,
  session: OnboardingV2Session,
) {
  try {
    const result = await callLLM({
      systemPrompt: ANSWER_EVALUATION_SYSTEM_PROMPT,
      userMessage: `Question field: ${field}\nUser's answer: "${answer}"\nConfirmed role family: ${session.confirmation.confirmed_role_family}\nTarget role so far: ${session.question_map.target_role.value || "not yet set"}`,
      model: "fast",
      temperature: 0,
      maxTokens: 1024,
      stage: 7,
      callName: "answer_evaluation",
    });
    const parsed = safeParseLLMJson<AnswerEvaluation>(result.content, (p) => {
      if (!p || typeof p !== "object")
        return { valid: false, result: null, errors: ["Not an object"] };
      return { valid: true, result: p as AnswerEvaluation, errors: [] };
    });
    if (parsed.success) return parsed.data;
  } catch {
    /* fallthrough */
  }
  return {
    answer_valid: true,
    answer_actionable: true,
    extracted_value: answer,
    confidence: "medium",
    follow_up_question: null,
    additional_fields_collected: {},
  };
}

function inferResumeFrameChips(
  session: OnboardingV2Session,
): Array<{ label: string; value: string }> {
  const chips: Array<{ label: string; value: string }> = [];
  const role = session.confirmation.confirmed_role_family;
  const targetRole = session.question_map.target_role.value;
  const exp = session.dual_extraction.pure_extraction?.experience;
  const topCompany = exp?.[0]?.company;
  const topTitle = exp?.[0]?.title;

  if (targetRole && topCompany) {
    chips.push({ label: `Proven ${targetRole} who delivers at scale`, value: `proven_${targetRole}_at_scale` });
  }
  if (topTitle && topCompany) {
    chips.push({ label: `Strong ${topTitle} track record`, value: `strong_track_record` });
  }
  if (role) {
    chips.push({ label: `This is the person I want to hire`, value: "hire_me" });
    chips.push({ label: `Deep technical expertise in ${role}`, value: `deep_technical_${role}` });
  }
  if (session.inference.career_transition_detected) {
    chips.push({ label: "Ready to make the transition successfully", value: "transition_ready" });
  }

  if (chips.length === 0) {
    chips.push(
      { label: "This is the person I want to hire", value: "hire_me" },
      { label: "Strong technical problem solver", value: "problem_solver" },
      { label: "Gets things done reliably", value: "reliable_executor" },
    );
  }

  return chips.slice(0, 4);
}

function inferRoleSpecificityChips(
  session: OnboardingV2Session,
): Array<{ label: string; value: string }> {
  const chips: Array<{ label: string; value: string }> = [];
  const extraction = session.dual_extraction.pure_extraction;
  const skills = extraction?.skills;

  // Tech focus from top skills
  const topSkills = skills?.raw_list?.slice(0, 3) ?? [];
  for (const s of topSkills) {
    if (s) chips.push({ label: `${s}-heavy work`, value: s.toLowerCase().replace(/\s+/g, "_") });
  }

  // Company size signals
  chips.push({ label: "Startup / small team", value: "startup" });
  chips.push({ label: "Mid-size company", value: "midsize" });
  chips.push({ label: "Large enterprise", value: "enterprise" });

  return chips.slice(0, 5);
}
