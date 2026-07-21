import { NodeViewContent, type NodeViewProps } from "@tiptap/react";
import { ChapterEpigraphDataSchema } from "@scaffold/contracts";

import { cn } from "@/lib/cn";

import { emptyChapterEpigraphData } from "./content";
import "./ChapterEpigraph.css";

export function ChapterEpigraphView(props: NodeViewProps) {
  const parsed = ChapterEpigraphDataSchema.safeParse(props.node.attrs["data"]);
  const data = parsed.success ? parsed.data : emptyChapterEpigraphData();

  return (
    <blockquote data-align={data.align} className={cn("sc-chapter-epigraph")}>
      <NodeViewContent className="sc-chapter-epigraph__content" />
    </blockquote>
  );
}
