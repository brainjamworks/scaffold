import { type NodeViewProps } from "@tiptap/react";
import { PdfEmbedDataSchema } from "@scaffold/contracts";

import { useMediaPort } from "@/host/providers/ScaffoldServicesProvider";
import { buildResourceLaunchedStatementDraft, useXapiSession } from "@/runtime/xapi";

import { emptyPdfEmbedData } from "./content";
import { PdfEmbedSurface } from "./PdfEmbedSurface";

export function PdfEmbedRuntimeView(props: NodeViewProps) {
  const mediaPort = useMediaPort();
  const parsed = PdfEmbedDataSchema.safeParse(props.node.attrs["data"]);
  const data = parsed.success ? parsed.data : emptyPdfEmbedData();
  const xapiSession = useXapiSession();
  const resourceId = props.node.attrs["id"];
  const recordLaunch = () => {
    if (!xapiSession || typeof resourceId !== "string" || !resourceId.trim()) return;
    try {
      xapiSession.record(
        buildResourceLaunchedStatementDraft({
          rootActivityId: xapiSession.rootActivityId,
          resourceId,
          resourceKind: "pdf",
        }),
      );
    } catch {
      // Resource launch recording is observational and cannot prevent navigation.
    }
  };

  return (
    <PdfEmbedSurface
      data={data}
      editable={false}
      mediaPort={mediaPort}
      onOpen={recordLaunch}
    />
  );
}
