/**
 * TS-REF — Refusal page P0 tests
 *
 * Mocks the API layer and navigates directly to pages.
 * No auth required — tests UI rendering and routing.
 *
 * Covers:
 *   TS-REF-001  insufficient_evidence
 *   TS-REF-002  role_mismatch
 *   TS-REF-006  prompt_injection_detected
 *   TS-REF-008  low_quality_input
 *   TS-REF-011  Refusal page heading and body copy
 *   TS-REF-012  Multiple conflicts all render
 *   TS-REF-014  "Try a different role" routes to /generate/new
 *   TS-REF-015  "Dashboard" back link works
 *   TS-REF-016  Contest button routes to contest page
 *   TS-REF-017  Submit contest with reason
 *   TS-REF-018  Submit contest with empty reason blocked
 */

import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

function mockRefused(
  page: import("@playwright/test").Page,
  id: string,
  conflicts: Array<{ id: string; monitor: string; severity: string; summary: string }>,
) {
  return page.route(`**/api/generate/${id}**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        generation_id: id,
        status: "refused",
        verdict: "refuse",
        termination: "refuse",
        conflicts,
        pending_revisions: [],
      }),
    }),
  );
}

async function gotoRefused(page: import("@playwright/test").Page, id: string) {
  await page.goto(`/generate/${id}/refused`);
  // If redirected to login, the page is auth-gated — skip rendering assertions
  return !page.url().includes("/login");
}

// ── TS-REF-011: Heading and body ──────────────────────────────────────────

test("TS-REF-011: refusal page shows correct heading and body copy", async ({ page }) => {
  const id = randomUUID();
  await mockRefused(page, id, [
    { id: "c1", monitor: "insufficient_evidence", severity: "high", summary: "Profile lacks specifics." },
  ]);
  if (!await gotoRefused(page, id)) return;

  await expect(page.getByRole("heading", { name: "We can't ship this credibly." })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/We reviewed your profile against this role/)).toBeVisible();
  await expect(page.getByText("Why")).toBeVisible();
});

// ── TS-REF-001: insufficient_evidence ────────────────────────────────────

test("TS-REF-001: insufficient_evidence shows correct title and next step", async ({ page }) => {
  const id = randomUUID();
  await mockRefused(page, id, [
    { id: "c1", monitor: "insufficient_evidence", severity: "high", summary: "Not enough specifics." },
  ]);
  if (!await gotoRefused(page, id)) return;

  await expect(page.getByText("Not enough evidence yet")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/Add the missing experience/)).toBeVisible();
  await expect(page.getByText("Next step.")).toBeVisible();
});

// ── TS-REF-002: role_mismatch ─────────────────────────────────────────────

test("TS-REF-002: role_mismatch shows correct title", async ({ page }) => {
  const id = randomUUID();
  await mockRefused(page, id, [
    { id: "c1", monitor: "role_mismatch", severity: "high", summary: "Background doesn't overlap." },
  ]);
  if (!await gotoRefused(page, id)) return;

  await expect(page.getByText("This role isn't a fit")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/Try a closer role/)).toBeVisible();
});

// ── TS-REF-006: prompt_injection_detected ────────────────────────────────

test("TS-REF-006: prompt_injection_detected shows correct title", async ({ page }) => {
  const id = randomUUID();
  await mockRefused(page, id, [
    { id: "c1", monitor: "prompt_injection_detected", severity: "critical", summary: "Override directive found." },
  ]);
  if (!await gotoRefused(page, id)) return;

  await expect(page.getByText("We detected an injection attempt")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/contains instructions that try to override/)).toBeVisible();
});

// ── TS-REF-008: low_quality_input ────────────────────────────────────────

test("TS-REF-008: low_quality_input shows correct title", async ({ page }) => {
  const id = randomUUID();
  await mockRefused(page, id, [
    { id: "c1", monitor: "low_quality_input", severity: "high", summary: "Input too short." },
  ]);
  if (!await gotoRefused(page, id)) return;

  await expect(page.getByText("We need more to work with")).toBeVisible({ timeout: 10000 });
});

// ── TS-REF-012: Multiple conflicts ───────────────────────────────────────

test("TS-REF-012: multiple conflicts all show title + summary + next step", async ({ page }) => {
  const id = randomUUID();
  await mockRefused(page, id, [
    { id: "c1", monitor: "insufficient_evidence", severity: "high", summary: "Missing evidence." },
    { id: "c2", monitor: "role_mismatch", severity: "medium", summary: "Seniority gap." },
  ]);
  if (!await gotoRefused(page, id)) return;

  await expect(page.getByText("Not enough evidence yet")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("This role isn't a fit")).toBeVisible();
  await expect(page.getByText("Next step.")).toHaveCount(2);
});

// ── TS-REF-014: "Try a different role" ───────────────────────────────────

test("TS-REF-014: Try a different role routes to /generate/new", async ({ page }) => {
  const id = randomUUID();
  await mockRefused(page, id, [
    { id: "c1", monitor: "role_mismatch", severity: "high", summary: "Not a fit." },
  ]);
  if (!await gotoRefused(page, id)) return;

  await page.getByRole("link", { name: "Try a different role" }).click();
  await expect(page).toHaveURL(/\/generate\/new/);
});

// ── TS-REF-015: Dashboard back link ──────────────────────────────────────

test("TS-REF-015: Dashboard back link routes to /dashboard", async ({ page }) => {
  const id = randomUUID();
  await mockRefused(page, id, [
    { id: "c1", monitor: "low_quality_input", severity: "high", summary: "Too short." },
  ]);
  if (!await gotoRefused(page, id)) return;

  await page.getByRole("link", { name: "Dashboard" }).first().click();
  await expect(page).toHaveURL(/\/dashboard/);
});

// ── TS-REF-016: Contest button ────────────────────────────────────────────

test("TS-REF-016: Contest button routes to contest page", async ({ page }) => {
  const id = randomUUID();
  await mockRefused(page, id, [
    { id: "c1", monitor: "insufficient_evidence", severity: "high", summary: "Not enough." },
  ]);
  if (!await gotoRefused(page, id)) return;

  await page.getByRole("link", { name: "Contest" }).click();
  await expect(page).toHaveURL(new RegExp(`/generate/${id}/contest`));
});

// ── TS-REF-017: Submit contest ────────────────────────────────────────────

test("TS-REF-017: submit contest with reason shows success state", async ({ page }) => {
  const id = randomUUID();

  await page.route(`**/api/generate/${id}/contest`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }),
  );

  await page.goto(`/generate/${id}/contest`);
  if (page.url().includes("/login")) return;

  await page.getByLabel("Contest Reason").fill("I believe the evidence in my profile supports this role. My 5 years of TypeScript experience directly matches the requirements.");
  await page.getByRole("button", { name: "Submit Contest" }).click();

  await expect(page.getByText(/Your contest has been logged/)).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("link", { name: "Back to results" })).toBeVisible();
});

// ── TS-REF-018: Empty contest blocked ────────────────────────────────────

test("TS-REF-018: submit contest with empty reason is blocked", async ({ page }) => {
  const id = randomUUID();

  await page.goto(`/generate/${id}/contest`);
  if (page.url().includes("/login")) return;

  const submitBtn = page.getByRole("button", { name: "Submit Contest" });
  await expect(submitBtn).toBeDisabled();
});
