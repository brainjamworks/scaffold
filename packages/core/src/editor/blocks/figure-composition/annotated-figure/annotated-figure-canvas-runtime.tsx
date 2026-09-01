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
  useLearningEventReporter,
  type LearningEventReporter,
} from "@/runtime/learning-events/LearningEventRuntimeProvider";
import type { AnnotatedFigureData } from "@scaffold/contracts";
import { Lightbox, type LightboxItem } from "@/ui/components/Lightbox/Lightbox";
import * as Popover from "@/ui/components/Popover/Popover";
import { CoursePopoverSurface } from "@/ui/components/course/CoursePopoverSurface/CoursePopoverSurface";
import { CourseThemePortalBoundary } from "@/theme/course/CourseThemeProvider";
import { zIndex } from "@/ui/overlays/z-index";

import { createAnnotatedFigureCanvasNode } from "./annotated-figure-canvas-shared";
import {
  useAnnotatedFigureControlBinding,
  useAnnotatedFigureSemanticActivationBinding,
} from "./annotated-figure-control-binding";
import {
  resolveAnnotatedFigureModel,
  resolveAnnotatedFigureOwnerAtPosition,
  type AnnotatedFigureAnnotationProjection,
} from "./annotated-figure-document-model";
import {
  createAnnotatedFigureRuntimeController,
  useAnnotatedFigureOpenAnnotationId,
  type AnnotatedFigureRuntimeController,
} from "./annotated-figure-runtime-controller";
import { AnnotatedFigureRuntimeCaptionList } from "./AnnotatedFigureRuntimeCaptionList";
import { useResolvedAnnotatedFigureSource } from "./AnnotatedFigureModel";
import { AnnotatedFigureSurface } from "./AnnotatedFigureSurface";
import { emptyAnnotatedFigureData } from "./content";

const EMPTY_ANNOTATIONS: readonly AnnotatedFigureAnnotationProjection[] = [];

interface AnnotatedFigureRuntimeCompositionProps {
  active: boolean;
  annotations: readonly AnnotatedFigureAnnotationProjection[];
  controller: AnnotatedFigureRuntimeController;
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
  return annotation.title.trim().length > 0 || annotation.captionNode.content.size > 0;
}

