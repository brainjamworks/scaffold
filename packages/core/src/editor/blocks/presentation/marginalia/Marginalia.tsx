import { NodeViewContent, type NodeViewProps } from "@tiptap/react";
import { MarginaliaDataSchema } from "@scaffold/contracts";

import { cn } from "@/lib/cn";

import { emptyMarginaliaData } from "./content";
import "./Marginalia.css";

export function MarginaliaView(props: NodeViewProps) {
  const parsed = MarginaliaDataSchema.safeParse(props.node.attrs["data"]);
  const data = parsed.success ? parsed.data : emptyMarginaliaData();

  return (
    <div data-position={data.position} className={cn("sc-marginalia")}>
      <NodeViewContent className="sc-marginalia__content" />
    </div>
  );
}
