// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { AssessmentRuntimePopoverShell } from "./AssessmentRuntimePopoverShell";

describe("AssessmentRuntimePopoverShell", () => {
  it("renders an accessible runtime title, action, and body content", () => {
    render(
      <AssessmentRuntimePopoverShell
        headerActions={<button type="button">Next hint</button>}
        icon={<span>?</span>}
        title="Hint 1"
        tone="hint"
      >
        <p>Try the smallest option first.</p>
      </AssessmentRuntimePopoverShell>,
    );

    expect(screen.getByRole("heading", { name: "Hint 1", level: 2 })).toBeInstanceOf(HTMLElement);
    expect(screen.getByRole("button", { name: "Next hint" })).toBeInstanceOf(HTMLButtonElement);
    expect(screen.getByText("Try the smallest option first.")).toBeInstanceOf(HTMLElement);
  });

  it("leaves floating-content accessibility ownership with its parent", () => {
    render(
      <AssessmentRuntimePopoverShell icon={<span>i</span>} title="Feedback" tone="feedback">
        <p>Review your answer.</p>
      </AssessmentRuntimePopoverShell>,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { name: "Feedback" })).toBeInstanceOf(HTMLElement);
  });
});
