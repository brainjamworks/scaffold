import type { AssessmentInteractionKind } from "@scaffold/contracts";

export function missingResponseDescriptionForInteraction(
  interactionKind: AssessmentInteractionKind | null | undefined,
): string {
  switch (interactionKind) {
    case "single-select":
      return "Choose an answer before submitting.";
    case "multi-select":
      return "Choose at least one answer before submitting.";
    default:
      return "Complete the response before submitting.";
  }
}

export function attemptCounterAccessibilityLabel({
  attempts,
  maxAttempts,
}: {
  attempts: number;
  maxAttempts: number | null;
}): string {
  if (maxAttempts === null) return `Attempt ${attempts} used.`;
  if (attempts >= maxAttempts) return "Final attempt used.";
  return `${attempts} of ${maxAttempts} attempts used.`;
}

export function assessmentResultStatusText(isCorrect: boolean | null | undefined): string | null {
  if (isCorrect === true) return "Answer submitted. Correct.";
  if (isCorrect === false) return "Answer submitted. Incorrect.";
  return null;
}
