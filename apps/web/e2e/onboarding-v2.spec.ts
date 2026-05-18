import { expect, test } from "@playwright/test";

// E2E covers the happy path of the v2 onboarding flow with backend routes
// mocked. The Playwright web server sets E2E_AUTH_BYPASS=1 so the protected
// page can run in CI/local test environments without captured Supabase state.

const baseSession = {
  session_id: "test-session",
  user_id: "test-user",
  onboarding_started_at: new Date().toISOString(),
  onboarding_completed_at: null,
  onboarding_status: "awaiting_upload",
  upload: {
    file_name: null,
    file_type: null,
    file_size_bytes: null,
    upload_timestamp: null,
    upload_attempts: 0,
  },
  extraction: {
    raw_text: null,
    raw_text_character_count: 0,
    extraction_method: null,
    schema_mapping_status: null,
    schema_mapping_object: null,
    extraction_quality: null,
  },
  dual_extraction: {
    pure_extraction: null,
    pure_extraction_confidence: null,
    inferred_summary: null,
    inferred_summary_status: null,
    summary_quality: null,
  },
  inference: {
    industry: null,
    role_family: null,
    seniority: null,
    industry_ambiguous: false,
    role_family_ambiguous: false,
    seniority_ambiguous: false,
    career_transition_detected: false,
    new_grad: false,
    work_pattern: null,
  },
  confirmation: {
    summary_confirmed: false,
    correction_submitted: false,
    confirmed_role_family: null,
    confirmed_industry: null,
    confirmed_seniority: null,
    correction_rounds: 0,
    correction_unresolved: false,
    user_supplied_overrides: [],
  },
  completeness: {
    completeness_score: null,
    completeness_path: null,
    missing_critical_fields: [],
    has_quantified_achievements: false,
    resume_stale: false,
    employment_gaps_present: false,
  },
  question_map: {
    target_role: { value: null, confidence: null, source: null },
    target_role_specificity: { value: null, confidence: null, source: null },
    underrepresented_skills: { value: null, confidence: null, source: null },
    deemphasis_preferences: { value: null, confidence: null, source: null },
    resume_frame: { value: null, confidence: null, source: null },
    career_transition_framing: { value: null, confidence: null, source: null },
    gap_handling: { value: null, confidence: null, source: null },
    achievement_depth: { value: null, confidence: null, source: null },
  },
  voice_profile: {
    natural_voice_sample: null,
    tone_preferences: [],
    tone_aversions: [],
    self_description_style: null,
    sentence_structure: null,
    vocabulary_register: null,
    leading_pattern: null,
    phrases_to_use: [],
    phrases_to_avoid: [],
    tone_calibration_summary: null,
    aversion_to_ai_language: false,
    voice_profile_confidence: null,
    voice_profile_source: null,
  },
  audit: {
    critical_gaps_resolved: false,
    important_gaps_resolved: false,
    contradictions_resolved: false,
    profile_quality_score: null,
    ready_to_commit: false,
    regenerated_inferred_summary: false,
  },
};

const summaryPresentation = {
  summaryMessage:
    "Thanks for sharing your resume. You're a backend engineer with around 4 years of experience in fintech, with strong system design chops.",
  extractionCards: [
    {
      section: "experience",
      title: "Experience (2 roles)",
      items: [{ label: "Senior Software Engineer at Fiserv", value: "2022 – Present" }],
    },
  ],
  ambiguityQuestions: [],
  flags: {
    careerTransition: false,
    newGrad: false,
    lowExtractionQuality: false,
    inferenceFailed: false,
    roleAmbiguous: false,
    seniorityAmbiguous: false,
  },
};

