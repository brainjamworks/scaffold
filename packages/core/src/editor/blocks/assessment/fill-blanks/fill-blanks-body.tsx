import { Node as TiptapNode, mergeAttributes } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";
import type { ReactNode } from "react";

import { FILL_BLANK_INLINE_CONTENT } from "@/document/model/content-model/content-groups";
import { assessmentPromptDomId } from "@/editor/assessment/shared/model/assessment-prosemirror";
import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";
import { FillBlanksSettingsSchema } from "@scaffold/contracts";

import { isFillBlanksAssessmentOwnerNodeType } from "@/editor/assessment/fill-blanks/fill-blank-shared";
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
      aria-label={
        group.legend || (!group.promptHasText ? "Fill in the blanks response" : undefined)
      }
      aria-labelledby={
        group.legend || !group.promptHasText
          ? undefined
          : assessmentPromptDomId(group.authoredBlockId)
      }
      data-bounded-scroll-frame=""
      data-slot="fill-blanks-body"
      className="sc-course-fill-blanks__body"
      data-course-mode={isEditable ? "authoring" : "runtime"}
      data-fill-blanks-presentation={group.presentation}
      {...(group.presentation === "full-slide"
        ? { "data-assessment-interaction-content": "" }
        : {})}
    >
      <FillBlanksCourseInteraction>
        <NodeViewContent className="sc-course-fill-blanks__content" />
      </FillBlanksCourseInteraction>
    </NodeViewWrapper>
  );
}

export function FillBlanksCourseInteraction({ children }: { children: ReactNode }) {
  return (
    <>
      <div data-bounded-scroll="" className="sc-course-fill-blanks__scroll">
        {children}
      </div>
      <div data-bounded-scroll-hint="" contentEditable={false} aria-hidden="true">
        Scroll for more ↓
      </div>
    </>
  );
}

function fillBlanksGroup(props: NodeViewProps): {
  authoredBlockId: string | null;
  legend: string;
  presentation: "inline" | "full-slide";
  promptHasText: boolean;
} {
  const pos = safeGetPos(props.getPos);
  if (typeof pos !== "number") {
    return {
      authoredBlockId: null,
      legend: "",
      presentation: "inline",
      promptHasText: false,
    };
  }
  const resolved = props.editor.state.doc.resolve(pos);
  for (let depth = resolved.depth; depth >= 0; depth -= 1) {
    const node = resolved.node(depth);
    if (!isFillBlanksAssessmentOwnerNodeType(node.type.name)) continue;
    const id = node.attrs["id"];
    const settings = FillBlanksSettingsSchema.safeParse(node.attrs["settings"] ?? {});
    return {
      authoredBlockId: typeof id === "string" && id.trim() ? id : null,
      legend: settings.success ? (settings.data.legend?.trim() ?? "") : "",
      presentation: node.type.name === "surface_fill_blanks_question" ? "full-slide" : "inline",
      promptHasText: assessmentPromptHasText(node),
    };
  }
  return {
    authoredBlockId: null,
    legend: "",
    presentation: "inline",
    promptHasText: false,
  };
}

function assessmentPromptHasText(node: NodeViewProps["node"]): boolean {
  for (let index = 0; index < node.childCount; index += 1) {
    const child = node.child(index);
    if (child.type.name === "assessment_prompt") return child.textContent.trim().length > 0;
  }
  return false;
}
