import { type NodeViewProps } from "@tiptap/react";
import { PdfEmbedDataSchema } from "@scaffold/contracts";
import { useRef } from "react";

import { useMediaPort } from "@/host/providers/ScaffoldServicesProvider";
import {
  useLearningEventReporter,
  type LearningEventReporter,
} from "@/runtime/learning-events/LearningEventRuntimeProvider";
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
  const learningEventReporter = useLearningEventReporter();
  const presentedSurfaceId = useRuntimePresentedSurfaceId();
  const owningSurfaceId = resolveOwningRuntimeSurfaceId(props.editor.state.doc, props.getPos);
  const isPresented =
    presentedSurfaceId === undefined ||
    (presentedSurfaceId !== null && owningSurfaceId === presentedSurfaceId);
  const resourceId = props.node.attrs["id"];
  const recordedPagesRef = useRef<{
    reporter: LearningEventReporter;
    resourceId: string;
    pages: Set<number>;
  } | null>(null);
  const recordLaunch = () => {
    if (typeof resourceId !== "string" || !resourceId.trim()) return;
    try {
      learningEventReporter.report({
        type: "resource.launched",
        resourceId,
        resourceKind: "pdf",
      });
    } catch {
      // Resource launch recording is observational and cannot prevent navigation.
    }
  };
  const recordPagePresented = (page: { pageNumber: number; pageCount: number }) => {
    if (typeof resourceId !== "string" || !resourceId.trim()) return;
    let recorded = recordedPagesRef.current;
    if (
      !recorded ||
      recorded.reporter !== learningEventReporter ||
      recorded.resourceId !== resourceId
    ) {
      recorded = { reporter: learningEventReporter, resourceId, pages: new Set() };
      recordedPagesRef.current = recorded;
    }
    if (recorded.pages.has(page.pageNumber)) return;
    try {
      learningEventReporter.report({
        type: "resource-page.experienced",
        resourceId,
        ...page,
      });
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
