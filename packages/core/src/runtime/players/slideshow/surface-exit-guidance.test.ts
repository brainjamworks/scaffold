import { expect, it } from "vite-plus/test";

import type { SurfaceId } from "@/document/model/course-structure";
import type { PresentationWaitId } from "@/runtime/presentation/compiled-presentation-program";

import type { SurfaceExitBlocker } from "./surface-exit-environment";
import { getSurfaceExitGuidance } from "./surface-exit-guidance";

const SURFACE_ID = "surface00001" as SurfaceId;

it.each([
  {
    name: "Quiz-only",
    blockers: [quizBlocker()],
    guidance: "Complete this quiz before moving to another slide.",
  },
  {
    name: "Presentation-only",
    blockers: [presentationBlocker()],
    guidance: "Complete the required interaction before moving to another slide.",
  },
  {
    name: "combined",
    blockers: [quizBlocker(), presentationBlocker()],
    guidance: "Complete the required interactions before moving to another slide.",
  },
] as const)("provides accurate $name Surface Exit guidance", ({ blockers, guidance }) => {
  expect(getSurfaceExitGuidance(blockers)).toBe(guidance);
});

function quizBlocker(): SurfaceExitBlocker {
  return Object.freeze({
    reason: "quiz-not-complete",
    ownerId: "quiz-one",
    surfaceId: SURFACE_ID,
    attemptStatus: "in_progress",
  });
}

function presentationBlocker(): SurfaceExitBlocker {
  return Object.freeze({
    reason: "presentation-learner-wait",
    ownerId: "presentation-one",
    surfaceId: SURFACE_ID,
    waitId: "learner-wait" as PresentationWaitId,
  });
}
