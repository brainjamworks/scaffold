import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { InfoIcon as Info } from "@phosphor-icons/react";

import { RichFeedbackRuntimePopover } from "@/editor/blocks/assessment/shared/chrome/RichFeedbackRuntimePopover";
import { readAssessmentFeedbackContent } from "@/editor/blocks/assessment/shared/model/private-assessment-attrs";
import { findAncestorAssessmentId } from "@/editor/blocks/assessment/shared/model/assessment-prosemirror";
import { useAssessmentRuntimeById } from "@/editor/blocks/assessment/shared/runtime/use-assessment-runtime";
import { isAssessmentQuestionNode } from "./assessment-meta";
import { cn } from "@/lib/cn";
import { isScaffoldRichTextDocumentEmpty } from "@/schemas/rich-text";
import { iconSm } from "@/ui/tokens/icon-sizes";

import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";
import "./assessment-shared-chrome.css";

export const AssessmentSummaryFeedbackRuntimeNode = Node.create({
  name: "assessment_summary_feedback",
  defining: true,
  isolating: true,
  selectable: false,

  parseHTML() {
    return [{ tag: 'div[data-slot="assessment-summary-feedback"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-slot": "assessment-summary-feedback",
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AssessmentSummaryFeedbackRuntimeNodeView);
  },
});

function AssessmentSummaryFeedbackRuntimeNodeView(props: NodeViewProps) {
  const pos = safeGetPos(props.getPos);
  const problemId = findAncestorAssessmentId(props.editor, pos, isAssessmentQuestionNode);
  const problem = useAssessmentRuntimeById(problemId)?.problem ?? null;
  const result = problem?.officialResult ?? problem?.feedbackResult ?? null;
  const feedback = readAssessmentFeedbackContent(result?.feedback);

  const submitted = problem?.state.submitted ?? false;
  const answerKeyVisible = problem?.answerKeyVisible ?? false;
  const hasImmediateFeedback =
    problem?.state.feedbackMode === "immediate" && problem.feedbackResult !== null;

  if (!feedback || (!submitted && !answerKeyVisible && !hasImmediateFeedback)) {
    return (
      <NodeViewWrapper
        data-slot="assessment-summary-feedback"
        className="sc-assessment-field--hidden"
        contentEditable={false}
      ></NodeViewWrapper>
    );
  }

  const isCorrect = result?.isCorrect === true;
  const hasFeedback = !isScaffoldRichTextDocumentEmpty(feedback.document);

  return (
    <NodeViewWrapper
      data-slot="assessment-summary-feedback"
      className="sc-assessment-summary-feedback-runtime"
      contentEditable={false}
      role="status"
      aria-live="polite"
    >
      <RichFeedbackRuntimePopover
        feedback={feedback}
        triggerLabel="Show feedback"
        trigger={renderSummaryFeedbackActionTrigger({
          hasFeedback,
          resultState: isCorrect ? "correct" : "incorrect",
        })}
      />
    </NodeViewWrapper>
  );
}

function renderSummaryFeedbackActionTrigger({
  hasFeedback,
  resultState,
}: {
  hasFeedback: boolean;
  resultState?: "correct" | "incorrect";
}) {
  return (
    <button
      type="button"
      aria-label="Show feedback"
      className={cn(
        "sc-button",
        "sc-assessment-summary-feedback-trigger",
        hasFeedback && "sc-assessment-summary-feedback-trigger--has-feedback",
        resultState && `sc-assessment-summary-feedback-trigger--${resultState}`,
      )}
      data-size="md"
      data-variant="secondary"
      data-no-select
    >
      <Info
        size={iconSm}
        weight={hasFeedback ? "fill" : "regular"}
        aria-hidden
        className="sc-assessment-summary-feedback-trigger__icon"
      />
      <span className="sc-assessment-summary-feedback-trigger__text">Show feedback</span>
    </button>
  );
}
