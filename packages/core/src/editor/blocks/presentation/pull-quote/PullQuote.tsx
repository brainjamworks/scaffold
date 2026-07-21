import { NodeViewContent, type NodeViewProps } from "@tiptap/react";
import { PullQuoteDataSchema } from "@scaffold/contracts";

import { cn } from "@/lib/cn";

import { emptyPullQuoteData } from "./content";
import "./PullQuote.css";

export function PullQuoteView(props: NodeViewProps) {
  const parsed = PullQuoteDataSchema.safeParse(props.node.attrs["data"]);
  const data = parsed.success ? parsed.data : emptyPullQuoteData();

  return (
    <blockquote data-align={data.align} className={cn("sc-pull-quote")}>
      <NodeViewContent className="sc-pull-quote__content" />
    </blockquote>
  );
}
