import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";

import { TEXT_WRAP_IMAGE_BODY_NODE } from "./content";

export const TextWrapImageBodyNode = Node.create({
  name: TEXT_WRAP_IMAGE_BODY_NODE,
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,
  selectable: false,

  parseHTML() {
    return [{ tag: 'div[data-slot="text-wrap-image-body"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-slot": "text-wrap-image-body",
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(BodyView);
  },
});

function BodyView() {
  return (
    <NodeViewWrapper data-slot="text-wrap-image-body" className="sc-text-wrap-image__body">
      <NodeViewContent className="sc-text-wrap-image__body-content" />
    </NodeViewWrapper>
  );
}
