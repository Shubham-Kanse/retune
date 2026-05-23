// @vitest-environment jsdom

/**
 * Charter 14 Epic 01 — axe-core a11y smoke tests.
 *
 * Asserts that a rendered RetuneLensPanel has zero critical / serious
 * accessibility violations. This is the smallest of the five critical
 * components; the harness here doubles as a template for adding tests
 * against pipeline-view, chat-interface, profile-editor, results-view,
 * and the login form.
 */

import { RetuneLensPanel } from "@/components/retune-lens";
import { expectNoAxeViolations } from "@/test-utils/axe";
import React, { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, it, vi } from "vitest";

(globalThis as { React?: typeof React }).React = React;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("a11y smoke — RetuneLensPanel", () => {
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
  });

  it("resting trigger has no critical/serious axe violations", async () => {
    act(() => {
      root.render(
        <RetuneLensPanel
          label="Tune this read"
          section="summary"
          defaultScope="summary"
          availableScopes={["summary"]}
          onPreview={vi.fn(async () => {
            throw new Error("not invoked in this test");
          })}
          onApply={vi.fn(async () => {})}
        />,
      );
    });
    await expectNoAxeViolations(container);
  });
});
