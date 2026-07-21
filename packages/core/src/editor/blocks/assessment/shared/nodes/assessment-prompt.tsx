import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";

import {
  fieldContainerSpec,
  textContentExpression,
} from "@/document/model/content-model/content-groups";
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

function AssessmentPromptNodeView() {
  // The prompt is the centrepiece of every assessment block — bigger
  // than body, semibold, ink, with `text-wrap: balance` so headline-
  // length questions break evenly. Per the rebrand spec, hierarchy
  // inside an assessment block comes from this single weight + size
  // contrast against the (quieter) title, instructions, and choices.
  return (
    <NodeViewWrapper data-slot="assessment-prompt" className="sc-assessment-prompt">
      <NodeViewContent />
    </NodeViewWrapper>
  );
}
