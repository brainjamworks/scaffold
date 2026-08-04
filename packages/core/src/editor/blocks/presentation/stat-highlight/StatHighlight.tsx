import { NodeViewContent, type NodeViewProps } from "@tiptap/react";
import { StatHighlightDataSchema } from "@scaffold/contracts";

import { emptyStatHighlightData } from "./content";
import "./StatHighlight.css";

export function StatHighlightView(props: NodeViewProps) {
  const parsed = StatHighlightDataSchema.safeParse(props.node.attrs["data"]);
  const data = parsed.success ? parsed.data : emptyStatHighlightData();

  return (
    <div data-align={data.align} className="sc-course-stat-highlight">
      <NodeViewContent className="sc-course-stat-highlight__content" />
    </div>
  );
}
