// @vitest-environment jsdom

/**
 * Charter 14 Epic 01 — accessibility smoke tests for the Voice settings page.
 *
 * Asserts zero critical/serious axe violations in:
 *   - Loading state
 *   - Populated state (fingerprint present)
 *   - Empty state (no fingerprint yet)
 */

import { expectNoAxeViolations } from "@/test-utils/axe";
import React, { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, it, vi } from "vitest";

(globalThis as { React?: typeof React }).React = React;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// next-intl mock — returns the key as the translation
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// next/link mock
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement("a", { href }, children),
}));

// page-shell mock
vi.mock("@/components/app/page-shell", () => ({
  PageShell: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { "data-testid": "page-shell" }, children),
  PageHeader: ({ eyebrow, title, subtitle, action }: { eyebrow?: string; title?: string; subtitle?: string; action?: React.ReactNode }) =>
    React.createElement("header", null,
      eyebrow && React.createElement("p", null, eyebrow),
      title && React.createElement("h1", null, title),
      subtitle && React.createElement("p", null, subtitle),
      action,
    ),
}));

async function flushAsync() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("VoiceFingerprintSettingsPage", () => {
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

  it("loading state has no critical/serious axe violations", async () => {
    Object.defineProperty(window, "fetch", {
      value: () => new Promise<never>(() => undefined),
      configurable: true,
    });
    const { default: Page } = await import("@/app/(auth)/settings/voice/page");
    act(() => { root.render(React.createElement(Page)); });
    await expectNoAxeViolations(container);
  });

  it("populated state has no critical/serious axe violations", async () => {
    Object.defineProperty(window, "fetch", {
      value: vi.fn(async () => ({
        ok: true,
        json: async () => ({
          sampleSize: 12,
          updatedAt: "2026-01-15T10:00:00Z",
          dimensions: { formality: 0.7, conciseness: 0.8, assertiveness: 0.6 },
        }),
      })),
      configurable: true,
    });
    const { default: Page } = await import("@/app/(auth)/settings/voice/page");
    await act(async () => {
      root.render(React.createElement(Page));
      await flushAsync();
    });
    await expectNoAxeViolations(container);
  });

  it("empty state has no critical/serious axe violations", async () => {
    Object.defineProperty(window, "fetch", {
      value: vi.fn(async () => ({ ok: false })),
      configurable: true,
    });
    const { default: Page } = await import("@/app/(auth)/settings/voice/page");
    await act(async () => {
      root.render(React.createElement(Page));
      await flushAsync();
    });
    await expectNoAxeViolations(container);
  });
});
