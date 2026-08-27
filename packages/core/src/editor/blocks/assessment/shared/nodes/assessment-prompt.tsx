import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";

import {
  fieldContainerSpec,
  textContentExpression,
} from "@/document/model/content-model/content-groups";
import {
  assessmentPromptDomId,
  findAncestorAssessmentBlockId,
} from "@/editor/blocks/assessment/shared/model/assessment-prosemirror";
import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";
import { isFieldContentEmpty } from "@/document/model/content-model/is-field-content-empty";
import { isAssessmentQuestionNode } from "./assessment-meta";
import "./assessment-shared-chrome.css";

const ASSESSMENT_PROMPT_CONTENT = textContentExpression();

/**
 * Container for a question prompt's field content. Holds nodes in the
 * `text_content` group. Visually transparent in both author and
 * runtime mode — the parent (Mcq, Multiselect, etc.) NodeView renders
 * the surrounding chrome (card border, title above, choices below).
 * Tiptap's Placeholder extension surfaces the "Type the question
 * prompt…" guidance when the slot is empty.
 *
 * Groupless — only valid where a composite block's `content:` expression
 * names it. `isolating: true` keeps backspace at the start from merging
 * into the previous sibling.
 */
export const AssessmentPromptNode = Node.create({
  name: "assessment_prompt",
  ...fieldContainerSpec({ content: ASSESSMENT_PROMPT_CONTENT }),

  parseHTML() {
    return [{ tag: 'div[data-slot="assessment-prompt"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-slot": "assessment-prompt" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AssessmentPromptNodeView);
  },
});

function AssessmentPromptNodeView(props: NodeViewProps) {
  // The prompt is the centrepiece of every assessment block — bigger
  // than body, semibold, ink, with `text-wrap: balance` so headline-
  // length questions break evenly. Per the rebrand spec, hierarchy
  // inside an assessment block comes from this single weight + size
  // contrast against the (quieter) title, instructions, and choices.
  const authoredBlockId = findAncestorAssessmentBlockId(
    props.editor,
    safeGetPos(props.getPos),
    isAssessmentQuestionNode,
  );
  const isEditable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });
  const isEmpty = isFieldContentEmpty(props.node);

  return (
    <NodeViewWrapper
      id={assessmentPromptDomId(authoredBlockId)}
      data-assessment-prompt-empty={!isEditable && isEmpty ? "true" : undefined}
      data-slot="assessment-prompt"
      className="sc-course-assessment-prompt"
    >
      <NodeViewContent />
    </NodeViewWrapper>
  );
}
