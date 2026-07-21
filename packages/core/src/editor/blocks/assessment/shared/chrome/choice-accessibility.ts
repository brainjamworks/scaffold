import type { ChoiceState } from "../runtime/types";

export interface ChoiceAccessibilityState {
  checked: boolean;
  hasFeedback: boolean;
  isEditable: boolean;
  state: ChoiceState;
  submitted: boolean;
}

export interface ChoiceAccessibilityDescription {
  text: string;
}

export function describeChoiceAccessibilityState({
  checked,
  hasFeedback,
  isEditable,
  state,
  submitted,
}: ChoiceAccessibilityState): ChoiceAccessibilityDescription | null {
  if (isEditable) return null;

  const parts: string[] = [];

  if (state === "missed") {
    parts.push("Correct answer");
  } else if (state === "correct") {
    parts.push(submitted ? "Submitted answer, correct" : "Selected answer, correct");
  } else if (state === "incorrect") {
    parts.push(submitted ? "Submitted answer, incorrect" : "Selected answer, incorrect");
  } else if (checked) {
    parts.push("Selected answer");
  }

  if (hasFeedback && state !== null) {
    parts.push("Feedback available");
  }

  return parts.length > 0 ? { text: parts.join(". ") } : null;
}
