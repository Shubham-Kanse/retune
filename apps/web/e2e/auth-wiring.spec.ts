import { expect, test } from "@playwright/test";

test("signup submits expected payload and completes without client-side error", async ({ page }) => {
  let payload: unknown;
  await page.route("**/api/auth/signup", async (route) => {
    payload = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ userId: "u1", emailVerificationSent: true }),
    });
  });

  await page.goto("/signup");
  await page.getByLabel("Full Name").fill("Test User");
  await page.getByLabel("Email Address").fill("test@example.com");
  await page.getByLabel("Password").fill("Password123");
  await page.getByLabel("Anthropic (AI generation)").check();
  await page.getByLabel("OpenAI (processing)").check();
  await page.getByLabel("Retuned (platform)").check();
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.locator("p[role='alert']")).toHaveCount(0);
  await expect(page).toHaveURL(/\/(login|onboarding)$/);
  expect(payload).toMatchObject({
    email: "test@example.com",
    fullName: "Test User",
    processorConsents: { anthropic: true, openai: true, retune: true },
  });
});

test("login submits expected payload and handles success path without error UI", async ({ page }) => {
  let payload: unknown;
  await page.route("**/api/auth/login", async (route) => {
    payload = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ userId: "u1", onboardingCompleted: false }),
    });
  });

  await page.goto("/login");
  await page.getByLabel("Email").fill("test@example.com");
  await page.getByLabel("Password").fill("Password123");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.locator("p[role='alert']")).toHaveCount(0);
  await expect(page).toHaveURL(/\/(login|onboarding)$/);
  expect(payload).toEqual({ email: "test@example.com", password: "Password123" });
});

test("unauthenticated users are redirected off protected pages", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login$/);
});
