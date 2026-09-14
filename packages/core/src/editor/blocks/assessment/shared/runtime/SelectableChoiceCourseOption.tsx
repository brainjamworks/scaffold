import { InfoIcon as Info } from "@phosphor-icons/react";
import { AssessmentFeedbackContentSchema } from "@scaffold/contracts";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";

import { RichFeedbackRuntimePopover } from "@/editor/blocks/assessment/shared/chrome/RichFeedbackRuntimePopover";
import { AssessmentSelectableChoiceRow } from "@/ui/components/course/AssessmentSelectableChoiceRow/AssessmentSelectableChoiceRow";
import { iconSm } from "@/ui/tokens/icon-sizes";

import { describeMultiSelectLimitState } from "./assessment-interaction-runtime";
import { useAssessmentRuntimeById } from "./use-assessment-runtime";

const BOUNDED_ASSESSMENT_SELECTOR = '.sc-assessment-node-view[data-bounded-placement="fill"]';
const BOUNDED_SCROLL_SELECTOR =
  "[data-bounded-scroll], [data-selectable-choice-scroll], [data-mcq-choice-scroll]";
const SUBMIT_SCROLL_TARGET_ATTR = "data-assessment-runtime-submit-scroll-target";
const REVEAL_SCROLL_TARGET_ATTR = "data-assessment-runtime-reveal-scroll-target";
const SCROLL_TARGET_MARGIN_PX = 8;

export interface SelectableChoiceCourseOptionProps {
  readonly assessmentTargetId: string | null | undefined;
  readonly choiceId: string;
  readonly choiceText: string;
  readonly children: ReactNode;
  readonly fallbackChoiceLabel: string;
  readonly ordinal?: string;
}

export function SelectableChoiceCourseOption({
  assessmentTargetId,
  choiceId,
  choiceText,
  children,
  fallbackChoiceLabel,
  ordinal,
}: SelectableChoiceCourseOptionProps) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const assessment = useAssessmentRuntimeById(assessmentTargetId);
  const choice =
    assessment?.interaction.kind === "single-select" ||
    assessment?.interaction.kind === "multi-select"
      ? assessment.interaction
      : null;
  const accessibleChoiceLabel = choiceText || fallbackChoiceLabel;
  const feedbackTriggerLabel = `Show feedback for ${accessibleChoiceLabel}`;
  const runtimeFeedback = AssessmentFeedbackContentSchema.safeParse(
    assessment?.feedback.items?.[choiceId]?.feedback,
  );
  const feedbackControl = runtimeFeedback.success ? (
    <RichFeedbackRuntimePopover
      feedback={runtimeFeedback.data}
      triggerLabel={feedbackTriggerLabel}
      trigger={
        <button
          type="button"
          aria-label={feedbackTriggerLabel}
          className="sc-course-assessment-choice__feedback-action"
          data-no-select
        >
          <Info size={iconSm} weight="fill" aria-hidden />
        </button>
      }
    />
  ) : null;

  const state = choice ? choice.stateFor(choiceId) : null;
  const checked = choice ? choice.isSelected(choiceId) : false;
  const submitted = assessment?.problem?.state.submitted ?? false;
  const answerView = assessment?.problem?.answerView ?? "submitted";
  const runtimeReady = Boolean(assessment?.problem);
  const interactionLocked = assessment?.problem?.interactionLocked ?? false;
  const limitUnavailable =
    choice?.kind === "multi-select" ? choice.isChoiceUnavailable(choiceId) : false;
  const disabled = interactionLocked || limitUnavailable;
  const disabledReason =
    limitUnavailable && choice?.kind === "multi-select"
      ? describeMultiSelectLimitState({
          maxSelections: choice.maxSelections,
          selectedCount: choice.selectedCount,
        })
      : null;
  const inputType = choice?.inputType ?? "radio";
  const revealTarget = answerView === "correct" && checked;
  const submitTarget = submitted && checked;

  useScrollRuntimeChoiceIntoView({
    answerView,
    revealTarget,
    rowRef,
    runtimeReady,
    submitted,
    submitTarget,
  });

  return (
    <div
      ref={rowRef}
      data-id={choiceId}
      data-selectable-choice-option=""
      {...(submitTarget ? { [SUBMIT_SCROLL_TARGET_ATTR]: "" } : {})}
      {...(revealTarget ? { [REVEAL_SCROLL_TARGET_ATTR]: "" } : {})}
      className="sc-course-selectable-choice-interaction__choice"
    >
      <AssessmentSelectableChoiceRow
        id={choiceId}
        {...(assessment?.problem?.state.responseName
          ? { name: assessment.problem.state.responseName }
          : {})}
        inputType={inputType}
        {...(!choiceText ? { inputLabel: accessibleChoiceLabel } : {})}
        feedbackControl={feedbackControl}
        state={state}
        checked={checked}
        submitted={answerView === "submitted" && submitted}
        disabled={disabled}
        {...(disabledReason ? { disabledReason } : {})}
        onSelect={() => {
          if (!disabled) choice?.select(choiceId);
        }}
      >
        {ordinal ? (
          <span aria-hidden="true" className="sc-course-selectable-choice-interaction__ordinal">
            {ordinal}
          </span>
        ) : null}
        {children}
      </AssessmentSelectableChoiceRow>
    </div>
  );
}

