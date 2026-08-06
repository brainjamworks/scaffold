import { NodeViewContent, type NodeViewProps } from "@tiptap/react";
import { ChapterEpigraphDataSchema, type ChapterEpigraphAlign } from "@scaffold/contracts";

import { normalizeBlockFrame } from "@/editor/frame/model/block-frame";

import { emptyChapterEpigraphData } from "./content";
import "./ChapterEpigraph.css";

export function ChapterEpigraphView(props: NodeViewProps) {
  const parsed = ChapterEpigraphDataSchema.safeParse(props.node.attrs["data"]);
  const data = parsed.success ? parsed.data : emptyChapterEpigraphData();
  const align = resolveChapterEpigraphAlignment(props.node.attrs["frame"], data.align);

  return (
    <blockquote data-align={align} className="sc-course-chapter-epigraph">
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