test.describe("Onboarding V2 happy path", () => {
  test("upload → confirm → questions → voice → audit → commit", async ({ page }) => {
    let sessionState = { ...baseSession };

    await page.route("**/dashboard", async (route) => {
      if (route.request().resourceType() !== "document") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<main>Dashboard loaded</main>",
      });
    });

    await page.route("**/api/onboarding-v2/session", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ exists: true, session: sessionState }),
      });
    });

    await page.route("**/api/onboarding-v2/upload", (route) => {
      sessionState = { ...sessionState, onboarding_status: "inference_complete" };
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, status: "inference_complete" }),
      });
    });

    await page.route("**/api/onboarding-v2/upload/stream**", (route) => {
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: [
          'event: progress\ndata: {"stage":"uploading","message":"Uploading your resume..."}\n\n',
          'event: complete\ndata: {"stage":"complete","message":"Done! Let me show you what I found."}\n\n',
        ].join(""),
      });
    });

    await page.route("**/api/onboarding-v2/confirm", async (route) => {
      const body = route.request().postDataJSON();
      if (body?.action === "get_summary") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ presentation: summaryPresentation }),
        });
        return;
      }
      if (body?.action === "looks_correct") {
        sessionState = { ...sessionState, onboarding_status: "summary_confirmed" };
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, nextStage: 6 }),
        });
        return;
      }
      await route.fulfill({ status: 200, body: JSON.stringify({}) });
    });

    let questionsAsked = 0;
    const questions = [
      {
        field: "target_role",
        prompt: "What kind of role is this resume being targeted at?",
        chips: [{ label: "Senior Backend Engineer", value: "Senior Backend Engineer" }],
        freeTextAllowed: true,
        multiSelect: false,
        skipAllowed: false,
      },
      {
        field: "underrepresented_skills",
        prompt: "Anything not well represented?",
        chips: [{ label: "Nothing — it's all there", value: "none" }],
        freeTextAllowed: true,
        multiSelect: true,
        skipAllowed: false,
      },
      {
        field: "deemphasis_preferences",
        prompt: "Anything to keep minimal?",
        chips: [{ label: "Nothing — include everything", value: "none" }],
        freeTextAllowed: true,
        multiSelect: true,
        skipAllowed: false,
      },
      {
        field: "resume_frame",
        prompt: "Single most important takeaway?",
        chips: null,
        freeTextAllowed: true,
        multiSelect: false,
        skipAllowed: false,
      },
    ];

    const voiceQuestions = [
      {
        field: "natural_voice_sample",
        prompt: "How would you describe what you do?",
        chips: null,
        freeTextAllowed: true,
        multiSelect: false,
      },
      {
        field: "tone_preferences",
        prompt: "Tone you want?",
        chips: [{ label: "Direct and confident", value: "direct_confident" }],
        freeTextAllowed: true,
        multiSelect: true,
      },
      {
        field: "tone_aversions",
        prompt: "Tone aversions?",
        chips: [{ label: "Nothing — I'm open", value: "none" }],
        freeTextAllowed: true,
        multiSelect: true,
      },
    ];
    let voiceQuestionsAsked = 0;

    await page.route("**/api/onboarding-v2/message", async (route) => {
      const body = route.request().postDataJSON();
      if (body?.action === "get_question") {
        const q = questions[questionsAsked];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ question: q ?? null, stageComplete: !q }),
        });
        return;
      }
      if (body?.action === "answer") {
        questionsAsked += 1;
        const next = questions[questionsAsked];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            accepted: true,
            nextQuestion: next ?? null,
            stageComplete: !next,
          }),
        });
        return;
      }
      if (body?.action === "get_voice_question") {
        const q = voiceQuestions[voiceQuestionsAsked];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ question: q ?? null, stageComplete: !q }),
        });
        return;
      }
      if (body?.action === "voice_answer") {
        voiceQuestionsAsked += 1;
        const next = voiceQuestions[voiceQuestionsAsked];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            accepted: true,
            nextQuestion: next ?? null,
            stageComplete: !next,
          }),
        });
        return;
      }
      await route.fulfill({ status: 200, body: JSON.stringify({}) });
    });

    await page.route("**/api/onboarding-v2/commit", async (route) => {
      const body = route.request().postDataJSON();
      if (body?.action === "audit") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            audit: {
              critical_gaps: [],
              important_gaps: [],
              contradictions: [],
              user_supplied_overrides: [],
              regenerate_inferred_summary: false,
              profile_quality_score: 88,
              profile_quality_note: "Strong, specific profile.",
              ready_to_commit: true,
            },
          }),
        });
        return;
      }
      // Final commit
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, redirect: "/dashboard" }),
      });
    });

    // Step 1: Upload page renders
    await page.goto("/onboarding-v2");
    await expect(
      page.getByText(
        "Upload your resume and I'll extract your experience, education, skills, and contact details.",
      ),
    ).toBeVisible({ timeout: 10000 });

    // Step 2: Upload a fake file (fileChooser path)
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /Upload resume/ }).click();
    const chooser = await fileChooserPromise;
    await chooser.setFiles({
      name: "resume.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 dummy resume content"),
    });

    // Step 3: Summary card visible
    await expect(page.getByText(summaryPresentation.summaryMessage.slice(0, 30))).toBeVisible({
      timeout: 10000,
    });

    // Step 4: Click "Looks correct"
    await page.getByRole("button", { name: "Looks correct" }).click();

    // Step 5: Question 1 visible
    for (const question of questions) {
      await expect(page.getByText(question.prompt)).toBeVisible({ timeout: 10000 });
      if (question.chips?.[0]) {
        await page.getByRole("button", { name: new RegExp(question.chips[0].label) }).click();
      } else {
        const input = page.getByPlaceholder("Or reply directly…");
        await input.fill("Platform engineering impact for senior backend roles.");
        await page.getByRole("button", { name: "Send" }).click();
      }
    }

    for (const question of voiceQuestions) {
      await expect(page.getByText(question.prompt)).toBeVisible({ timeout: 10000 });
      if (question.chips?.[0]) {
        await page.getByRole("button", { name: new RegExp(question.chips[0].label) }).click();
      } else {
        const input = page.getByPlaceholder("Or reply directly…");
        await input.fill(
          "I build reliable backend systems by breaking large ambiguous problems into clear technical plans, aligning teams around the tradeoffs, and shipping practical improvements that make products faster and easier to operate.",
        );
        await page.getByRole("button", { name: "Send" }).click();
      }
    }

    await expect(page.getByText("Strong, specific profile.", { exact: true })).toBeVisible({
      timeout: 10000,
    });
    await page.getByRole("button", { name: "Looks good — take me to my dashboard" }).click();
    await expect(page.getByText("Dashboard loaded")).toBeVisible({ timeout: 10000 });
  });
});
