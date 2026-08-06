import { Node as TiptapNode, mergeAttributes } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";

import { FILL_BLANK_INLINE_CONTENT } from "@/document/model/content-model/content-groups";
import { assessmentPromptDomId } from "@/editor/blocks/assessment/shared/model/assessment-prosemirror";
import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";
import { FillBlanksSettingsSchema } from "@scaffold/contracts";

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
        "data-bounded-scroll-frame": "",
        "data-slot": "fill-blanks-body",
      }),
      ["div", { "data-bounded-scroll": "", class: "sc-course-fill-blanks__scroll" }, 0],
      ["div", { "data-bounded-scroll-hint": "", "aria-hidden": "true" }, "Scroll for more ↓"],
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
  const group = fillBlanksGroup(props);

  return (
    <NodeViewWrapper
      role="group"
      aria-label={group.legend || undefined}
      aria-labelledby={group.legend ? undefined : assessmentPromptDomId(group.authoredBlockId)}
      data-bounded-scroll-frame=""
      data-slot="fill-blanks-body"
      className="sc-course-fill-blanks__body"
      data-course-mode={isEditable ? "authoring" : "runtime"}
    >
      <div data-bounded-scroll="" className="sc-course-fill-blanks__scroll">
        <NodeViewContent className="sc-course-fill-blanks__content" />
      </div>
      <div data-bounded-scroll-hint="" contentEditable={false} aria-hidden="true">
        Scroll for more ↓
      </div>
    </NodeViewWrapper>
  );
}

function fillBlanksGroup(props: NodeViewProps): { authoredBlockId: string | null; legend: string } {
  const pos = safeGetPos(props.getPos);
  if (typeof pos !== "number") return { authoredBlockId: null, legend: "" };
  const resolved = props.editor.state.doc.resolve(pos);
  for (let depth = resolved.depth; depth >= 0; depth -= 1) {
    const node = resolved.node(depth);
    if (node.type.name !== "fill_blanks") continue;
    const id = node.attrs["id"];
    const settings = FillBlanksSettingsSchema.safeParse(node.attrs["settings"] ?? {});
    return {
      authoredBlockId: typeof id === "string" && id.trim() ? id : null,
      legend: settings.success ? (settings.data.legend?.trim() ?? "") : "",
    };
  }
  return { authoredBlockId: null, legend: "" };
}
