import { expect, test } from "@playwright/test";

test("login page shows auth error from API", async ({ page }) => {
  await page.route("**/api/auth/login", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Invalid email or password" }),
    });
  });

  await page.goto("/login");
  await page.getByLabel("Email *").fill("user@example.com");
  await page.getByLabel("Password *").fill("wrongpass");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page.locator("p[role='alert']")).toContainText("Invalid email or password");
});

test("signup shows duplicate-email message when API returns exists error", async ({ page }) => {
  await page.route("**/api/auth/signup", async (route) => {
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ error: "User already exists" }),
    });
  });

  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Test User");
  await page.getByLabel("Email *").fill("test@example.com");
  await page.getByLabel("Password *").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.locator("p[role='alert']")).toContainText("already exists");
});
