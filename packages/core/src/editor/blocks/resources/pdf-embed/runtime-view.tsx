import { type NodeViewProps } from "@tiptap/react";
import { PdfEmbedDataSchema } from "@scaffold/contracts";

import { useMediaPort } from "@/host/providers/ScaffoldServicesProvider";

import { emptyPdfEmbedData } from "./content";
import { PdfEmbedSurface } from "./PdfEmbedSurface";

export function PdfEmbedRuntimeView(props: NodeViewProps) {
  const mediaPort = useMediaPort();
  const parsed = PdfEmbedDataSchema.safeParse(props.node.attrs["data"]);
  const data = parsed.success ? parsed.data : emptyPdfEmbedData();

  return <PdfEmbedSurface data={data} editable={false} mediaPort={mediaPort} />;
}
