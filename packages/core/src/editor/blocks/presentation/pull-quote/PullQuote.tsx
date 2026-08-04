import { NodeViewContent, type NodeViewProps } from "@tiptap/react";
import { PullQuoteDataSchema, type PullQuoteAlign } from "@scaffold/contracts";

import { normalizeBlockFrame } from "@/editor/frame/model/block-frame";

import { emptyPullQuoteData } from "./content";
import "./PullQuote.css";

export function PullQuoteView(props: NodeViewProps) {
  const parsed = PullQuoteDataSchema.safeParse(props.node.attrs["data"]);
  const data = parsed.success ? parsed.data : emptyPullQuoteData();
  const align = resolvePullQuoteAlignment(props.node.attrs["frame"], data.align);

  return (
    <blockquote data-align={align} className="sc-course-pull-quote">
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
