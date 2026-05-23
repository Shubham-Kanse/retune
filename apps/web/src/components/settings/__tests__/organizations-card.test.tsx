// @vitest-environment jsdom

/**
 * Charter 14 Epic 01 + Charter 19 — accessibility + behaviour smoke
 * for the OrganizationsCard.
 *
 * Asserts:
 *   - Zero critical/serious axe violations on the loading + populated
 *     states.
 *   - Empty-state copy is shown when the user has no orgs.
 *   - The render survives the GET /api/orgs flow with mocked fetch.
 */

import { OrganizationsCard } from "@/components/settings/organizations-card";
import { expectNoAxeViolations } from "@/test-utils/axe";
import React, { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { React?: typeof React }).React = React;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("OrganizationsCard", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  async function flushAsync() {
    // Two microtask flushes to let the useEffect → fetch → setState chain settle.
    await Promise.resolve();
    await Promise.resolve();
  }

  it("loading state has no critical/serious axe violations", async () => {
    const fetchMock = vi.fn(
      // Never resolves: keeps the card in its loading branch for the axe check.
      () => new Promise<never>(() => undefined),
    );
    Object.defineProperty(window, "fetch", { value: fetchMock, configurable: true });
    act(() => {
      root.render(<OrganizationsCard />);
    });
    await expectNoAxeViolations(container);
  });

  it("empty state shows the create-workspace prompt", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ orgs: [], active_id: null }),
    }));
    Object.defineProperty(window, "fetch", { value: fetchMock, configurable: true });

    await act(async () => {
      root.render(<OrganizationsCard />);
      await flushAsync();
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/orgs");
    expect(container.textContent ?? "").toMatch(/Workspaces/i);
    // Empty-state guidance is visible.
    expect(container.textContent ?? "").toMatch(/aren't in any workspaces yet/i);
    await expectNoAxeViolations(container);
  });

  it("populated state renders the org name + role", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        orgs: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            name: "Acme Inc",
            slug: "acme-inc",
            kind: "team",
            role: "owner",
            member_count: 3,
          },
        ],
        active_id: "00000000-0000-4000-8000-000000000001",
      }),
    }));
    Object.defineProperty(window, "fetch", { value: fetchMock, configurable: true });

    await act(async () => {
      root.render(<OrganizationsCard />);
      await flushAsync();
    });
    expect(container.textContent ?? "").toMatch(/Acme Inc/);
    expect(container.textContent ?? "").toMatch(/owner/);
    expect(container.textContent ?? "").toMatch(/3 members/);
    await expectNoAxeViolations(container);
  });
});
