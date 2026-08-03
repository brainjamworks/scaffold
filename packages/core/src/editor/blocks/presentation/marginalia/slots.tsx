import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";

export const MarginaliaGutterNode = Node.create({
  name: "marginalia_gutter",
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,
  selectable: false,

  parseHTML() {
    return [{ tag: 'aside[data-slot="marginalia-gutter"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["aside", mergeAttributes(HTMLAttributes, { "data-slot": "marginalia-gutter" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(GutterView);
  },
});

export const MarginaliaMainNode = Node.create({
  name: "marginalia_main",
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,
  selectable: false,

  parseHTML() {
    return [{ tag: 'div[data-slot="marginalia-main"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-slot": "marginalia-main" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MainView);
  },
});

function GutterView() {
  return (
    <NodeViewWrapper
      as="aside"
      data-slot="marginalia-gutter"
      className="sc-course-marginalia__gutter"
    >
      <NodeViewContent className="sc-course-marginalia__gutter-content" />
    </NodeViewWrapper>
  );
}

function MainView() {
  return (
    <NodeViewWrapper data-slot="marginalia-main" className="sc-course-marginalia__main">
      <NodeViewContent className="sc-course-marginalia__main-content" />
    </NodeViewWrapper>
  );
}
