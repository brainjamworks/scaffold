// @vitest-environment happy-dom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { AssessmentSubmissionControl } from "./AssessmentSubmissionControl";

describe("AssessmentSubmissionControl", () => {
  it("renders a disabled submit action with an independently announced reason", () => {
    render(
      <AssessmentSubmissionControl
        state="submit"
        disabled
        disabledReason="Choose an answer before submitting."
        onAction={vi.fn()}
      />,
    );

    const submit = screen.getByRole("button", { name: "Submit" });
    expect(submit).toBeDisabled();
    expect(submit).toHaveClass("sc-course-assessment-submission-control__button");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Choose an answer before submitting.",
    );
  });

  it("renders retry as the mutually exclusive primary action", () => {
    const onAction = vi.fn(() => Promise.resolve());
    render(<AssessmentSubmissionControl state="retry" onAction={onAction} />);

    expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onAction).toHaveBeenCalledOnce();
  });

  it.each([
    ["correct", "Correct"],
    ["submitted", "Submitted"],
  ] as const)("renders %s as a noninteractive terminal status", (state, label) => {
    render(<AssessmentSubmissionControl state={state} />);

    const status = screen.getByRole("status", { name: label });
    expect(status).toHaveAttribute("data-assessment-submission-status", state);
    expect(status).not.toHaveAttribute("tabindex");
    expect(screen.queryByRole("button")).toBeNull();
  });
});
