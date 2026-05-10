import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("signup lands on onboarding and skip moves user to dashboard", async ({ page }) => {
  const email = `e2e${randomUUID().replaceAll("-", "")}@example.com`;
  const password = "TestPass123";

  await page.goto("/signup");
  await page.getByLabel("Full name").fill("E2E User");
  await page.getByLabel("Email *").fill(email);
  await page.getByLabel("Password *").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole("heading", { name: "Build your profile" })).toBeVisible();

  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: "Yes, skip" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: /Good to see you|Dashboard/ })).toBeVisible();
});

test("authenticated user can create application and gets routed to pipeline", async ({ page }) => {
  const email = `e2e${randomUUID().replaceAll("-", "")}@example.com`;
  const password = "TestPass123";

  await page.goto("/signup");
  await page.getByLabel("Full name").fill("E2E User");
  await page.getByLabel("Email *").fill(email);
  await page.getByLabel("Password *").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);

  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: "Yes, skip" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByRole("button", { name: "Paste text" }).click();
  await page
    .getByPlaceholder("Paste the full job description here...")
    .fill(
      "Senior Software Engineer role requiring TypeScript, React, Node.js, API design, and cloud deployment experience. Build scalable systems and improve platform reliability across teams.",
    );
  await page.getByRole("button", { name: /Generate Resume|Generate CV/ }).click();

  await expect(page).toHaveURL(/\/generate\/[a-f0-9-]+$/);
  await expect(page.getByRole("heading", { name: /Generating your/ })).toBeVisible();
});

test("signup works without full name when omitted", async ({ page }) => {
  const email = `e2e${randomUUID().replaceAll("-", "")}@example.com`;
  const password = "TestPass123";

  await page.goto("/signup");
  await page.getByLabel("Email *").fill(email);
  await page.getByLabel("Password *").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/onboarding$/);
});

test("session survives refresh and route transitions while valid", async ({ page }) => {
  const email = `e2e${randomUUID().replaceAll("-", "")}@example.com`;
  const password = "TestPass123";

  await page.goto("/signup");
  await page.getByLabel("Email *").fill(email);
  await page.getByLabel("Password *").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);

  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: "Yes, skip" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.reload();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/settings");
  await expect(page).toHaveURL(/\/settings$/);
});