interface ScrollIntoLaneMetrics {
  currentScrollTop: number;
  laneTop: number;
  laneBottom: number;
  targetTop: number;
  targetBottom: number;
  margin?: number;
}

export function resolveAssessmentChoiceScrollTop({
  currentScrollTop,
  laneBottom,
  laneTop,
  margin = SCROLL_TARGET_MARGIN_PX,
  targetBottom,
  targetTop,
}: ScrollIntoLaneMetrics): number {
  const topLimit = laneTop + margin;
  const bottomLimit = laneBottom - margin;
  const targetHeight = Math.max(0, targetBottom - targetTop);
  const visibleHeight = Math.max(0, bottomLimit - topLimit);

  if (targetHeight > visibleHeight) {
    return Math.max(0, currentScrollTop + targetTop - topLimit);
  }
  if (targetTop < topLimit) {
    return Math.max(0, currentScrollTop + targetTop - topLimit);
  }
  if (targetBottom > bottomLimit) {
    return Math.max(0, currentScrollTop + targetBottom - bottomLimit);
  }
  return currentScrollTop;
}

function useScrollRuntimeChoiceIntoView({
  answerView,
  revealTarget,
  rowRef,
  runtimeReady,
  submitted,
  submitTarget,
}: {
  answerView: "submitted" | "correct";
  revealTarget: boolean;
  rowRef: RefObject<HTMLElement | null>;
  runtimeReady: boolean;
  submitted: boolean;
  submitTarget: boolean;
}) {
  const previousStateRef = useRef({ answerView, runtimeReady, submitted });

  useEffect(() => {
    const previous = previousStateRef.current;
    previousStateRef.current = { answerView, runtimeReady, submitted };
    if (!runtimeReady || !previous.runtimeReady) return undefined;

    const shouldScrollSubmittedAnswer = !previous.submitted && submitted && submitTarget;
    const shouldScrollRevealedAnswer =
      previous.answerView !== "correct" && answerView === "correct" && revealTarget;
    if (!shouldScrollSubmittedAnswer && !shouldScrollRevealedAnswer) return undefined;
    const targetAttribute = shouldScrollSubmittedAnswer
      ? SUBMIT_SCROLL_TARGET_ATTR
      : REVEAL_SCROLL_TARGET_ATTR;
    const frame = window.requestAnimationFrame(() => {
      const element = rowRef.current;
      if (element) scrollChoiceTargetSetIntoLane(element, targetAttribute);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [answerView, revealTarget, rowRef, runtimeReady, submitted, submitTarget]);
}

function scrollChoiceTargetSetIntoLane(element: HTMLElement, targetAttribute: string): boolean {
  const lane = element.closest<HTMLElement>(BOUNDED_SCROLL_SELECTOR);
  if (!lane || lane.scrollHeight <= lane.clientHeight) return false;
  if (
    !lane.matches("[data-selectable-choice-scroll], [data-mcq-choice-scroll]") &&
    !element.closest(BOUNDED_ASSESSMENT_SELECTOR)
  ) {
    return false;
  }
  const targets = Array.from(lane.querySelectorAll<HTMLElement>(`[${targetAttribute}]`));
  const firstTarget = targets[0];
  const lastTarget = targets[targets.length - 1];
  if (!firstTarget || !lastTarget || firstTarget !== element) return false;

  const laneRect = lane.getBoundingClientRect();
  const firstTargetRect = firstTarget.getBoundingClientRect();
  const lastTargetRect = lastTarget.getBoundingClientRect();
  const nextScrollTop = resolveAssessmentChoiceScrollTop({
    currentScrollTop: lane.scrollTop,
    laneBottom: laneRect.bottom,
    laneTop: laneRect.top,
    targetBottom: lastTargetRect.bottom,
    targetTop: firstTargetRect.top,
  });
  if (nextScrollTop === lane.scrollTop) return false;
  lane.scrollTop = nextScrollTop;
  return true;
}
