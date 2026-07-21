import { type NodeViewProps } from "@tiptap/react";

import { readEmbedData } from "./embed-data";
import { EmbedSurface } from "./EmbedSurface";

export function EmbedRuntimeView(props: NodeViewProps) {
  const data = readEmbedData(props.node.attrs["data"]);

  return <EmbedSurface data={data} editable={false} />;
}
