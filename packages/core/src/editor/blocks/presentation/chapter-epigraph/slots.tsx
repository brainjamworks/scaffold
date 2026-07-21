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

const EPIGRAPH_BODY_CONTENT = "paragraph";
const EPIGRAPH_ATTRIBUTION_CONTENT = "paragraph";

export const ChapterEpigraphBodyNode = Node.create({
  name: "chapter_epigraph_body",
  ...fieldContainerSpec({ content: EPIGRAPH_BODY_CONTENT }),

  parseHTML() {
    return [{ tag: 'div[data-slot="chapter-epigraph-body"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-slot": "chapter-epigraph-body",
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EpigraphBodyView);
  },
});

export const ChapterEpigraphAttributionNode = Node.create({
  name: "chapter_epigraph_attribution",
  ...fieldContainerSpec({ content: EPIGRAPH_ATTRIBUTION_CONTENT }),

  parseHTML() {
    return [{ tag: 'div[data-slot="chapter-epigraph-attribution"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-slot": "chapter-epigraph-attribution",
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EpigraphAttributionView);
  },
});

function EpigraphBodyView() {
  return (
    <NodeViewWrapper data-slot="chapter-epigraph-body" className="sc-chapter-epigraph__body">
      <NodeViewContent />
    </NodeViewWrapper>
  );
}

function EpigraphAttributionView(props: NodeViewProps) {
  const isEditable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });
  const isEmpty = isFieldContentEmpty(props.node);

  if (!isEditable && isEmpty) {
    return (
      <NodeViewWrapper
        data-slot="chapter-epigraph-attribution"
        aria-hidden
        className="sc-chapter-epigraph__attribution--hidden"
      >
        <NodeViewContent />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      data-slot="chapter-epigraph-attribution"
      data-empty={isEmpty ? "true" : undefined}
      className="sc-chapter-epigraph__attribution"
    >
      <NodeViewContent />
    </NodeViewWrapper>
  );
}
