import { type NodeViewProps } from "@tiptap/react";

import { useMediaPort } from "@/host/providers/ScaffoldServicesProvider";

import { parseImageBlockData, useResolvedImageBlockSource } from "./ImageBlockModel";
import { ImageBlockSurface } from "./ImageBlockSurface";

export function ImageBlockRuntimeView(props: NodeViewProps) {
  const mediaPort = useMediaPort();
  const data = parseImageBlockData(props.node.attrs["data"]);
  const { errorMessage, resolvedUrl } = useResolvedImageBlockSource(data, mediaPort);

  return (
    <ImageBlockSurface
      data={data}
      errorMessage={errorMessage}
      resolvedUrl={resolvedUrl}
      withWrapper={false}
    />
  );
}
