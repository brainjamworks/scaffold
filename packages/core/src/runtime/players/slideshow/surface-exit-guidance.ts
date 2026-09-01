import type { SurfaceExitBlocker } from "./surface-exit-environment";

export function getSurfaceExitGuidance(blockers: readonly SurfaceExitBlocker[]): string {
  let quizBlocked = false;
  let presentationBlocked = false;

  for (const blocker of blockers) {
    switch (blocker.reason) {
      case "quiz-not-complete":
        quizBlocked = true;
        break;
      case "presentation-learner-wait":
        presentationBlocked = true;
        break;
    }
  }

  if (quizBlocked && presentationBlocked) {
    return "Complete the required interactions before moving to another slide.";
  }
  if (presentationBlocked) {
    return "Complete the required interaction before moving to another slide.";
  }
  if (quizBlocked) {
    return "Complete this quiz before moving to another slide.";
  }
  throw new Error("Surface Exit guidance requires at least one blocker.");
}
