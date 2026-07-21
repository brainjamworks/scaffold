import { describe, expect, it } from "vite-plus/test";

import { describeChoiceAccessibilityState } from "./choice-accessibility";

describe("choice accessibility state descriptions", () => {
  it("describes a pre-submit selected answer", () => {
    expect(
      describeChoiceAccessibilityState({
        checked: true,
        hasFeedback: false,
        isEditable: false,
        state: null,
        submitted: false,
      }),
    ).toEqual({ text: "Selected answer" });
  });

  it("describes submitted correct and incorrect answers", () => {
    expect(
      describeChoiceAccessibilityState({
        checked: true,
        hasFeedback: false,
        isEditable: false,
        state: "correct",
        submitted: true,
      }),
    ).toEqual({ text: "Submitted answer, correct" });

    expect(
      describeChoiceAccessibilityState({
        checked: true,
        hasFeedback: false,
        isEditable: false,
        state: "incorrect",
        submitted: true,
      }),
    ).toEqual({ text: "Submitted answer, incorrect" });
  });

  it("describes a revealed correct answer and available feedback", () => {
    expect(
      describeChoiceAccessibilityState({
        checked: false,
        hasFeedback: true,
        isEditable: false,
        state: "missed",
        submitted: true,
      }),
    ).toEqual({ text: "Correct answer. Feedback available" });
  });

  it("does not add learner review descriptions in author mode", () => {
    expect(
      describeChoiceAccessibilityState({
        checked: true,
        hasFeedback: true,
        isEditable: true,
        state: "correct",
        submitted: false,
      }),
    ).toBeNull();
  });
});
