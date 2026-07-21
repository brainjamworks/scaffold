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

const STAT_VALUE_CONTENT = "paragraph";
const STAT_LABEL_CONTENT = "paragraph";
const STAT_CONTEXT_CONTENT = "paragraph";

export const StatHighlightValueNode = Node.create({
  name: "stat_highlight_value",
  ...fieldContainerSpec({ content: STAT_VALUE_CONTENT }),

  parseHTML() {
    return [{ tag: 'div[data-slot="stat-highlight-value"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-slot": "stat-highlight-value" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(StatValueView);
  },
});

export const StatHighlightLabelNode = Node.create({
  name: "stat_highlight_label",
  ...fieldContainerSpec({ content: STAT_LABEL_CONTENT }),

  parseHTML() {
    return [{ tag: 'div[data-slot="stat-highlight-label"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-slot": "stat-highlight-label" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(StatLabelView);
  },
});

export const StatHighlightContextNode = Node.create({
  name: "stat_highlight_context",
  ...fieldContainerSpec({ content: STAT_CONTEXT_CONTENT }),

  parseHTML() {
    return [{ tag: 'div[data-slot="stat-highlight-context"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-slot": "stat-highlight-context",
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(StatContextView);
  },
});

function StatValueView() {
  return (
    <NodeViewWrapper data-slot="stat-highlight-value" className="sc-stat-highlight__value">
      <NodeViewContent />
    </NodeViewWrapper>
  );
}

function StatLabelView() {
  return (
    <NodeViewWrapper data-slot="stat-highlight-label" className="sc-stat-highlight__label">
      <NodeViewContent />
    </NodeViewWrapper>
  );
}

function StatContextView(props: NodeViewProps) {
  const isEditable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });
  const isEmpty = isFieldContentEmpty(props.node);

  if (!isEditable && isEmpty) {
    return (
      <NodeViewWrapper
        data-slot="stat-highlight-context"
        aria-hidden
        className="sc-stat-highlight__context--hidden"
      >
        <NodeViewContent />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      data-slot="stat-highlight-context"
      data-empty={isEmpty ? "true" : undefined}
      className="sc-stat-highlight__context"
    >
      <NodeViewContent />
    </NodeViewWrapper>
  );
}
