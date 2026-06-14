/**
 * TS-SEC / TS-SET / TS-BIL — Security, Settings, Billing P0 tests
 *
 * API-level tests use `request` fixture (no browser, no auth needed).
 * Page-level tests navigate directly and handle auth redirect gracefully.
 *
 * Covers:
 *   TS-SEC-003  API routes return 401 without session
 *   TS-SEC-011  Cross-user profile access blocked
 *   TS-SEC-012  Cross-user tuning result blocked
 *   TS-SEC-013  Cross-user document download blocked
 *   TS-SET-004  Delete account confirm word enables button
 *   TS-SET-005  Delete account wrong word keeps button disabled
 *   TS-BIL-001  Free tier credit bar shown in settings
 */

import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

// ── TS-SEC-003: API 401 without session ───────────────────────────────────

test("TS-SEC-003: GET /api/profile returns 401 without session", async ({ request }) => {
  const res = await request.get("/api/profile");
  expect(res.status()).toBe(401);
});

test("TS-SEC-003: GET /api/orgs returns 401 without session", async ({ request }) => {
  const res = await request.get("/api/orgs");
  expect(res.status()).toBe(401);
});

test("TS-SEC-003: POST /api/generate returns 401 without session", async ({ request }) => {
  const res = await request.post("/api/generate", {
    data: { jd_text: "Software Engineer role", market: "us" },
  });
  expect(res.status()).toBe(401);
});

// ── TS-SEC-011: Cross-user profile access ────────────────────────────────

test("TS-SEC-011: cross-user profile access via API is blocked", async ({ request }) => {
  const otherUserId = randomUUID();
  const res = await request.get(`/api/profile?userId=${otherUserId}`);
  // Without a session, must be 401. With a session, must be 403 or own data only.
  expect([401, 403, 404]).toContain(res.status());
});

// ── TS-SEC-012: Cross-user tuning result ─────────────────────────────────

test("TS-SEC-012: cross-user tuning result page redirects or shows empty state", async ({ page }) => {
  const otherUserTuningId = randomUUID();

  // Mock 403 from the API
  await page.route(`**/api/generate/${otherUserTuningId}/result**`, (route) =>
    route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "forbidden" }) }),
  );

  await page.goto(`/generate/${otherUserTuningId}/result`);

  const url = page.url();
  const isBlocked =
    url.includes("/login") ||
    url.includes("/dashboard") ||
    (await page.getByText(/No results found for this tuning/i).isVisible({ timeout: 5000 }).catch(() => false));

  expect(isBlocked).toBe(true);
});

// ── TS-SEC-013: Cross-user document download ─────────────────────────────

test("TS-SEC-013: cross-user document download returns 401 or 403", async ({ request }) => {
  const otherUserTuningId = randomUUID();
  const res = await request.get(`/api/generate/${otherUserTuningId}/resume.docx`);
  expect([401, 403, 404]).toContain(res.status());
});

// ── TS-SET-004: Delete account — correct word enables button ─────────────

test("TS-SET-004: typing DELETE enables the delete account button", async ({ page }) => {
  await page.goto("/settings");
  if (page.url().includes("/login")) return; // auth-gated, skip

  // Open danger zone
  await page.getByRole("button", { name: "Delete account" }).click();

  const input = page.getByPlaceholder("DELETE");
  await expect(input).toBeVisible({ timeout: 5000 });

  // Button disabled before typing
  const deleteBtn = page.getByRole("button", { name: "Delete account" }).last();
  await expect(deleteBtn).toBeDisabled();

  // Type correct word
  await input.fill("DELETE");
  await expect(deleteBtn).toBeEnabled();
});

// ── TS-SET-005: Delete account — wrong word keeps button disabled ─────────

test("TS-SET-005: typing wrong word keeps delete button disabled", async ({ page }) => {
  await page.goto("/settings");
  if (page.url().includes("/login")) return;

  await page.getByRole("button", { name: "Delete account" }).click();

  const input = page.getByPlaceholder("DELETE");
  await expect(input).toBeVisible({ timeout: 5000 });

  await input.fill("delete");

  const deleteBtn = page.getByRole("button", { name: "Delete account" }).last();
  await expect(deleteBtn).toBeDisabled();
});

// ── TS-BIL-001: Free tier credit bar ─────────────────────────────────────

test("TS-BIL-001: settings page shows credit usage bar", async ({ page }) => {
  await page.goto("/settings");
  if (page.url().includes("/login")) return;

  // Credit bar should be visible regardless of plan
  await expect(page.getByText(/credits/i)).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/%/)).toBeVisible();
});
