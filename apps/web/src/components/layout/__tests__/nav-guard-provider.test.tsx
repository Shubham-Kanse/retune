import React from "react";
import { describe, expect, it } from "vitest";

(globalThis as { React?: typeof React }).React = React;

import { NavGuardProvider } from "@/components/layout/nav-guard-provider";

describe("NavGuardProvider", () => {
  it("returns children without wrapping", () => {
    const child = React.createElement("span", null, "child");
    const element = NavGuardProvider({ children: child }) as React.ReactElement<{
      children: React.ReactNode;
    }>;

    expect(element.type).toBe(React.Fragment);
    expect(element.props.children).toBe(child);
  });
});
