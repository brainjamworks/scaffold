import { useLayoutEffect, useRef } from "react";

const QUESTION_FRAME_SELECTOR =
  '[data-authoring-frame="block"][data-bounded-placement="fill"][data-id], [data-runtime-frame="block"][data-bounded-placement="fill"][data-id]';
const BOUNDED_RESPONSE_LANE_SELECTOR = "[data-assessment-bounded-scroll]";

export function useActiveQuestionScrollReset(activeQuestionId: string | null) {
  const quizRootRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const quizRoot = quizRootRef.current;
    if (!quizRoot || !activeQuestionId) return;

    const activeFrame = Array.from(
      quizRoot.querySelectorAll<HTMLElement>(QUESTION_FRAME_SELECTOR),
    ).find((frame) => frame.dataset.id === activeQuestionId);
    if (!activeFrame) return;

    for (const lane of activeFrame.querySelectorAll<HTMLElement>(BOUNDED_RESPONSE_LANE_SELECTOR)) {
      lane.scrollTop = 0;
    }
  }, [activeQuestionId]);

  return quizRootRef;
}
