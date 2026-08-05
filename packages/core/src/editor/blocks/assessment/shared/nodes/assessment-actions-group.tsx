import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";

import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";

import { AssessmentControlLayout } from "../chrome/AssessmentControlLayout";
import { AuthoringAssessmentControls } from "../chrome/AssessmentControls";
import { resolveAssessmentFeedbackMode } from "./assessment-meta";

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

function AssessmentActionsGroupNodeView(props: NodeViewProps) {
  const feedbackMode = useEditorState({
    editor: props.editor,
    selector: ({ editor }) =>
      resolveAssessmentFeedbackMode(editor, safeGetPos(props.getPos)),
  });

  return (
    <NodeViewWrapper data-slot="assessment-actions-group">
      <AssessmentControlLayout
        support={<NodeViewContent className="sc-assessment-control-layout__content" />}
        submission={
          <AuthoringAssessmentControls feedbackMode={feedbackMode} />
        }
      />
    </NodeViewWrapper>
  );
}
