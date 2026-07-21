import { NodeViewContent, type NodeViewProps } from "@tiptap/react";
import { StatHighlightDataSchema } from "@scaffold/contracts";

import { cn } from "@/lib/cn";

import { emptyStatHighlightData } from "./content";
import "./StatHighlight.css";

export function StatHighlightView(props: NodeViewProps) {
  const parsed = StatHighlightDataSchema.safeParse(props.node.attrs["data"]);
  const data = parsed.success ? parsed.data : emptyStatHighlightData();

  return (
    <div data-align={data.align} className={cn("sc-stat-highlight")}>
      <NodeViewContent className="sc-stat-highlight__content" />
    </div>
  );
}
