// @vitest-environment jsdom

/**
 * Charter 14 Epic 01 — accessibility smoke tests for dashboard cards.
 *
 * Covers:
 *   - DashboardClient (metrics cards + JdPrompt area)
 *   - OnboardingV2MigrationCard (shown + dismissed states)
 */

import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { OnboardingV2MigrationCard } from "@/components/dashboard/onboarding-v2-migration-card";
import { expectNoAxeViolations } from "@/test-utils/axe";
import React, { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, it, vi } from "vitest";

(globalThis as { React?: typeof React }).React = React;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [k: string]: unknown }) =>
    React.createElement("a", { href, ...props }, children),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: { children: React.ReactNode; [k: string]: unknown }) =>
    React.createElement("button", props, children),
}));

// JdPrompt is a complex component — stub it for the axe test
vi.mock("@/components/generate/jd-prompt", () => ({
  JdPrompt: ({ onStart }: { onStart: unknown }) =>
    React.createElement("div", { "data-testid": "jd-prompt", role: "region", "aria-label": "Start a generation" },
      React.createElement("textarea", { "aria-label": "Job description", placeholder: "Paste a job description" }),
    ),
}));

describe("DashboardClient", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    vi.restoreAllMocks();
  });

  it("renders without critical/serious axe violations (empty state)", async () => {
    act(() => {
      root.render(
        React.createElement(DashboardClient, {
          firstName: "",
          profileScore: 0,
          shipped: 0,
          total: 0,
        }),
      );
    });
    await expectNoAxeViolations(container);
  });

  it("renders without critical/serious axe violations (populated state)", async () => {
    act(() => {
      root.render(
        React.createElement(DashboardClient, {
          firstName: "Alex",
          profileScore: 75,
          shipped: 3,
          total: 5,
        }),
      );
    });
    await expectNoAxeViolations(container);
  });
});

describe("OnboardingV2MigrationCard", () => {
  let container: HTMLDivElement;
  let root: Root;
  const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { store = {}; },
    };
  })();

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    Object.defineProperty(window, "localStorage", { value: localStorageMock, configurable: true });
    localStorageMock.removeItem("retune.onboarding_v2.migration_dismissed");
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    vi.restoreAllMocks();
  });

  it("shown state has no critical/serious axe violations", async () => {
    await act(async () => {
      root.render(React.createElement(OnboardingV2MigrationCard, { show: true }));
      // Let useEffect run
      await Promise.resolve();
    });
    await expectNoAxeViolations(container);
  });

  it("hidden (show=false) renders nothing — no violations", async () => {
    act(() => {
      root.render(React.createElement(OnboardingV2MigrationCard, { show: false }));
    });
    await expectNoAxeViolations(container);
  });
});
