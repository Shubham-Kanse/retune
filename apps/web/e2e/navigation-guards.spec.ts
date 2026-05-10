import { expect, test } from "@playwright/test";

test("unauthenticated protected route redirects to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});

test("home query redirect goes to login for protected application page", async ({ page }) => {
  await page.goto("/?app=test-app-id");
  await expect(page).toHaveURL(/\/login$/);
});
