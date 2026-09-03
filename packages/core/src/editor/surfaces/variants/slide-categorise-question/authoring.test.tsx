// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { SurfaceAuthoringViewProps } from "../../authoring/surface-authoring-view-registry";
import { SlideCategoriseQuestionSurfaceAuthoringView } from "./authoring";

vi.mock("../../authoring/views/SurfaceAuthoringFrame", () => ({
  SurfaceAuthoringFrame: ({
    children,
    className,
  }: {
    children?: ReactNode;
    className?: string;
  }) => (
    <div className={className} data-testid="surface-authoring-frame">
      {children}
    </div>
  ),
}));

afterEach(cleanup);

describe("SlideCategoriseQuestionSurfaceAuthoringView", () => {
  it("does not add a persistent answer-key explanation above the category editor", () => {
    render(<SlideCategoriseQuestionSurfaceAuthoringView {...({} as SurfaceAuthoringViewProps)} />);

    expect(screen.getByTestId("surface-authoring-frame")).toHaveClass(
      "sc-assessment-slide-surface-authoring-view",
    );
    expect(screen.getByTestId("surface-authoring-frame")).toBeEmptyDOMElement();
    expect(screen.queryByText("Answer key")).not.toBeInTheDocument();
    expect(screen.queryByText("Items are shuffled for learners")).not.toBeInTheDocument();
  });
});
