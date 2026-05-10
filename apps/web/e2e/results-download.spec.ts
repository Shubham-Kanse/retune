import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { applications, getDb, users } from "@retune/db";
import { eq } from "drizzle-orm";

async function seedCompletedApplicationForUser(email: string): Promise<string> {
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
    companyName: "Acme Corp",
    roleTitle: "Senior Software Engineer",
    jobDescription: "Build reliable distributed systems with TypeScript and cloud tooling.",
    status: "completed",
    atsScore: 91,
    market: "us",
  });
  return id;
}

test("completed application renders results tabs and download links", async ({ page }) => {
  const stamp = Date.now();
  const email = `e2eresults${stamp}@example.com`;
  const password = "TestPass123";

  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Results User");
  await page.getByLabel("Email *").fill(email);
  await page.getByLabel("Password *").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: "Yes, skip" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const appId = await seedCompletedApplicationForUser(email);
  await page.goto(`/applications/${appId}`);

  await expect(page.getByRole("heading", { name: "Acme Corp" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cover Letter" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Strategy" })).toBeVisible();

  await page.getByRole("button", { name: /Download/ }).click();
  await expect(page.getByRole("link", { name: /DOCX/ })).toHaveAttribute(
    "href",
    `/api/files/${appId}/resume.docx`,
  );
  await expect(page.getByRole("link", { name: /PDF/ })).toHaveAttribute(
    "href",
    `/api/files/${appId}/resume.pdf`,
  );
  await page.mouse.click(30, 300);
  await expect(page.locator("div.fixed.inset-0.z-10")).toHaveCount(0);

  await page.getByRole("button", { name: "Cover Letter" }).click();
  await page.getByRole("button", { name: /Download/ }).click();
  await expect(page.getByRole("link", { name: /DOCX/ })).toHaveAttribute(
    "href",
    `/api/files/${appId}/cover_letter.docx`,
  );
  await expect(page.getByRole("link", { name: /PDF/ })).toHaveAttribute(
    "href",
    `/api/files/${appId}/cover_letter.pdf`,
  );
});
