import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";

import { AssessmentActionsRow } from "../chrome/AssessmentActionsRow";
import { AuthoringAssessmentControls } from "../chrome/AssessmentControls";

export const AssessmentActionsGroupNode = Node.create({
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
    return ReactNodeViewRenderer(AssessmentActionsGroupNodeView);
  },
});

function AssessmentActionsGroupNodeView() {
  return (
    <NodeViewWrapper data-slot="assessment-actions-group">
      <AssessmentActionsRow
        leading={<NodeViewContent className="sc-assessment-actions-row__content" />}
        commit={<AuthoringAssessmentControls problem={null} />}
      />
    </NodeViewWrapper>
  );
}
