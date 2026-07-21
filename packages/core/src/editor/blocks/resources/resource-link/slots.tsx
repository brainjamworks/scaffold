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

const RESOURCE_LINK_TITLE_CONTENT = "paragraph";
const RESOURCE_LINK_DESCRIPTION_CONTENT = textContentExpression();

export const ResourceLinkTitleNode = Node.create({
  name: "resource_link_title",
  ...fieldContainerSpec({ content: RESOURCE_LINK_TITLE_CONTENT }),

  parseHTML() {
    return [{ tag: 'div[data-slot="resource-link-title"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-slot": "resource-link-title" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResourceLinkTitleNodeView);
  },
});

export const ResourceLinkDescriptionNode = Node.create({
  name: "resource_link_description",
  ...fieldContainerSpec({ content: RESOURCE_LINK_DESCRIPTION_CONTENT }),

  parseHTML() {
    return [{ tag: 'div[data-slot="resource-link-description"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-slot": "resource-link-description",
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResourceLinkDescriptionNodeView);
  },
});

function ResourceLinkTitleNodeView(props: NodeViewProps) {
  const isEditable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });
  const isEmpty = isFieldContentEmpty(props.node);

  if (!isEditable && isEmpty) {
    return (
      <NodeViewWrapper
        data-slot="resource-link-title"
        aria-hidden
        className="sc-resource-link__suppressed"
      >
        <NodeViewContent />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper data-slot="resource-link-title" className="sc-resource-link__title">
      <NodeViewContent />
    </NodeViewWrapper>
  );
}

function ResourceLinkDescriptionNodeView(props: NodeViewProps) {
  const isEditable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });
  const isEmpty = isFieldContentEmpty(props.node);

  if (!isEditable && isEmpty) {
    return (
      <NodeViewWrapper
        data-slot="resource-link-description"
        aria-hidden
        className="sc-resource-link__suppressed"
      >
        <NodeViewContent />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      data-slot="resource-link-description"
      className="sc-resource-link__description"
    >
      <NodeViewContent />
    </NodeViewWrapper>
  );
}
