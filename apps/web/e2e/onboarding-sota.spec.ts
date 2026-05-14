import { expect, test } from "@playwright/test";

const authStorage = process.env.E2E_AUTH_STORAGE;
test.skip(!authStorage, "Set E2E_AUTH_STORAGE to an authenticated Playwright storageState file to run protected onboarding E2E tests");
if (authStorage) test.use({ storageState: authStorage });

function sse(message: string, payload: Record<string, unknown>) {
  return [
    ...message.split(/(\s+)/).filter(Boolean).map((token) => `event: token\ndata: ${JSON.stringify(token)}\n`),
    `event: turn_complete\ndata: ${JSON.stringify(payload)}\n`,
  ].join("\n");
}

const readiness = {
  canEnterDashboard: false,
  score: 42,
  blockers: ["Choose your professional identity."],
  warnings: [],
  suggestions: [],
  completedCategories: {
    identity: 100,
    experience: 100,
    education: 100,
    skills: 100,
    professionalProfile: 0,
    careerIntent: 0,
    resumeWritingSignals: 0,
  },
};

const summaryQuestion = {
  phase: "resume_summary",
  field: "resume_summary",
  questionKey: "resume_summary",
  prompt: "Summarize the extracted resume data and ask the user to review it.",
  answerType: "confirm",
  skipAllowed: false,
  cards: [
    { type: "identity", title: "Jane Doe", subtitle: "jane@example.com · Dublin, Ireland", status: "extracted" },
    { type: "experience", id: "exp-1", title: "Data Analyst", subtitle: "Acme · 2022 – Present", metadata: ["SQL", "Power BI"], status: "extracted" },
    { type: "education", id: "edu-1", title: "MSc Analytics", subtitle: "UCD · 2021", status: "extracted" },
    { type: "skill_group", title: "Skills detected", subtitle: "6 skills found", metadata: ["SQL", "Power BI", "Tableau", "Excel", "Analytics", "Dashboards"], status: "extracted" },
  ],
  pills: [
    { label: "Looks mostly correct", value: "confirm_summary", action: "confirm_field", field: "resume_summary", recommended: true },
    { label: "Review details", value: "review_details", action: "edit_card", field: "resume_summary" },
    { label: "Something is wrong", value: "something_wrong", action: "ask_text", field: "resume_summary" },
  ],
};

test.describe("SOTA onboarding", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/onboarding/session", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ phase: "orb_intro", messages: [], readiness, nextQuestion: null, turnCount: 0, isReturning: false }),
      });
    });
  });

  test("starts with resume-only greeting", async ({ page }) => {
    await page.route("**/api/onboarding/chat", (route) => {
      route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        body: sse("Hi, I'm Retuned. Upload your resume and I'll build your career profile from it.", {
          phase: "resume_upload",
          question: {
            phase: "resume_upload",
            field: "resume",
            questionKey: "resume_upload",
            answerType: "confirm",
            pills: [{ label: "Upload resume", value: "upload_resume", action: "navigate", field: "resume" }],
          },
          readiness,
        }),
      });
    });

    await page.goto("/onboarding");
    await expect(page.getByText("Upload resume")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Start from scratch")).toHaveCount(0);
  });

  test("shows extracted summary cards and structured confirmation pills after upload", async ({ page }) => {
    await page.route("**/api/onboarding/upload", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ sessionSaved: true, result: { fullName: "Jane Doe" } }),
      });
    });

    await page.route("**/api/onboarding/chat", (route) => {
      const body = route.request().postDataJSON();
      const isGreeting = body?.kind === "greeting";
      route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        body: isGreeting
          ? sse("Hi, I'm Retuned. Upload your resume and I'll build your career profile from it.", {
              phase: "resume_upload",
              question: {
                phase: "resume_upload",
                field: "resume",
                questionKey: "resume_upload",
                answerType: "confirm",
                pills: [{ label: "Upload resume", value: "upload_resume", action: "navigate", field: "resume" }],
              },
              readiness,
            })
          : sse("I reviewed your resume and created a draft profile. Let's confirm the important parts.", {
              phase: "resume_summary",
              question: summaryQuestion,
              readiness,
            }),
      });
    });

    await page.goto("/onboarding");
    await page.locator('input[type="file"]').setInputFiles({
      name: "resume.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n"),
    });

    await expect(page.getByText("I reviewed your resume")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Data Analyst")).toBeVisible();
    await expect(page.getByText("MSc Analytics")).toBeVisible();
    await expect(page.getByText("Skills detected")).toBeVisible();
    await expect(page.getByText("Looks mostly correct")).toBeVisible();
    await expect(page.getByText("Dublin, Ireland")).toBeVisible();
    await expect(page.getByText("What city")).toHaveCount(0);
    await expect(page.locator(".rounded-2xl").filter({ hasText: /^$/ })).toHaveCount(0);
  });

  test("does not redirect until readiness allows dashboard handoff", async ({ page }) => {
    let clicked = false;
    await page.route("**/api/onboarding/chat", (route) => {
      const body = route.request().postDataJSON();
      if (body?.kind === "pill") clicked = true;
      route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        body: sse(clicked ? "Let's keep going." : "I reviewed your resume and created a draft profile.", {
          phase: clicked ? "identity_confirm" : "resume_summary",
          question: clicked ? { ...summaryQuestion, phase: "identity_confirm", questionKey: "identity_confirm" } : summaryQuestion,
          readiness,
        }),
      });
    });

    await page.goto("/onboarding");
    await expect(page.getByText("Looks mostly correct")).toBeVisible({ timeout: 10000 });
    await page.getByText("Looks mostly correct").click();
    await expect(page).not.toHaveURL(/dashboard/);
  });
});