function AnnotatedFigureRuntimeComposition({
  active,
  annotations,
  controller,
  data,
  errorMessage,
  expandAction,
  fileUrl,
  onOpenAnnotation,
  presentation,
}: AnnotatedFigureRuntimeCompositionProps) {
  const openAnnotationId = useAnnotatedFigureOpenAnnotationId(controller);
  const popoverTitlePrefix = useId();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const openAnnotation = annotations.find((annotation) => annotation.id === openAnnotationId);
  const liveOpenAnnotation =
    active && data.captionDisplay === "popover" ? openAnnotation : undefined;
  const markCaptionTargets = presentation === "expanded" && data.captionDisplay === "list";
  const markPinTargets = !markCaptionTargets;
  const openRuntimeAnnotation = (annotationId: string) => {
    if (controller.getOpenAnnotationId() === annotationId) return;
    onOpenAnnotation?.(annotationId);
    controller.setOpenAnnotationId(annotationId, "learner");
  };
  const toggleRuntimeAnnotation = (annotationId: string) => {
    if (controller.getOpenAnnotationId() === annotationId) {
      controller.setOpenAnnotationId(null, "learner");
      return;
    }
    openRuntimeAnnotation(annotationId);
  };

  const renderPinActivator = (
    annotation: Pick<AnnotatedFigureAnnotationProjection, "id" | "number" | "x" | "y">,
    activator: ReactElement,
  ) => {
    const projectedAnnotation = annotations.find((candidate) => candidate.id === annotation.id);
    if (!projectedAnnotation) {
      return <span className="sc-course-annotated-figure__pin-number">{annotation.number}</span>;
    }

    const open = liveOpenAnnotation?.id === annotation.id;
    const titleId = `${popoverTitlePrefix}-${annotation.number}`;

    return (
      <Popover.Root
        open={open}
        onOpenChange={(nextOpen) => {
          if (active && !nextOpen) controller.requestLearnerClose(annotation.id);
        }}
      >
        <Popover.Trigger asChild>{activator}</Popover.Trigger>
        {open ? (
          <Popover.Portal>
            <Popover.Content
              aria-labelledby={titleId}
              className="sc-course-annotated-figure__caption-popover"
              collisionPadding={12}
              onClick={(event) => event.stopPropagation()}
              onEscapeKeyDown={(event) => {
                event.preventDefault();
                controller.setOpenAnnotationId(null, "learner");
              }}
              onPointerDown={(event) => event.stopPropagation()}
              side="bottom"
              sideOffset={8}
              style={{ zIndex: zIndex.popover }}
            >
              <CoursePopoverSurface
                title={projectedAnnotation.title || `Annotation ${annotation.number}`}
                titleId={titleId}
                tone="annotation"
              >
                {projectedAnnotation.captionNode.content.size > 0 ? (
                  <div className="sc-course-annotated-figure__runtime-popover-caption">
                    {renderRuntimeRichTextNode(
                      projectedAnnotation.captionNode.toJSON(),
                      `annotated-figure-popover:${projectedAnnotation.id}`,
                    )}
                  </div>
                ) : null}
              </CoursePopoverSurface>
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
        markAnnotationTargets={markPinTargets}
        presentation={presentation === "expanded" ? "lightbox" : "compact"}
        stageRef={stageRef}
        {...(data.captionDisplay === "popover"
          ? {
              onActivatePin: toggleRuntimeAnnotation,
              pinActivationLabel: (annotation: { number: number }) =>
                `View annotation ${annotation.number}`,
              renderPinActivator,
            }
          : {})}
      />
      {presentation === "expanded" ? (
        <AnnotatedFigureRuntimeCaptionList
          annotations={annotations}
          markAnnotationTargets={markCaptionTargets}
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
  const learningEventReporter = useLearningEventReporter();
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
  const controller = useMemo(createAnnotatedFigureRuntimeController, []);
  const getOwnerPos = useCallback(() => {
    const currentOwner = resolveAnnotatedFigureOwnerAtPosition(
      props.editor.state.doc,
      safeGetPos(props.getPos),
    );
    return currentOwner?.pos;
  }, [props.editor, props.getPos]);
  const controlEnabled = data.captionDisplay === "popover" && model !== null;
  const controlBindingInput = {
    controller,
    editor: props.editor,
    enabled: controlEnabled,
    getPos: getOwnerPos,
    node: model?.owner.node ?? null,
    ownerId,
  };
  useAnnotatedFigureControlBinding(controlBindingInput);
  useAnnotatedFigureSemanticActivationBinding(controlBindingInput);

  useEffect(() => {
    const openAnnotationId = controller.getOpenAnnotationId();
    if (
      openAnnotationId === null ||
      (controlEnabled && annotations.some((annotation) => annotation.id === openAnnotationId))
    ) {
      return;
    }
    controller.setOpenAnnotationId(null, "reconciliation");
  }, [annotations, controlEnabled, controller]);
  const recordedAnnotationsRef = useRef<{
    reporter: LearningEventReporter;
    ownerId: string;
    annotationIds: Set<string>;
  } | null>(null);
  const recordAnnotationOpened = useCallback(
    (annotationId: string) => {
      if (!isPresented || !ownerId.trim()) return;
      const position = annotations.findIndex((annotation) => annotation.id === annotationId) + 1;
      if (position <= 0) return;

      let recorded = recordedAnnotationsRef.current;
      if (
        !recorded ||
        recorded.reporter !== learningEventReporter ||
        recorded.ownerId !== ownerId
      ) {
        recorded = {
          reporter: learningEventReporter,
          ownerId,
          annotationIds: new Set(),
        };
        recordedAnnotationsRef.current = recorded;
      }
      if (recorded.annotationIds.has(annotationId)) return;

      try {
        learningEventReporter.report({
          type: "visual-item.experienced",
          compositionId: ownerId,
          itemId: annotationId,
          itemKind: "annotation",
          position,
          count: annotations.length,
        });
        recorded.annotationIds.add(annotationId);
      } catch {
        // Annotation recording is observational and cannot prevent caption access.
      }
    },
    [annotations, isPresented, learningEventReporter, ownerId],
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
            className="sc-course-annotated-figure__runtime-lightbox-composition"
            data-caption-display={data.captionDisplay}
          >
            <AnnotatedFigureRuntimeComposition
              active={lightboxOpen}
              annotations={annotations}
              controller={controller}
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
  }, [
    annotations,
    controller,
    data,
    lightboxOpen,
    ownerId,
    recordAnnotationOpened,
    source.errorMessage,
    source.resolvedUrl,
  ]);

  return (
    <NodeViewWrapper
      data-node="annotated-figure-canvas"
      className="sc-course-annotated-figure__canvas-node"
    >
      <AnnotatedFigureRuntimeComposition
        active={!lightboxOpen}
        annotations={annotations}
        controller={controller}
        data={data}
        errorMessage={source.errorMessage}
        expandAction={
          source.resolvedUrl ? (
            <MediaExpandButton
              ref={expandButtonRef}
              aria-label="Expand annotated figure"
              className="sc-course-annotated-figure__expand-action"
              onClick={() => {
                controller.cancelPendingLearnerClose();
                setLightboxOpen(true);
              }}
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
        childOverlayHostBoundary={CourseThemePortalBoundary}
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
