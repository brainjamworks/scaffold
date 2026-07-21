import { type NodeViewProps } from "@tiptap/react";

import { useMediaPort } from "@/host/providers/ScaffoldServicesProvider";

import { parseAudioBlockData, useResolvedAudioBlockSource } from "./AudioBlockModel";
import { AudioBlockSurface } from "./AudioBlockSurface";

export function AudioBlockRuntimeView(props: NodeViewProps) {
  const mediaPort = useMediaPort();
  const data = parseAudioBlockData(props.node.attrs["data"]);
  const { errorMessage, resolvedUrl } = useResolvedAudioBlockSource(data, mediaPort);

  return (
    <AudioBlockSurface
      data={data}
      errorMessage={errorMessage}
      resolvedUrl={resolvedUrl}
      withWrapper={false}
    />
  );
}
