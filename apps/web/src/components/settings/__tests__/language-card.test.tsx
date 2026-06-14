// @vitest-environment jsdom

/**
 * Charter 14 Epic 01 + Charter 16 — accessibility + behaviour smoke
 * for the LanguageCard.
 *
 * Asserts:
 *   - Zero critical/serious axe violations on render.
 *   - Active locale is reflected in the select's value.
 *   - Changing the select fires a POST to /api/i18n/locale with the
 *     new locale.
 */

import { LanguageCard } from "@/components/settings/language-card";
import { expectNoAxeViolations } from "@/test-utils/axe";
import React, { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

(globalThis as { React?: typeof React }).React = React;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("LanguageCard", () => {
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

  it("renders without critical/serious axe violations", async () => {
    act(() => {
      root.render(<LanguageCard activeLocale="en" />);
    });
    await expectNoAxeViolations(container);
  });

  it("shows the active locale as the selected option", () => {
    act(() => {
      root.render(<LanguageCard activeLocale="en-GB" />);
    });
    const select = container.querySelector("select") as HTMLSelectElement | null;
    expect(select).not.toBeNull();
    expect(select?.value).toBe("en-GB");
  });

  it("POSTs to /api/i18n/locale when the user picks a different locale", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ locale: "en-US" }) }));
    Object.defineProperty(window, "fetch", { value: fetchMock, configurable: true });
    // Stub reload so the test process doesn't crash.
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload: vi.fn() },
      configurable: true,
    });

    act(() => {
      root.render(<LanguageCard activeLocale="en" />);
    });
    const select = container.querySelector("select") as HTMLSelectElement;
    select.value = "en-US";
    act(() => {
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    // Wait one microtask flush so the async handler runs.
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/i18n/locale");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({ locale: "en-US" });
  });
});
