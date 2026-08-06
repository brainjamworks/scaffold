import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { InfoIcon as Info } from "@phosphor-icons/react";

import { RichFeedbackRuntimePopover } from "@/editor/blocks/assessment/shared/chrome/RichFeedbackRuntimePopover";
import { readAssessmentFeedbackContent } from "@/editor/blocks/assessment/shared/model/private-assessment-attrs";
import { findAncestorAssessmentBlockId } from "@/editor/blocks/assessment/shared/model/assessment-prosemirror";
import { useAssessmentRuntimeById } from "@/editor/blocks/assessment/shared/runtime/use-assessment-runtime";
import { isAssessmentQuestionNode } from "./assessment-meta";
import { isScaffoldRichTextDocumentEmpty } from "@/schemas/rich-text";
import { iconSm } from "@/ui/tokens/icon-sizes";
import { AssessmentSupportButton } from "@/ui/components/course/AssessmentSupportButton/AssessmentSupportButton";

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
  const authoredBlockId = findAncestorAssessmentBlockId(
    props.editor,
    pos,
    isAssessmentQuestionNode,
  );
  const problem = useAssessmentRuntimeById(authoredBlockId)?.problem ?? null;
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
    >
      <RichFeedbackRuntimePopover
        feedback={feedback}
        triggerLabel="Show feedback"
        trigger={({ open }) =>
          renderSummaryFeedbackActionTrigger({
            hasFeedback,
            open,
            resultState: isCorrect ? "correct" : "incorrect",
          })
        }
      />
    </NodeViewWrapper>
  );
}

function renderSummaryFeedbackActionTrigger({
  hasFeedback,
  open,
  resultState,
}: {
  hasFeedback: boolean;
  open: boolean;
  resultState?: "correct" | "incorrect";
}) {
  return (
    <AssessmentSupportButton
      intent="feedback"
      outcome={resultState}
      expanded={open}
      aria-label="Show feedback"
      icon={<Info size={iconSm} weight={hasFeedback ? "fill" : "regular"} />}
      data-no-select
    >
      Show feedback
    </AssessmentSupportButton>
  );
}
