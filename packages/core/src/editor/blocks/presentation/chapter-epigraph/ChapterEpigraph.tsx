import { NodeViewContent, useEditorState, type NodeViewProps } from "@tiptap/react";
import { ChapterEpigraphDataSchema, type ChapterEpigraphAlign } from "@scaffold/contracts";

import { isFieldContentEmpty } from "@/document/model/content-model/is-field-content-empty";
import { normalizeBlockFrame } from "@/editor/frame/model/block-frame";

import { emptyChapterEpigraphData } from "./content";
import "./ChapterEpigraph.css";

export function ChapterEpigraphView(props: NodeViewProps) {
  const isEditable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });
  const parsed = ChapterEpigraphDataSchema.safeParse(props.node.attrs["data"]);
  const data = parsed.success ? parsed.data : emptyChapterEpigraphData();
  const align = resolveChapterEpigraphAlignment(props.node.attrs["frame"], data.align);
  const isEmpty =
    isFieldContentEmpty(props.node.child(0)) && isFieldContentEmpty(props.node.child(1));
  const isHidden = !isEditable && isEmpty;

  return (
    <blockquote
      hidden={isHidden}
      aria-hidden={isHidden || undefined}
      data-align={align}
      className="sc-course-chapter-epigraph"
    >
      <NodeViewContent className="sc-course-chapter-epigraph__content" />
    </blockquote>
  );
}

function resolveChapterEpigraphAlignment(
  frame: unknown,
  legacyAlignment: ChapterEpigraphAlign,
): "left" | "center" | "right" {
  if (frame === null || frame === undefined) return legacyAlignment;

  const alignment = normalizeBlockFrame(frame).align;
  if (alignment === "center") return "center";
  if (alignment === "end") return "right";
  return "left";
}
