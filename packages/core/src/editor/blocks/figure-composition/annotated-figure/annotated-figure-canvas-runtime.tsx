import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactElement } from "react";

import { MediaExpandButton } from "@/editor/media/presentation/MediaExpandButton";
import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";
import { renderRuntimeRichTextNode } from "@/editor/rich-text/runtime/render-rich-text";
import { useMediaPort } from "@/host/providers/ScaffoldServicesProvider";
import {
  resolveOwningRuntimeSurfaceId,
  useRuntimePresentedSurfaceId,
} from "@/runtime/renderer/runtime-surface-presentation";
import {
  buildVisualItemExperiencedStatementDraft,
  useXapiSession,
  type XapiSession,
} from "@/runtime/xapi";
import type { AnnotatedFigureData } from "@scaffold/contracts";
import { Lightbox, type LightboxItem } from "@/ui/components/Lightbox/Lightbox";
import * as Popover from "@/ui/components/Popover/Popover";
import { PopoverSurface } from "@/ui/components/PopoverSurface/PopoverSurface";
import { zIndex } from "@/ui/overlays/z-index";

import { createAnnotatedFigureCanvasNode } from "./annotated-figure-canvas-shared";
import {
  resolveAnnotatedFigureModel,
  resolveAnnotatedFigureOwnerAtPosition,
  type AnnotatedFigureAnnotationProjection,
} from "./annotated-figure-document-model";
import { AnnotatedFigureRuntimeCaptionList } from "./AnnotatedFigureRuntimeCaptionList";
import { useResolvedAnnotatedFigureSource } from "./AnnotatedFigureModel";
import { AnnotatedFigureSurface } from "./AnnotatedFigureSurface";
import { emptyAnnotatedFigureData } from "./content";

const EMPTY_ANNOTATIONS: readonly AnnotatedFigureAnnotationProjection[] = [];

interface AnnotatedFigureRuntimeCompositionProps {
  annotations: readonly AnnotatedFigureAnnotationProjection[];
  data: AnnotatedFigureData;
  errorMessage: string | null;
  expandAction?: ReactElement | null;
  fileUrl: string | null;
  onOpenAnnotation?: (annotationId: string) => void;
  presentation: "compact" | "expanded";
}

export function hasAnnotatedFigureRuntimeCaption(
  annotation: AnnotatedFigureAnnotationProjection,
): boolean {
  return annotation.captionNode.content.size > 0;
}

function AnnotatedFigureRuntimeComposition({
  annotations,
  data,
  errorMessage,
  expandAction,
  fileUrl,
  onOpenAnnotation,
  presentation,
}: AnnotatedFigureRuntimeCompositionProps) {
  const [openAnnotationId, setOpenAnnotationId] = useState<string | null>(null);
  const popoverTitlePrefix = useId();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const openAnnotation = annotations.find(
    (annotation) =>
      annotation.id === openAnnotationId && hasAnnotatedFigureRuntimeCaption(annotation),
  );
  const liveOpenAnnotation = data.captionDisplay === "popover" ? openAnnotation : undefined;
  const openRuntimeAnnotation = (annotationId: string) => {
    onOpenAnnotation?.(annotationId);
    setOpenAnnotationId(annotationId);
  };

  useEffect(() => {
    if (openAnnotationId === null || liveOpenAnnotation) return;
    // The selected caption was removed, emptied, or changed back to List presentation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpenAnnotationId(null);
    queueMicrotask(() => stageRef.current?.focus());
  }, [liveOpenAnnotation, openAnnotationId]);

  const renderPinActivator = (
    annotation: Pick<AnnotatedFigureAnnotationProjection, "id" | "number" | "x" | "y">,
    activator: ReactElement,
  ) => {
    const projectedAnnotation = annotations.find((candidate) => candidate.id === annotation.id);
    if (!projectedAnnotation || !hasAnnotatedFigureRuntimeCaption(projectedAnnotation)) {
      return <span className="sc-annotated-figure__pin-number">{annotation.number}</span>;
    }

    const open = liveOpenAnnotation?.id === annotation.id;
    const titleId = `${popoverTitlePrefix}-${annotation.number}`;

    return (
      <Popover.Root
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            openRuntimeAnnotation(annotation.id);
          } else {
            setOpenAnnotationId((current) => (current === annotation.id ? null : current));
          }
        }}
      >
        <Popover.Trigger asChild>{activator}</Popover.Trigger>
        {open ? (
          <Popover.Portal>
            <Popover.Content
              aria-labelledby={titleId}
              className="sc-annotated-figure__caption-popover"
              collisionPadding={12}
              onClick={(event) => event.stopPropagation()}
              onEscapeKeyDown={(event) => {
                event.preventDefault();
                setOpenAnnotationId(null);
              }}
              onPointerDown={(event) => event.stopPropagation()}
              side="bottom"
              sideOffset={8}
              style={{ zIndex: zIndex.popover }}
            >
              <PopoverSurface title={`Annotation ${annotation.number}`} titleId={titleId}>
                <div className="sc-annotated-figure__runtime-popover-caption">
                  {renderRuntimeRichTextNode(
                    projectedAnnotation.captionNode.toJSON(),
                    `annotated-figure-popover:${projectedAnnotation.id}`,
                  )}
                </div>
              </PopoverSurface>
            </Popover.Content>
          </Popover.Portal>
        ) : null}
      </Popover.Root>
    );
  };

  return (
    <>
      <AnnotatedFigureSurface
        data={data}
        annotations={annotations}
        errorMessage={errorMessage}
        expandAction={expandAction}
        fileUrl={fileUrl}
        presentation={presentation === "expanded" ? "lightbox" : "compact"}
        stageRef={stageRef}
        {...(data.captionDisplay === "popover"
          ? {
              onActivatePin: openRuntimeAnnotation,
              pinActivationLabel: (annotation: { number: number }) =>
                `View annotation ${annotation.number}`,
              renderPinActivator,
            }
          : {})}
      />
      {presentation === "expanded" ? (
        <AnnotatedFigureRuntimeCaptionList
          annotations={annotations}
          presentation="expanded"
          visuallyHidden={data.captionDisplay === "popover"}
        />
      ) : null}
    </>
  );
}

