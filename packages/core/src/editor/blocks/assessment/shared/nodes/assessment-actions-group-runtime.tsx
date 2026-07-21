import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";

import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";

import { AssessmentActionsRow } from "../chrome/AssessmentActionsRow";
import { RuntimeAssessmentControls } from "../chrome/AssessmentControls";
import { ShowAnswerButton } from "../chrome/ShowAnswerButton";
import { findAncestorAssessmentId } from "@/editor/blocks/assessment/shared/model/assessment-prosemirror";
import { useAssessmentRuntimeById } from "../runtime/use-assessment-runtime";
import { isAssessmentQuestionNode } from "./assessment-meta";

export const AssessmentActionsGroupRuntimeNode = Node.create({
  name: "assessment_actions_group",
  content: "assessment_hints_group assessment_summary_feedback",
  defining: true,
  isolating: true,
  selectable: false,

  parseHTML() {
    return [{ tag: 'div[data-slot="assessment-actions-group"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-slot": "assessment-actions-group",
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AssessmentActionsGroupRuntimeNodeView);
  },
});

function AssessmentActionsGroupRuntimeNodeView(props: NodeViewProps) {
  const pos = safeGetPos(props.getPos);
  const problemId = findAncestorAssessmentId(props.editor, pos, isAssessmentQuestionNode);
  const problem = useAssessmentRuntimeById(problemId)?.problem ?? null;
  const submitted = problem?.state.submitted ?? false;
  const result = problem?.officialResult ?? problem?.feedbackResult ?? null;
  const showShowAnswerHelper = Boolean(problem?.canRevealAnswer) && submitted && !result?.isCorrect;

  return (
    <NodeViewWrapper data-slot="assessment-actions-group">
      <AssessmentActionsRow
        leading={
          <>
            {showShowAnswerHelper ? (
              <span
                className="sc-assessment-actions-row__chrome sc-assessment-actions-row__chrome--show-answer"
                contentEditable={false}
              >
                <ShowAnswerButton
                  onClick={() => void problem?.revealAnswer()}
                  revealed={problem?.answerKeyVisible ?? false}
                />
              </span>
            ) : null}
            <NodeViewContent className="sc-assessment-actions-row__content" />
          </>
        }
        commit={
          <RuntimeAssessmentControls
            problem={problem}
            maxAttempts={problem?.state.maxAttempts ?? null}
          />
        }
      />
    </NodeViewWrapper>
  );
}
