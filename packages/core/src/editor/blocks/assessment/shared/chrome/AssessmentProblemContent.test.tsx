// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { AssessmentProblemContent } from "./AssessmentProblemContent";

vi.mock("@tiptap/react", () => ({
  NodeViewContent: () => <div data-testid="assessment-content" />,
}));

describe("AssessmentProblemContent", () => {
  it("adapts Tiptap content into the Course-owned semantic assessment shell", () => {
    const { container } = render(
      <AssessmentProblemContent
        editable
        blockClass="sc-mcq"
        surfaceAttributes={{
          "aria-label": "Knowledge check",
          "data-surface-variant": "compact",
        }}
      />,
    );

    const shell = container.querySelector<HTMLElement>("section[data-assessment-shell]");

    expect(shell).not.toBeNull();
    expect(shell?.classList.contains("sc-course-assessment-shell")).toBe(true);
    expect(shell?.classList.contains("sc-mcq")).toBe(true);
    expect(shell?.classList.contains("sc-assessment-shell")).toBe(false);
    expect(shell?.getAttribute("data-editable")).toBe("true");
    expect(shell?.getAttribute("aria-label")).toBe("Knowledge check");
    expect(shell?.getAttribute("data-surface-variant")).toBe("compact");
    expect(screen.getByTestId("assessment-content").parentElement).toBe(shell);
  });
});
