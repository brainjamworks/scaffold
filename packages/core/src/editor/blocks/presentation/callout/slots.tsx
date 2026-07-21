import { CalloutDataSchema } from "@scaffold/contracts";
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
import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";

import "./Callout.css";

const CALLOUT_TITLE_CONTENT = "paragraph";
const CALLOUT_PROMPT_CONTENT = textContentExpression();

export const CalloutTitleNode = Node.create({
  name: "callout_title",
  ...fieldContainerSpec({ content: CALLOUT_TITLE_CONTENT }),

  parseHTML() {
    return [{ tag: 'div[data-slot="callout-title"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-slot": "callout-title" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutTitleNodeView);
  },
});

export const CalloutPromptNode = Node.create({
  name: "callout_prompt",
  ...fieldContainerSpec({ content: CALLOUT_PROMPT_CONTENT }),

  parseHTML() {
    return [{ tag: 'div[data-slot="callout-prompt"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-slot": "callout-prompt" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutPromptNodeView);
  },
});

function resolveHeadingLevel(props: NodeViewProps): 3 | 4 | 5 {
  try {
    const pos = props.getPos();
    if (!isValidEditorDocPos(props.editor, pos)) return 4;
    const $pos = props.editor.state.doc.resolve(pos);
    for (let depth = $pos.depth; depth >= 0; depth -= 1) {
      const parent = $pos.node(depth);
      if (parent.type.name === "callout") {
        const parsed = CalloutDataSchema.safeParse(parent.attrs["data"]);
        return parsed.success ? parsed.data.headingLevel : 4;
      }
    }
  } catch {
    return 4;
  }
  return 4;
}

function CalloutTitleNodeView(props: NodeViewProps) {
  const isEditable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });
  const isEmpty = isFieldContentEmpty(props.node);

  if (!isEditable && isEmpty) {
    return (
      <NodeViewWrapper data-slot="callout-title" className="sc-callout__slot--hidden">
        <NodeViewContent />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      data-slot="callout-title"
      role="heading"
      aria-level={resolveHeadingLevel(props)}
      className="sc-callout__title"
    >
      <NodeViewContent />
    </NodeViewWrapper>
  );
}

function CalloutPromptNodeView(props: NodeViewProps) {
  const isEditable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });
  const isEmpty = isFieldContentEmpty(props.node);

  if (!isEditable && isEmpty) {
    return (
      <NodeViewWrapper data-slot="callout-prompt" className="sc-callout__slot--hidden">
        <NodeViewContent />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper data-slot="callout-prompt" className="sc-callout__prompt">
      <NodeViewContent />
    </NodeViewWrapper>
  );
}
