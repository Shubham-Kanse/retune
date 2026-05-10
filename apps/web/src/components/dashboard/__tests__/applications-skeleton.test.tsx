import React from "react";
import { describe, expect, it } from "vitest";

(globalThis as { React?: typeof React }).React = React;

import { ApplicationsSkeleton } from "@/components/dashboard/applications-skeleton";

describe("ApplicationsSkeleton", () => {
  it("renders four placeholder rows with pulse styling", () => {
    const element = ApplicationsSkeleton() as React.ReactElement<{
      className?: string;
      children: React.ReactElement[];
    }>;

    expect(element.props.className).toContain("animate-pulse");
    expect(element.props.children).toHaveLength(4);
  });
});
