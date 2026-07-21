import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";

import {
  fieldContainerSpec,
  textContentExpression,
} from "@/document/model/content-model/content-groups";
const ASSESSMENT_HINT_CONTENT = textContentExpression();

/**
 * Container for one hint's field content.
 *
 * Authoring chrome is owned by the parent `assessment_hints_group`
 * popover. Runtime uses `AssessmentHintRuntimeNode`.
 */
export const AssessmentHintNode = Node.create({
  name: "assessment_hint",
  ...fieldContainerSpec({ content: ASSESSMENT_HINT_CONTENT }),

  parseHTML() {
    return [{ tag: 'div[data-slot="assessment-hint"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-slot": "assessment-hint" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AssessmentHintNodeView);
  },
});

function AssessmentHintNodeView() {
  return (
    <NodeViewWrapper
      data-slot="assessment-hint"
      className="sc-assessment-hint-source"
      contentEditable={false}
    />
  );
}