export function AnnotatedFigureCanvasRuntimeView(props: NodeViewProps) {
  useEditorState({
    editor: props.editor,
    selector: ({ transactionNumber }) => transactionNumber,
  });
  const owner = resolveAnnotatedFigureOwnerAtPosition(
    props.editor.state.doc,
    safeGetPos(props.getPos),
  );
  const model = owner ? resolveAnnotatedFigureModel(owner) : null;
  const mediaPort = useMediaPort();
  const xapiSession = useXapiSession();
  const presentedSurfaceId = useRuntimePresentedSurfaceId();
  const owningSurfaceId = resolveOwningRuntimeSurfaceId(props.editor.state.doc, props.getPos);
  const isPresented =
    presentedSurfaceId === undefined ||
    (presentedSurfaceId !== null && owningSurfaceId === presentedSurfaceId);
  const data = model?.data ?? emptyAnnotatedFigureData();
  const source = useResolvedAnnotatedFigureSource(data, mediaPort);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const expandButtonRef = useRef<HTMLButtonElement | null>(null);
  const annotations = model?.annotations ?? EMPTY_ANNOTATIONS;
  const ownerId = String(model?.owner.node.attrs["id"] ?? "annotated-figure");
  const recordedAnnotationsRef = useRef<{
    session: XapiSession;
    ownerId: string;
    annotationIds: Set<string>;
  } | null>(null);
  const recordAnnotationOpened = useCallback(
    (annotationId: string) => {
      if (!isPresented || !xapiSession || !ownerId.trim()) return;
      const position = annotations.findIndex((annotation) => annotation.id === annotationId) + 1;
      if (position <= 0) return;

      let recorded = recordedAnnotationsRef.current;
      if (recorded?.session !== xapiSession || recorded.ownerId !== ownerId) {
        recorded = { session: xapiSession, ownerId, annotationIds: new Set() };
        recordedAnnotationsRef.current = recorded;
      }
      if (recorded.annotationIds.has(annotationId)) return;

      try {
        xapiSession.record(
          buildVisualItemExperiencedStatementDraft({
            rootActivityId: xapiSession.rootActivityId,
            compositionId: ownerId,
            itemId: annotationId,
            itemKind: "annotation",
            position,
            count: annotations.length,
          }),
        );
        recorded.annotationIds.add(annotationId);
      } catch {
        // Annotation recording is observational and cannot prevent caption access.
      }
    },
    [annotations, isPresented, ownerId, xapiSession],
  );

  const lightboxItems = useMemo<LightboxItem[]>(() => {
    if (!source.resolvedUrl) return [];
    return [
      {
        key: ownerId,
        src: source.resolvedUrl,
        alt: data.alt,
        render: () => (
          <div
            className="sc-annotated-figure__runtime-lightbox-composition"
            data-caption-display={data.captionDisplay}
          >
            <AnnotatedFigureRuntimeComposition
              annotations={annotations}
              data={data}
              errorMessage={source.errorMessage}
              fileUrl={source.resolvedUrl}
              onOpenAnnotation={recordAnnotationOpened}
              presentation="expanded"
            />
          </div>
        ),
      },
    ];
  }, [annotations, data, ownerId, recordAnnotationOpened, source.errorMessage, source.resolvedUrl]);

  return (
    <NodeViewWrapper
      data-node="annotated-figure-canvas"
      className="sc-annotated-figure__canvas-node"
    >
      <AnnotatedFigureRuntimeComposition
        annotations={annotations}
        data={data}
        errorMessage={source.errorMessage}
        expandAction={
          source.resolvedUrl ? (
            <MediaExpandButton
              ref={expandButtonRef}
              aria-label="Expand annotated figure"
              onClick={() => setLightboxOpen(true)}
              tooltipLabel="Expand annotated figure"
            />
          ) : null
        }
        fileUrl={source.resolvedUrl}
        onOpenAnnotation={recordAnnotationOpened}
        presentation="compact"
      />
      <Lightbox
        ariaLabel="Annotated figure viewer"
        items={lightboxItems}
        onOpenChange={setLightboxOpen}
        open={lightboxOpen && lightboxItems.length > 0}
        returnFocusRef={expandButtonRef}
      />
    </NodeViewWrapper>
  );
}

export const AnnotatedFigureRuntimeCanvasNode = createAnnotatedFigureCanvasNode({
  addNodeView: () => ReactNodeViewRenderer(AnnotatedFigureCanvasRuntimeView),
});
