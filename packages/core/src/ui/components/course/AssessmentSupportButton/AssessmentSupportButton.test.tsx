// @vitest-environment happy-dom

import { fireEvent, render, screen } from "@testing-library/react";
import { LightbulbIcon } from "@phosphor-icons/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { AssessmentSupportButton } from "./AssessmentSupportButton";

describe("AssessmentSupportButton", () => {
  it("renders a Course-owned native action with its feature-owned content", () => {
    const onAction = vi.fn();

    render(
      <AssessmentSupportButton
        intent="hint"
        icon={<LightbulbIcon aria-hidden />}
        expanded={false}
        onClick={onAction}
      >
        Show next hint
      </AssessmentSupportButton>,
    );

    const button = screen.getByRole("button", { name: "Show next hint" });
    expect(button).toHaveClass("sc-course-assessment-support-button");
    expect(button).toHaveAttribute("data-assessment-support-intent", "hint");
    expect(button).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(button);
    expect(onAction).toHaveBeenCalledOnce();
  });

  it("preserves native disabled semantics", () => {
    render(
      <AssessmentSupportButton intent="feedback" disabled onClick={vi.fn()}>
        Show feedback
      </AssessmentSupportButton>,
    );

    expect(screen.getByRole("button", { name: "Show feedback" })).toBeDisabled();
  });
});
