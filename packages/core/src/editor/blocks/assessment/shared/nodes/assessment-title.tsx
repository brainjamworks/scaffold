import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";

import { fieldContainerSpec } from "@/document/model/content-model/content-groups";
import { isFieldContentEmpty } from "@/document/model/content-model/is-field-content-empty";
import { useAssessmentMetaOverflow } from "./use-assessment-meta-overflow";
import "./assessment-shared-chrome.css";

const ASSESSMENT_TITLE_CONTENT = "paragraph";

/**
 * Optional question title — single paragraph of field content
 * styled as a large semibold heading. Author-edited inline; the persistent
 * toolbar owns formatting controls for selections inside.
 */
export const AssessmentTitleNode = Node.create({
  name: "assessment_title",
  ...fieldContainerSpec({ content: ASSESSMENT_TITLE_CONTENT }),

  parseHTML() {
    return [{ tag: 'div[data-slot="assessment-title"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-slot": "assessment-title" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AssessmentTitleNodeView);
  },
});

function AssessmentTitleNodeView(props: NodeViewProps) {
  const isEditable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });
  const isEmpty = isFieldContentEmpty(props.node);
  const { wrapperRef, hasOverflow } = useAssessmentMetaOverflow(props.node.textContent);

  if (!isEditable && isEmpty) {
    return (
      <NodeViewWrapper data-slot="assessment-title" className="sc-assessment-field--hidden">
        <NodeViewContent />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      ref={wrapperRef}
      aria-label={!isEditable && hasOverflow ? props.node.textContent.trim() : undefined}
      data-course-overflow={hasOverflow ? "true" : undefined}
      data-slot="assessment-title"
      className="sc-course-assessment-meta-title"
      tabIndex={!isEditable && hasOverflow ? 0 : undefined}
    >
      <NodeViewContent className="sc-course-assessment-meta-content--inline" />
    </NodeViewWrapper>
  );
}
