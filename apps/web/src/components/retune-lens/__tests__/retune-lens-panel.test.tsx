// @vitest-environment jsdom

import { RetuneLensPanel } from "@/components/retune-lens";
import type { RetuneLensPreviewRequest, RetuneLensPreviewResponse } from "@/components/retune-lens";
import React from "react";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { React?: typeof React }).React = React;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Set a controlled input/textarea value via the native setter so React picks it up. */
function setControlledValue(el: HTMLTextAreaElement, value: string) {
  const proto = Object.getPrototypeOf(el);
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function makePreviewResponse(
  overrides: Partial<RetuneLensPreviewResponse> = {},
): RetuneLensPreviewResponse {
  return {
    previewId: "pv-1",
    previewToken: "token-abc-1234567890abcdef",
    before: {
      summary: {
        headline: "Old headline",
        narrative: "Old narrative.",
        confidenceLabel: "medium",
        caveats: [],
        sourceRefs: [],
        confirmed: false,
      },
    },
    after: {
      summary: {
        headline: "New headline",
        narrative: "New narrative.",
        confidenceLabel: "medium",
        caveats: [],
        sourceRefs: [],
        confirmed: false,
      },
    },
    changeSummary: ["Updated the headline"],
    evidenceRefs: [],
    ...overrides,
  };
}

describe("RetuneLensPanel", () => {
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
    container?.remove();
  });

  function renderPanel(
    props: Partial<{
      onPreview: (req: RetuneLensPreviewRequest) => Promise<RetuneLensPreviewResponse>;
      onApply: (id: string, token: string) => Promise<void>;
      stale: boolean;
    }> = {},
  ) {
    const onPreview = props.onPreview ?? vi.fn(async () => makePreviewResponse());
    const onApply = props.onApply ?? vi.fn(async () => {});
    act(() => {
      root.render(
        <RetuneLensPanel
          label="Tune this read"
          section="summary"
          defaultScope="summary"
          availableScopes={["summary", "all_positioning"]}
          stale={props.stale}
          onPreview={onPreview}
          onApply={onApply}
        />,
      );
    });
    return { onPreview, onApply };
  }

  it("renders the trigger in resting state", () => {
    renderPanel();
    const trigger = container.querySelector("button");
    expect(trigger).not.toBeNull();
    expect(trigger?.textContent).toContain("Tune this read");
  });

  it("opens the panel and focuses the textarea when clicked", () => {
    renderPanel();
    const trigger = container.querySelector("button") as HTMLButtonElement;
    act(() => {
      trigger.click();
    });
    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();
    // Allow microtasks for focus effect.
    expect(document.activeElement?.tagName.toLowerCase()).toBe("textarea");
  });

  it("calls onPreview when the user clicks Preview changes", async () => {
    const { onPreview } = renderPanel();
    const trigger = container.querySelector("button") as HTMLButtonElement;
    act(() => {
      trigger.click();
    });
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    act(() => {
      setControlledValue(textarea, "More technical please.");
    });
    const buttons = Array.from(container.querySelectorAll("button"));
    const preview = buttons.find((b) => b.textContent?.includes("Preview changes"));
    expect(preview).not.toBeUndefined();
    await act(async () => {
      preview?.click();
    });
    expect(onPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        section: "summary",
        scope: "summary",
        instruction: "More technical please.",
      }),
    );
  });

  it("shows the Apply button only after preview", async () => {
    const onPreview = vi.fn(async () => makePreviewResponse());
    renderPanel({ onPreview });

    let buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.find((b) => b.textContent === "Apply")).toBeUndefined();

    act(() => {
      (container.querySelector("button") as HTMLButtonElement).click();
    });
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    act(() => {
      setControlledValue(textarea, "Make it sharper.");
    });
    const previewBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Preview changes"),
    ) as HTMLButtonElement | undefined;
    await act(async () => {
      previewBtn?.click();
    });
    // Drain microtasks until React commits the post-await state.
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }
    buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.find((b) => b.textContent === "Apply")).toBeDefined();
  });

  it("calls onApply when the user clicks Apply", async () => {
    const onPreview = vi.fn(async () => makePreviewResponse());
    const onApply = vi.fn(async () => {});
    renderPanel({ onPreview, onApply });

    act(() => {
      (container.querySelector("button") as HTMLButtonElement).click();
    });
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    act(() => {
      setControlledValue(textarea, "Sharpen.");
    });
    const previewBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Preview changes"),
    ) as HTMLButtonElement | undefined;
    await act(async () => {
      previewBtn?.click();
    });
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }
    const applyBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Apply",
    ) as HTMLButtonElement | undefined;
    expect(applyBtn).toBeDefined();
    await act(async () => {
      applyBtn?.click();
    });
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }
    expect(onApply).toHaveBeenCalledWith("pv-1", "token-abc-1234567890abcdef");
  });

  it("renders a stale indicator when stale=true", () => {
    renderPanel({ stale: true });
    const trigger = container.querySelector("button") as HTMLButtonElement;
    const dot = trigger.querySelector('[aria-label="needs re-read"]');
    expect(dot).not.toBeNull();
  });

  it("Escape key closes the panel", () => {
    renderPanel();
    act(() => {
      (container.querySelector("button") as HTMLButtonElement).click();
    });
    expect(container.querySelector("textarea")).not.toBeNull();
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(container.querySelector("textarea")).toBeNull();
  });
});
