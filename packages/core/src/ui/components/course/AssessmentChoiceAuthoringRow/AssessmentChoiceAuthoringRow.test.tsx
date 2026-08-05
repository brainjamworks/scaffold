// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  AssessmentChoiceAuthoringAction,
  AssessmentChoiceAuthoringRow,
} from "./AssessmentChoiceAuthoringRow";

afterEach(cleanup);

describe("AssessmentChoiceAuthoringRow", () => {
  it("uses the Course choice surface while keeping author actions independent", async () => {
    const user = userEvent.setup();
    const onToggleCorrect = vi.fn();
    const onDelete = vi.fn();

    render(
      <AssessmentChoiceAuthoringRow
        correct={false}
        correctnessLabel="Toggle whether Editable answer is correct"
        onToggleCorrect={onToggleCorrect}
        movementControl={
          <AssessmentChoiceAuthoringAction intent="move" label="Move choice">
            Move
          </AssessmentChoiceAuthoringAction>
        }
        feedbackControl={
          <AssessmentChoiceAuthoringAction intent="feedback" label="Add feedback">
            Feedback
          </AssessmentChoiceAuthoringAction>
        }
        deleteAction={{ label: "Delete choice 1", onAction: onDelete }}
      >
        <p>Editable answer</p>
      </AssessmentChoiceAuthoringRow>,
    );

    const row = screen.getByText("Editable answer").closest(".sc-course-assessment-choice");
    expect(row).not.toBeNull();
    expect(row).toHaveClass("sc-course-assessment-choice--authoring");
    expect(row?.querySelector("[class*='sc-app-']")).toBeNull();

    await user.click(screen.getByText("Editable answer"));
    expect(onToggleCorrect).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Toggle whether Editable answer is correct" }),
    );
    expect(onToggleCorrect).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Delete choice 1" }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("keeps the final Course delete action focusable and explains why it is unavailable", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();

    render(
      <AssessmentChoiceAuthoringRow
        correct
        correctnessLabel="Toggle whether Only choice is correct"
        onToggleCorrect={() => undefined}
        deleteAction={{
          label: "Delete choice 1",
          onAction: onDelete,
          unavailableReason: "An assessment must contain at least one choice.",
        }}
      >
        Only choice
      </AssessmentChoiceAuthoringRow>,
    );

    const deleteButton = screen.getByRole("button", { name: "Delete choice 1" });
    expect(deleteButton).toHaveAttribute("aria-disabled", "true");
    expect(deleteButton).toHaveAccessibleDescription(
      "An assessment must contain at least one choice.",
    );

    await user.click(deleteButton);
    expect(onDelete).not.toHaveBeenCalled();
  });
});
