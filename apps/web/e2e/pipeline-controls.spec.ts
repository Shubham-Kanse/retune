import { randomUUID } from "node:crypto";
import { type Page, expect, test } from "@playwright/test";
import { applications, getDb, users } from "@retune/db";
import { eq } from "drizzle-orm";

async function seedPendingApplicationForUser(email: string): Promise<string> {
  const db = await getDb();
  const userRows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  const user = userRows[0];
  if (!user?.id) throw new Error(`Could not find user for ${email}`);

  const id = randomUUID();
  await db.insert(applications).values({
    id,
    userId: user.id,
    companyName: "Pipeline Co",
    roleTitle: "Backend Engineer",
    jobDescription: "Build APIs and distributed services with reliability and observability.",
    status: "pending",
    market: "us",
  });
  return id;
}

async function signupAndSkipOnboarding(page: Page) {
  const email = `e2epipe${randomUUID().replaceAll("-", "")}@example.com`;
  const password = "TestPass123";
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Pipeline User");
  await page.getByLabel("Email *").fill(email);
  await page.getByLabel("Password *").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: "Yes, skip" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return email;
}

test("retry generation reconnects stream with incremented retry query", async ({ page }) => {
  const email = await signupAndSkipOnboarding(page);
  const appId = await seedPendingApplicationForUser(email);

  let streamCalls = 0;
  await page.route(`**/api/generate/${appId}/stream?**`, async (route) => {
    streamCalls += 1;
    const url = new URL(route.request().url());
    const retry = url.searchParams.get("retry") ?? "0";
    const body = `data: ${JSON.stringify({ type: "error", data: { message: `Synthetic failure retry=${retry}` }, timestamp: Date.now() })}\n\n`;
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body,
    });
  });

  await page.goto(`/generate/${appId}`);
  await expect(page.getByText("Synthetic failure retry=0")).toBeVisible();
  await page.getByRole("button", { name: "Retry Generation" }).click();
  await expect(page.getByText("Synthetic failure retry=1")).toBeVisible();
  expect(streamCalls).toBeGreaterThanOrEqual(2);
});

test("cancel generation calls cancel API and routes back to dashboard", async ({ page }) => {
  const email = await signupAndSkipOnboarding(page);
  const appId = await seedPendingApplicationForUser(email);

  await page.route(`**/api/generate/${appId}/stream?**`, async (route) => {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 15000));
    const body = `data: ${JSON.stringify({ type: "step_start", data: { step: "company_research" }, timestamp: Date.now() })}\n\n`;
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body,
    });
  });

  let cancelCalled = false;
  await page.route(`**/api/applications/${appId}/cancel`, async (route) => {
    cancelCalled = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto(`/generate/${appId}`);
  await expect(page.getByRole("button", { name: "Cancel generation" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel generation" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(cancelCalled).toBe(true);
});
