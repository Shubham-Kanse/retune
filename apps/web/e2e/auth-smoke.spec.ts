import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const runRealAuth = process.env.E2E_REAL_AUTH === "1";

test.skip(!runRealAuth, "Set E2E_REAL_AUTH=1 to run real Supabase auth smoke flow");

async function completeSignup(page: Page, email: string, password: string) {
  await page.goto("/signup");
  await page.getByLabel("Full Name").fill("E2E Auth User");
  await page.getByLabel("Email Address").fill(email);
  await page.getByLabel("Password").fill(password);

  await page.getByLabel("Anthropic (AI generation)").check();
  await page.getByLabel("OpenAI (processing)").check();
  await page.getByLabel("Retuned (platform)").check();

  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
}

async function finishOnboardingBySkip(page: Page) {
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: "Yes, skip" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function logoutFromHeader(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

test("auth smoke: signup/login/logout and protected-route guard", async ({ page }) => {
  const email = `e2e${randomUUID().replaceAll("-", "")}@example.com`;
  const password = "TestPass123";

  await completeSignup(page, email, password);
  await finishOnboardingBySkip(page);
  await logoutFromHeader(page);

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await logoutFromHeader(page);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login$/);
});
