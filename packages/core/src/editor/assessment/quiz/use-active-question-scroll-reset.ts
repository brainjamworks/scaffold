import { useLayoutEffect, useRef } from "react";

const QUESTION_FRAME_SELECTOR =
  '[data-authoring-frame="block"][data-bounded-placement="fill"][data-id], [data-runtime-frame="block"][data-bounded-placement="fill"][data-id]';
const BOUNDED_RESPONSE_LANE_SELECTOR = "[data-bounded-scroll]";
const ACTIVE_QUESTION_STAGE_SELECTOR =
  "[data-quiz-question-stage]:not(.sc-course-quiz__stage--hidden), [data-full-slide-question-stage]";

export function useActiveQuestionScrollReset<T extends HTMLElement = HTMLElement>(
  activeQuestionId: string | null,
  runtimeStatus?: "not_started" | "in_progress" | "completed" | "expired",
) {
  const quizRootRef = useRef<T | null>(null);
  const previousRuntimeStatusRef = useRef(runtimeStatus);

  useLayoutEffect(() => {
    const quizRoot = quizRootRef.current;
    const startedNow =
      previousRuntimeStatusRef.current === "not_started" && runtimeStatus === "in_progress";
    previousRuntimeStatusRef.current = runtimeStatus;
    if (!quizRoot || !activeQuestionId) return;

    if (startedNow) {
      quizRoot
        .querySelector<HTMLElement>(ACTIVE_QUESTION_STAGE_SELECTOR)
        ?.focus({ preventScroll: true });
    }

    const activeFrame = Array.from(
      quizRoot.querySelectorAll<HTMLElement>(QUESTION_FRAME_SELECTOR),
    ).find((frame) => frame.dataset.id === activeQuestionId);
    if (!activeFrame) return;

    for (const lane of activeFrame.querySelectorAll<HTMLElement>(BOUNDED_RESPONSE_LANE_SELECTOR)) {
      lane.scrollTop = 0;
    }
  }, [activeQuestionId, runtimeStatus]);

  return quizRootRef;
}
