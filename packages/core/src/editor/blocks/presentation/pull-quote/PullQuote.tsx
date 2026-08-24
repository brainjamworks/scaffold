import { NodeViewContent, useEditorState, type NodeViewProps } from "@tiptap/react";
import { PullQuoteDataSchema, type PullQuoteAlign } from "@scaffold/contracts";

import { isFieldContentEmpty } from "@/document/model/content-model/is-field-content-empty";
import { normalizeBlockFrame } from "@/editor/frame/model/block-frame";

import { emptyPullQuoteData } from "./content";
import "./PullQuote.css";

export function PullQuoteView(props: NodeViewProps) {
  const isEditable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });
  const parsed = PullQuoteDataSchema.safeParse(props.node.attrs["data"]);
  const data = parsed.success ? parsed.data : emptyPullQuoteData();
  const align = resolvePullQuoteAlignment(props.node.attrs["frame"], data.align);
  const isEmpty =
    isFieldContentEmpty(props.node.child(0)) && isFieldContentEmpty(props.node.child(1));
  const isHidden = !isEditable && isEmpty;

  return (
    <blockquote
      hidden={isHidden}
      aria-hidden={isHidden || undefined}
      data-align={align}
      className="sc-course-pull-quote"
    >
      <NodeViewContent className="sc-course-pull-quote__content" />
    </blockquote>
  );
}

function resolvePullQuoteAlignment(
  frame: unknown,
  legacyAlignment: PullQuoteAlign,
): "left" | "center" | "right" {
  if (frame === null || frame === undefined) return legacyAlignment;

  const alignment = normalizeBlockFrame(frame).align;
  if (alignment === "center") return "center";
  if (alignment === "end") return "right";
  return "left";
}
