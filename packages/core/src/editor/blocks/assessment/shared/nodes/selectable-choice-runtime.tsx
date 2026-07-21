import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { DOMSerializer } from "@tiptap/pm/model";
import { useEffect, useMemo, useRef, type RefObject } from "react";

import { ChoiceAnswerItem } from "@/editor/blocks/assessment/shared/chrome/ChoiceAnswerItem";
import { findAncestorAssessmentId } from "@/editor/blocks/assessment/shared/model/assessment-prosemirror";
import { isAssessmentQuestionNode } from "./assessment-meta";
import { RichFeedbackRuntimePopover } from "@/editor/blocks/assessment/shared/chrome/RichFeedbackRuntimePopover";
import { useAssessmentRuntimeById } from "@/editor/blocks/assessment/shared/runtime/use-assessment-runtime";
import { AssessmentFeedbackContentSchema } from "@scaffold/contracts";
import { SelectableChoiceAttrsSchema, type SelectableChoiceAttrs } from "@/schemas/shared";

import { createSelectableChoiceNode, selectableChoiceBodyContent } from "./selectable-choice";
import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";
import { serializeStaticRichTextHtml } from "@/editor/rich-text/static/render-rich-text";

export const SelectableChoiceRuntimeNode = createSelectableChoiceNode({
  addNodeView: () => ReactNodeViewRenderer(SelectableChoiceRuntimeNodeView),
});

const BOUNDED_ASSESSMENT_SELECTOR = '.sc-assessment-node-view[data-bounded-placement="fill"]';
const BOUNDED_SCROLL_SELECTOR = "[data-assessment-bounded-scroll]";
const SUBMIT_SCROLL_TARGET_ATTR = "data-assessment-runtime-submit-scroll-target";
const REVEAL_SCROLL_TARGET_ATTR = "data-assessment-runtime-reveal-scroll-target";
const SCROLL_TARGET_MARGIN_PX = 8;

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

function SelectableChoiceRuntimeNodeView(props: NodeViewProps) {
  const rowRef = useRef<HTMLElement | null>(null);
  const parsed = SelectableChoiceAttrsSchema.safeParse(props.node.attrs);
  const attrs: SelectableChoiceAttrs = parsed.success ? parsed.data : { id: "" };

  const pos = safeGetPos(props.getPos);
  const problemId = findAncestorAssessmentId(props.editor, pos, isAssessmentQuestionNode);
  const assessment = useAssessmentRuntimeById(problemId);
  const choice =
    assessment?.interaction.kind === "single-select" ||
    assessment?.interaction.kind === "multi-select"
      ? assessment.interaction
      : null;

  const serializer = useMemo(
    () => DOMSerializer.fromSchema(props.editor.schema),
    [props.editor.schema],
  );
  const staticContentHtml = useMemo(() => {
    return serializeStaticRichTextHtml(serializer, selectableChoiceBodyContent(props.node));
  }, [props.node, serializer]);
  const choiceText = useMemo(
    () =>
      selectableChoiceBodyContent(props.node)
        .textBetween(0, selectableChoiceBodyContent(props.node).size, " ")
        .trim(),
    [props.node],
  );
  const feedbackTriggerLabel = choiceText ? `Show feedback for ${choiceText}` : "Show feedback";

  const runtimeFeedback = AssessmentFeedbackContentSchema.safeParse(
    assessment?.feedback.items?.[attrs.id]?.feedback,
  );
  const feedbackControl = runtimeFeedback.success ? (
    <RichFeedbackRuntimePopover
      feedback={runtimeFeedback.data}
      triggerLabel={feedbackTriggerLabel}
    />
  ) : null;

  const state = choice ? choice.stateFor(attrs.id) : null;
  const checked = choice ? choice.isSelected(attrs.id) : false;
  const submitted = assessment?.problem?.state.submitted ?? false;
  const answerKeyVisible = assessment?.problem?.answerKeyVisible ?? false;
  const runtimeReady = Boolean(assessment?.problem);
  const disabled = Boolean(submitted);
  const inputType = choice?.inputType ?? "radio";
  const revealTarget = answerKeyVisible && (state === "correct" || state === "missed");
  const submitTarget = submitted && checked;

  useScrollRuntimeChoiceIntoView({
    answerKeyVisible,
    revealTarget,
    rowRef,
    runtimeReady,
    submitted,
    submitTarget,
  });

  const handleSelect = () => {
    if (!disabled) choice?.select(attrs.id);
  };

  return (
    <NodeViewWrapper
      ref={rowRef}
      data-node="selectable-choice"
      data-choice-id={attrs.id}
      {...(submitTarget ? { [SUBMIT_SCROLL_TARGET_ATTR]: "" } : {})}
      {...(revealTarget ? { [REVEAL_SCROLL_TARGET_ATTR]: "" } : {})}
    >
      <ChoiceAnswerItem
        id={attrs.id}
        {...(assessment?.problem?.state.groupName
          ? { name: assessment.problem.state.groupName }
          : {})}
        inputType={inputType}
        isCorrect={false}
        feedbackControl={feedbackControl}
        isEditable={false}
        state={state}
        checked={checked}
        submitted={submitted}
        disabled={disabled}
        onSelect={handleSelect}
        onToggleCorrect={() => {}}
        onDelete={() => {}}
      >
        <div dangerouslySetInnerHTML={{ __html: staticContentHtml }} />
      </ChoiceAnswerItem>
    </NodeViewWrapper>
  );
}

function useScrollRuntimeChoiceIntoView({
  answerKeyVisible,
  revealTarget,
  rowRef,
  runtimeReady,
  submitted,
  submitTarget,
}: {
  answerKeyVisible: boolean;
  revealTarget: boolean;
  rowRef: RefObject<HTMLElement | null>;
  runtimeReady: boolean;
  submitted: boolean;
  submitTarget: boolean;
}) {
  const previousStateRef = useRef({ answerKeyVisible, runtimeReady, submitted });

  useEffect(() => {
    const previous = previousStateRef.current;
    previousStateRef.current = { answerKeyVisible, runtimeReady, submitted };
    if (!runtimeReady || !previous.runtimeReady) return undefined;

    const shouldScrollSubmittedAnswer = !previous.submitted && submitted && submitTarget;
    const shouldScrollRevealedAnswer =
      !previous.answerKeyVisible && answerKeyVisible && revealTarget;
    if (!shouldScrollSubmittedAnswer && !shouldScrollRevealedAnswer) return undefined;

    const targetAttribute = shouldScrollSubmittedAnswer
      ? SUBMIT_SCROLL_TARGET_ATTR
      : REVEAL_SCROLL_TARGET_ATTR;

    const frame = window.requestAnimationFrame(() => {
      const element = rowRef.current;
      if (!element) return;
      scrollChoiceTargetSetIntoBoundedLane(element, targetAttribute);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [answerKeyVisible, revealTarget, rowRef, runtimeReady, submitted, submitTarget]);
}

function scrollChoiceTargetSetIntoBoundedLane(
  element: HTMLElement,
  targetAttribute: string,
): boolean {
  if (!element.closest(BOUNDED_ASSESSMENT_SELECTOR)) return false;

  const lane = element.closest<HTMLElement>(BOUNDED_SCROLL_SELECTOR);
  if (!lane || lane.scrollHeight <= lane.clientHeight) return false;

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
