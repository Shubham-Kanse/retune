// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProfileEditModal } from "@/components/dashboard/profile-edit-modal";

(globalThis as { React?: typeof React }).React = React;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("ProfileEditModal", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    container?.remove();
  });

  it("resyncs form fields when profile prop changes while modal is open", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const onClose = vi.fn();
    const onSave = vi.fn();

    act(() => {
      root.render(
        <ProfileEditModal
          isOpen
          onClose={onClose}
          onSave={onSave}
          profile={{
            fullName: "Alice",
            currentTitle: "Engineer",
            location: "Dublin",
            targetRoles: [],
          }}
        />,
      );
    });

    const inputsBefore = container.querySelectorAll("input");
    expect((inputsBefore[0] as HTMLInputElement).value).toBe("Alice");
    expect((inputsBefore[1] as HTMLInputElement).value).toBe("Engineer");
    expect((inputsBefore[2] as HTMLInputElement).value).toBe("Dublin");

    act(() => {
      root.render(
        <ProfileEditModal
          isOpen
          onClose={onClose}
          onSave={onSave}
          profile={{
            fullName: "Bob",
            currentTitle: "Staff Engineer",
            location: "Cork",
            targetRoles: [],
          }}
        />,
      );
    });

    const inputsAfter = container.querySelectorAll("input");
    expect((inputsAfter[0] as HTMLInputElement).value).toBe("Bob");
    expect((inputsAfter[1] as HTMLInputElement).value).toBe("Staff Engineer");
    expect((inputsAfter[2] as HTMLInputElement).value).toBe("Cork");
  });
});
