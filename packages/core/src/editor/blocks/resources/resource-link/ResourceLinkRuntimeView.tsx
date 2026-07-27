import { ResourceLinkDataSchema } from "@scaffold/contracts";
import { NodeViewContent, type NodeViewProps } from "@tiptap/react";

import { buildResourceLaunchedStatementDraft, useXapiSession } from "@/runtime/xapi";

import { emptyResourceLinkData } from "./content";
import { ResourceLinkSurface } from "./ResourceLinkSurface";

export function ResourceLinkRuntimeView(props: NodeViewProps) {
  const parsed = ResourceLinkDataSchema.safeParse(props.node.attrs["data"]);
  const data = parsed.success ? parsed.data : emptyResourceLinkData();
  const xapiSession = useXapiSession();
  const resourceId = props.node.attrs["id"];
  const recordLaunch = () => {
    if (!xapiSession || typeof resourceId !== "string" || !resourceId.trim()) return;
    try {
      xapiSession.record(
        buildResourceLaunchedStatementDraft({
          rootActivityId: xapiSession.rootActivityId,
          resourceId,
          resourceKind: data.kind,
        }),
      );
    } catch {
      // Resource launch recording is observational and cannot prevent navigation.
    }
  };

  return (
    <ResourceLinkSurface data={data} editable={false} onOpen={recordLaunch}>
      <NodeViewContent />
    </ResourceLinkSurface>
  );
}
