// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { AssessmentAuthoringIconAction } from "../AssessmentAuthoringIconAction/AssessmentAuthoringIconAction";
import { AssessmentChoiceAuthoringRow } from "./AssessmentChoiceAuthoringRow";

afterEach(cleanup);

describe("AssessmentChoiceAuthoringRow", () => {
  it("owns authoring choice chrome and keeps rich content independent from correctness", async () => {
    const user = userEvent.setup();
    const onToggleCorrect = vi.fn();
    const onDelete = vi.fn();

    render(
      <AssessmentChoiceAuthoringRow
        correct={false}
        onToggleCorrect={onToggleCorrect}
        movementControl={<button type="button">Move choice</button>}
        feedbackControl={
          <AssessmentAuthoringIconAction label="Add feedback">
            i
          </AssessmentAuthoringIconAction>
        }
        deleteAction={{ label: "Delete choice 1", onAction: onDelete }}
      >
        <p>Editable answer</p>
      </AssessmentChoiceAuthoringRow>,
    );

    const row = screen.getByText("Editable answer").closest(".sc-app-assessment-choice-row");
    expect(row).not.toBeNull();
    expect(row?.querySelector(".sc-course-assessment-choice")).toBeNull();

    await user.click(screen.getByText("Editable answer"));
    expect(onToggleCorrect).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Toggle whether this choice is correct" }),
    );
    expect(onToggleCorrect).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Delete choice 1" }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("keeps the final delete action focusable and explains why it is unavailable", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();

    render(
      <AssessmentChoiceAuthoringRow
        correct
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
