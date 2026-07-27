import { type NodeViewProps } from "@tiptap/react";
import { PdfEmbedDataSchema } from "@scaffold/contracts";
import { useRef } from "react";

import { useMediaPort } from "@/host/providers/ScaffoldServicesProvider";
import {
  buildResourceLaunchedStatementDraft,
  buildResourcePageExperiencedStatementDraft,
  useXapiSession,
  type XapiSession,
} from "@/runtime/xapi";
import {
  resolveOwningRuntimeSurfaceId,
  useRuntimePresentedSurfaceId,
} from "@/runtime/renderer/runtime-surface-presentation";

import { emptyPdfEmbedData } from "./content";
import { PdfEmbedSurface } from "./PdfEmbedSurface";

export function PdfEmbedRuntimeView(props: NodeViewProps) {
  const mediaPort = useMediaPort();
  const parsed = PdfEmbedDataSchema.safeParse(props.node.attrs["data"]);
  const data = parsed.success ? parsed.data : emptyPdfEmbedData();
  const xapiSession = useXapiSession();
  const presentedSurfaceId = useRuntimePresentedSurfaceId();
  const owningSurfaceId = resolveOwningRuntimeSurfaceId(props.editor.state.doc, props.getPos);
  const isPresented =
    presentedSurfaceId === undefined ||
    (presentedSurfaceId !== null && owningSurfaceId === presentedSurfaceId);
  const resourceId = props.node.attrs["id"];
  const recordedPagesRef = useRef<{
    session: XapiSession;
    resourceId: string;
    pages: Set<number>;
  } | null>(null);
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
  const recordPagePresented = (page: { pageNumber: number; pageCount: number }) => {
    if (!xapiSession || typeof resourceId !== "string" || !resourceId.trim()) return;
    let recorded = recordedPagesRef.current;
    if (recorded?.session !== xapiSession || recorded.resourceId !== resourceId) {
      recorded = { session: xapiSession, resourceId, pages: new Set() };
      recordedPagesRef.current = recorded;
    }
    if (recorded.pages.has(page.pageNumber)) return;
    try {
      xapiSession.record(
        buildResourcePageExperiencedStatementDraft({
          rootActivityId: xapiSession.rootActivityId,
          resourceId,
          ...page,
        }),
      );
      recorded.pages.add(page.pageNumber);
    } catch {
      // Page recording is observational and cannot make the PDF unavailable.
    }
  };

  return (
    <PdfEmbedSurface
      data={data}
      editable={false}
      mediaPort={mediaPort}
      onOpen={recordLaunch}
      onPagePresented={recordPagePresented}
      presented={isPresented}
    />
  );
}
