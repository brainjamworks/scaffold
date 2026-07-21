import { ResourceLinkDataSchema } from "@scaffold/contracts";
import { NodeViewContent, type NodeViewProps } from "@tiptap/react";

import { emptyResourceLinkData } from "./content";
import { ResourceLinkSurface } from "./ResourceLinkSurface";

export function ResourceLinkRuntimeView(props: NodeViewProps) {
  const parsed = ResourceLinkDataSchema.safeParse(props.node.attrs["data"]);
  const data = parsed.success ? parsed.data : emptyResourceLinkData();

  return (
    <ResourceLinkSurface data={data} editable={false}>
      <NodeViewContent />
    </ResourceLinkSurface>
  );
}
