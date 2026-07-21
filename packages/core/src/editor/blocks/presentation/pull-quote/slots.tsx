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
import { isFieldContentEmpty } from "@/document/model/content-model/is-field-content-empty";

const PULL_QUOTE_BODY_CONTENT = textContentExpression();
const PULL_QUOTE_ATTRIBUTION_CONTENT = "paragraph";

export const PullQuoteBodyNode = Node.create({
  name: "pull_quote_body",
  ...fieldContainerSpec({ content: PULL_QUOTE_BODY_CONTENT }),

  parseHTML() {
    return [{ tag: 'div[data-slot="pull-quote-body"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-slot": "pull-quote-body" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PullQuoteBodyView);
  },
});

export const PullQuoteAttributionNode = Node.create({
  name: "pull_quote_attribution",
  ...fieldContainerSpec({ content: PULL_QUOTE_ATTRIBUTION_CONTENT }),

  parseHTML() {
    return [{ tag: 'div[data-slot="pull-quote-attribution"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-slot": "pull-quote-attribution",
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PullQuoteAttributionView);
  },
});

function PullQuoteBodyView() {
  return (
    <NodeViewWrapper data-slot="pull-quote-body" className="sc-pull-quote__body">
      <NodeViewContent />
    </NodeViewWrapper>
  );
}

function PullQuoteAttributionView(props: NodeViewProps) {
  const isEditable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });
  const isEmpty = isFieldContentEmpty(props.node);

  if (!isEditable && isEmpty) {
    return (
      <NodeViewWrapper
        data-slot="pull-quote-attribution"
        aria-hidden
        className="sc-pull-quote__attribution--hidden"
      >
        <NodeViewContent />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      data-slot="pull-quote-attribution"
      data-empty={isEmpty ? "true" : undefined}
      className="sc-pull-quote__attribution"
    >
      <NodeViewContent />
    </NodeViewWrapper>
  );
}
