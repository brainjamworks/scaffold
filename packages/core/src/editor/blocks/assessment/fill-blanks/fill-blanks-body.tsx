import { Node as TiptapNode, mergeAttributes } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";

import { FILL_BLANK_INLINE_CONTENT } from "@/document/model/content-model/content-groups";
import { cn } from "@/lib/cn";

import "./FillBlanks.css";

const FILL_BLANKS_BODY_CONTENT = `${FILL_BLANK_INLINE_CONTENT}+`;

export const FillBlanksBodyNode = TiptapNode.create({
  name: "fill_blanks_body",
  content: FILL_BLANKS_BODY_CONTENT,
  defining: true,
  isolating: true,
  selectable: false,

  parseHTML() {
    return [{ tag: 'div[data-slot="fill-blanks-body"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-assessment-bounded-scroll-frame": "",
        "data-slot": "fill-blanks-body",
      }),
      ["div", { "data-assessment-bounded-scroll": "", class: "sc-fill-blanks-body-scroll" }, 0],
      [
        "div",
        { "data-assessment-bounded-scroll-hint": "", "aria-hidden": "true" },
        "Scroll for more ↓",
      ],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FillBlanksBodyNodeView);
  },
});

function FillBlanksBodyNodeView(props: NodeViewProps) {
  const isEditable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });

  return (
    <NodeViewWrapper
      data-assessment-bounded-scroll-frame=""
      data-slot="fill-blanks-body"
      className={cn(
        "sc-fill-blanks-body",
        isEditable ? "sc-fill-blanks-body--authoring" : "sc-fill-blanks-body--runtime",
      )}
    >
      <div data-assessment-bounded-scroll="" className="sc-fill-blanks-body-scroll">
        <NodeViewContent className="sc-fill-blanks-body-content" />
      </div>
      <div data-assessment-bounded-scroll-hint="" contentEditable={false} aria-hidden="true">
        Scroll for more ↓
      </div>
    </NodeViewWrapper>
  );
}
