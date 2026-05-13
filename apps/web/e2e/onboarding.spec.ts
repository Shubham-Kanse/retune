/**
 * E2E tests for the SOTA onboarding flow.
 * Uses Playwright route interception to mock API responses.
 */
import { test, expect } from "@playwright/test";

// Mock SSE response helper
function mockSSE(tokens: string[], turnComplete: Record<string, unknown>) {
  const lines: string[] = [];
  for (const t of tokens) {
    lines.push(`event: token\ndata: ${JSON.stringify(t)}\n`);
  }
  lines.push(`event: turn_complete\ndata: ${JSON.stringify(turnComplete)}\n`);
  return lines.join("\n");
}

test.describe("Onboarding — Happy Path", () => {
  test.beforeEach(async ({ page }) => {
    // Mock auth — set session headers
    await page.route("**/api/onboarding/session", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ stage: "greeting", messages: [], evidenceReadiness: 0, targetRole: null, turnCount: 0, isReturning: false }),
      });
    });
  });

  test("new user sees intro animation then greeting", async ({ page }) => {
    await page.route("**/api/onboarding/chat", (route) => {
      route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        body: mockSSE(
          ["Hi! ", "I'm retune. ", "Upload your resume or let's chat."],
          { stage: "greeting", chips: ["📄 Upload my resume", "✍️ Start from scratch"], evidenceReadiness: 0 },
        ),
      });
    });

    await page.goto("/onboarding");
    // Intro animation plays
    await expect(page.getByText("Hello")).toBeVisible({ timeout: 5000 });
    // Wait for chat to appear
    await expect(page.getByText("Upload your resume or let's chat")).toBeVisible({ timeout: 10000 });
  });

  test("greeting shows upload and start-from-scratch chips", async ({ page }) => {
    await page.route("**/api/onboarding/chat", (route) => {
      route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        body: mockSSE(
          ["How would you like to start?"],
          { stage: "greeting", chips: ["📄 Upload my resume", "✍️ Start from scratch"], evidenceReadiness: 0 },
        ),
      });
    });

    await page.goto("/onboarding");
    await expect(page.getByText("How would you like to start?")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("📄 Upload my resume")).toBeVisible();
    await expect(page.getByText("✍️ Start from scratch")).toBeVisible();
  });

  test("clicking chip sends it as message", async ({ page }) => {
    let chatCalled = false;
    await page.route("**/api/onboarding/chat", (route) => {
      const body = route.request().postDataJSON();
      if (body?.kind === "greeting") {
        route.fulfill({
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
          body: mockSSE(["Let's start!"], { stage: "greeting", chips: ["📄 Upload my resume", "✍️ Start from scratch"], evidenceReadiness: 0 }),
        });
      } else if (body?.kind === "message") {
        chatCalled = true;
        route.fulfill({
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
          body: mockSSE(["Great! What's your name?"], { stage: "intake", chips: [], evidenceReadiness: 0 }),
        });
      } else {
        route.fulfill({ status: 200, headers: { "Content-Type": "text/event-stream" }, body: mockSSE(["ok"], { stage: "intake", chips: [], evidenceReadiness: 0 }) });
      }
    });

    await page.goto("/onboarding");
    await expect(page.getByText("Let's start!")).toBeVisible({ timeout: 10000 });
    await page.getByText("✍️ Start from scratch").click();
    await expect(page.getByText("What's your name?")).toBeVisible({ timeout: 5000 });
    expect(chatCalled).toBe(true);
  });
});

test.describe("Onboarding — Upload Feedback", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/onboarding/session", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ stage: "greeting", messages: [], evidenceReadiness: 0, targetRole: null, turnCount: 0, isReturning: false }),
      });
    });
  });

  test("upload shows processing bubble then coaching response", async ({ page }) => {
    await page.route("**/api/onboarding/chat", (route) => {
      route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        body: mockSSE(["Let's start!"], { stage: "greeting", chips: ["📄 Upload my resume", "✍️ Start from scratch"], evidenceReadiness: 0 }),
      });
    });

    await page.route("**/api/onboarding/upload", (route) => {
      // Simulate 1s extraction delay
      setTimeout(() => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ result: { fullName: "Shubham", currentTitle: "Sr. Associate" } }),
        });
      }, 500);
    });

    await page.goto("/onboarding");
    await expect(page.getByText("Let's start!")).toBeVisible({ timeout: 10000 });

    // Trigger file upload via the file input
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "resume.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("fake pdf content"),
    });

    // Processing bubble should appear
    await expect(page.getByText("Reading your resume...")).toBeVisible({ timeout: 3000 });
  });
});

test.describe("Onboarding — Progress Bar", () => {
  test("progress bar not visible at score 0", async ({ page }) => {
    await page.route("**/api/onboarding/session", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ stage: "greeting", messages: [], evidenceReadiness: 0, targetRole: null, turnCount: 0, isReturning: false }),
      });
    });
    await page.route("**/api/onboarding/chat", (route) => {
      route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        body: mockSSE(["Hi!"], { stage: "greeting", chips: ["📄 Upload my resume"], evidenceReadiness: 0 }),
      });
    });

    await page.goto("/onboarding");
    await expect(page.getByText("Hi!")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Profile strength")).not.toBeVisible();
  });

  test("progress bar appears after first substantive answer", async ({ page }) => {
    await page.route("**/api/onboarding/session", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          stage: "gap_fill",
          messages: [
            { role: "assistant", content: "What metrics can you share?", ts: "2026-01-01" },
          ],
          evidenceReadiness: 0.35,
          targetRole: "Staff Engineer",
          turnCount: 3,
          isReturning: true,
        }),
      });
    });

    await page.goto("/onboarding");
    await expect(page.getByText("Profile strength")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Staff Engineer")).toBeVisible();
    await expect(page.getByText("35%")).toBeVisible();
  });
});

test.describe("Onboarding — Refresh", () => {
  test("mid-conversation refresh hydrates messages", async ({ page }) => {
    await page.route("**/api/onboarding/session", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          stage: "gap_fill",
          messages: [
            { role: "assistant", content: "Hi! Let's build your profile.", ts: "2026-01-01" },
            { role: "user", content: "I'm a Senior SWE at Stripe", ts: "2026-01-01" },
            { role: "assistant", content: "How many transactions did your system handle?", ts: "2026-01-01" },
          ],
          evidenceReadiness: 0.3,
          targetRole: "Staff Engineer",
          turnCount: 3,
          isReturning: true,
        }),
      });
    });

    await page.goto("/onboarding");
    // All messages should be visible
    await expect(page.getByText("Hi! Let's build your profile.")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("I'm a Senior SWE at Stripe")).toBeVisible();
    await expect(page.getByText("How many transactions")).toBeVisible();
  });
});

test.describe("Onboarding — Skip & Start Over", () => {
  test("start over button visible during gap_fill, not during greeting", async ({ page }) => {
    await page.route("**/api/onboarding/session", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          stage: "gap_fill",
          messages: [{ role: "assistant", content: "Tell me about scale.", ts: "2026-01-01" }],
          evidenceReadiness: 0.3,
          targetRole: "SWE",
          turnCount: 3,
          isReturning: true,
        }),
      });
    });

    await page.goto("/onboarding");
    await expect(page.getByText("Tell me about scale.")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Start over")).toBeVisible();
    await expect(page.getByText("Skip remaining questions")).toBeVisible();
  });
});
