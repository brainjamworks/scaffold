import {
  CaretDownIcon as CaretDown,
  CaretUpIcon as CaretUp,
  XIcon as X,
} from "@phosphor-icons/react";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";
import type { Transaction } from "@tiptap/pm/state";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { flushSync } from "react-dom";

import type { CheckedMutationResult } from "@/document/model/commands/checked-transactions";
import { createStableId } from "@/document/model/identity/stable-ids";
import {
  nodeViewUiKey,
  usePickerOpen,
} from "@/editor/media/authoring/picker/file-picker-open-state";
import { MediaEmptyAction } from "@/editor/media/authoring/shared-components/MediaEmptyAction";
import { MediaAuthoringActions } from "@/editor/media/presentation/MediaAuthoringActions";
import { MediaExpandButton } from "@/editor/media/presentation/MediaExpandButton";
import {
  useAuthoringNodeTarget,
  type ResolvedAuthoringNode,
} from "@/editor/prosemirror/authoring-target";
import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";
import { EditableOverlayPopover } from "@/editor/rich-text/authoring/nested-overlay/EditableOverlayPopoverShell";
import { focusTextSelectionNear, selectNodeAt } from "@/editor/selection/selection-commands";
import { useMediaPort } from "@/host/providers/ScaffoldServicesProvider";
import { WorkspaceDialog } from "@/ui/components/WorkspaceDialog/WorkspaceDialog";
import {
  AnnotatedFigureDataSchema,
  type AnnotatedFigureData,
  type AnnotatedFigureSource,
} from "@scaffold/contracts";

import {
  FilePickerModal,
  type FilePickerResult,
} from "@/editor/media/authoring/picker/LazyFilePickerModal";
import {
  addAnnotatedFigureAnnotationChecked,
  moveAnnotatedFigureAnnotationChecked,
  removeAnnotatedFigureAnnotationChecked,
  setAnnotatedFigureAnnotationPositionChecked,
} from "./annotated-figure-authoring-commands";
import { createAnnotatedFigureCanvasNode } from "./annotated-figure-canvas-shared";
import {
  createAnnotatedFigureCaptionEditorExtensions,
  createAnnotatedFigureCaptionTarget,
} from "./annotated-figure-caption-editor";
import {
  resolveAnnotatedFigureModel,
  resolveAnnotatedFigureOwnerAtPosition,
} from "./annotated-figure-document-model";
import { useResolvedAnnotatedFigureSource } from "./AnnotatedFigureModel";
import { AnnotatedFigureSurface } from "./AnnotatedFigureSurface";
import { AnnotatedFigureWorkspace } from "./AnnotatedFigureWorkspace";
import { emptyAnnotatedFigureData } from "./content";
import { createAnnotatedFigureAnnotationNode } from "./slots";

import "./AnnotatedFigure.css";

const PIN_DRAG_THRESHOLD_PX = 4;

interface AnnotatedFigurePinDragState {
  annotationId: string;
  pointerId: number;
  originX: number;
  originY: number;
  previewX: number;
  previewY: number;
  moved: boolean;
}

interface AnnotatedFigurePinPointerOrigin {
  clientX: number;
  clientY: number;
  element: HTMLButtonElement;
}

function pickerResultToSource(result: FilePickerResult): AnnotatedFigureSource {
  if (result.source === "upload" && result.upload) {
    return { mode: "managed", mediaId: result.upload.id };
  }
  if (result.source === "browse" && result.browse) {
    return { mode: "managed", mediaId: result.browse.id };
  }
  if (result.source === "url" && result.url) {
    return { mode: "external", src: result.url };
  }
  return null;
}

export function AnnotatedFigureAuthoringView(props: NodeViewProps) {
  useEditorState({
    editor: props.editor,
    selector: ({ transactionNumber }) => transactionNumber,
  });
  const ownerPos = safeGetPos(props.getPos);
  const model =
    ownerPos === undefined
      ? null
      : resolveAnnotatedFigureModel({ node: props.node, pos: ownerPos });
  const captionDisplay = model?.data.captionDisplay ?? "list";

  useLayoutEffect(() => {
    if (captionDisplay !== "popover" || !model) return;
    const selection = props.editor.state.selection;
    const legendContentFrom = model.legend.pos + 1;
    const legendContentTo = model.legend.pos + model.legend.node.nodeSize - 1;
    const ownerSelected =
      selection.from === model.owner.pos &&
      selection.to === model.owner.pos + model.owner.node.nodeSize;
    const selectionTouchesLegend =
      selection.from <= legendContentTo && selection.to >= legendContentFrom;
    if (ownerSelected || !selectionTouchesLegend) return;
    selectNodeAt(props.editor, model.owner.pos, { scrollIntoView: false });
  });

  return (
    <NodeViewContent
      className="sc-annotated-figure__content"
      data-caption-display={captionDisplay}
    />
  );
}

export function createAnnotatedFigureCanvasAuthoringNode() {
  return createAnnotatedFigureCanvasNode({
    addNodeView: () => ReactNodeViewRenderer(AnnotatedFigureCanvasAuthoringView),
  });
}

export function createAnnotatedFigureAnnotationAuthoringNode() {
  return createAnnotatedFigureAnnotationNode({
    addNodeView: () => ReactNodeViewRenderer(AnnotatedFigureAnnotationAuthoringView, { as: "li" }),
  });
}

function AnnotatedFigureAnnotationAuthoringView(props: NodeViewProps) {
  useEditorState({
    editor: props.editor,
    selector: ({ transactionNumber }) => transactionNumber,
  });
  const annotationPos = safeGetPos(props.getPos);
  const owner = resolveAnnotatedFigureOwnerAtPosition(props.editor.state.doc, annotationPos);
  const ownerId = typeof owner?.node.attrs["id"] === "string" ? owner.node.attrs["id"] : null;
  const target = useAuthoringNodeTarget(
    props.editor,
    ownerId ? { id: ownerId, nodeType: "annotated_figure" } : null,
  );
  const currentOwner = target?.read();
  const model = currentOwner ? resolveAnnotatedFigureModel(currentOwner) : null;
  const annotationId = typeof props.node.attrs["id"] === "string" ? props.node.attrs["id"] : "";
  const annotationIndex = model?.annotations.findIndex(({ id }) => id === annotationId) ?? -1;
  const annotation = annotationIndex >= 0 ? model?.annotations[annotationIndex] : undefined;
  const number = annotation?.number;
  const previousAnnotation = annotationIndex > 0 ? model?.annotations[annotationIndex - 1] : null;
  const nextAnnotation =
    model && annotationIndex >= 0 && annotationIndex < model.annotations.length - 1
      ? model.annotations[annotationIndex + 1]
      : null;
  const selection = props.editor.state.selection;
  const selected =
    annotationPos !== undefined &&
    selection.from >= annotationPos &&
    selection.to <= annotationPos + props.node.nodeSize;

  const moveAnnotation = (direction: "previous" | "next", relativeToId: string | undefined) => {
    if (!relativeToId) return;
    const result = target?.transact((tr, resolvedOwner) =>
      moveAnnotatedFigureAnnotationChecked({
        tr,
        target: resolvedOwner,
        annotationId,
        direction: direction === "previous" ? "before" : "after",
        relativeToId,
      }),
    );
    if (result?.ok) focusAnnotationRowControl(props.editor.view.dom, annotationId, direction);
  };

  return (
    <NodeViewWrapper
      data-node="annotated-figure-annotation"
      data-annotation-id={annotationId}
      data-selected={selected ? "true" : "false"}
      className="sc-annotated-figure__annotation"
    >
      <span className="sc-annotated-figure__annotation-number" contentEditable={false}>
        {number}
      </span>
      <NodeViewContent className="sc-annotated-figure__annotation-caption" />
      <div
        className="sc-annotated-figure__annotation-actions"
        contentEditable={false}
        role="group"
        aria-label={`Reorder and remove annotation ${number ?? ""}`.trim()}
      >
        <button
          type="button"
          className="sc-annotated-figure__annotation-action"
          data-annotation-move="previous"
          disabled={!previousAnnotation}
          aria-label={`Move annotation ${number ?? ""} previous`.trim()}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation();
            moveAnnotation("previous", previousAnnotation?.id);
          }}
        >
          <CaretUp size={16} aria-hidden />
        </button>
        <button
          type="button"
          className="sc-annotated-figure__annotation-action"
          data-annotation-move="next"
          disabled={!nextAnnotation}
          aria-label={`Move annotation ${number ?? ""} next`.trim()}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation();
            moveAnnotation("next", nextAnnotation?.id);
          }}
        >
          <CaretDown size={16} aria-hidden />
        </button>
        <button
          type="button"
          className="sc-annotated-figure__annotation-remove"
          aria-label={`Remove annotation ${number ?? ""}`.trim()}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation();
            target?.transact((tr, resolvedOwner) =>
              removeAnnotatedFigureAnnotationChecked({
                tr,
                target: resolvedOwner,
                annotationId,
              }),
            );
          }}
        >
          <X size={16} aria-hidden />
        </button>
      </div>
    </NodeViewWrapper>
  );
}

function AnnotatedFigureCanvasAuthoringView(props: NodeViewProps) {
  useEditorState({
    editor: props.editor,
    selector: ({ transactionNumber }) => transactionNumber,
  });
  const canvasPos = safeGetPos(props.getPos);
  const owner = resolveAnnotatedFigureOwnerAtPosition(props.editor.state.doc, canvasPos);
  const ownerId = typeof owner?.node.attrs["id"] === "string" ? owner.node.attrs["id"] : null;
  const target = useAuthoringNodeTarget(
    props.editor,
    ownerId ? { id: ownerId, nodeType: "annotated_figure" } : null,
  );
  const currentOwner = target?.read();
  const model = currentOwner ? resolveAnnotatedFigureModel(currentOwner) : null;
  const data = model?.data ?? emptyAnnotatedFigureData();
  const mediaPort = useMediaPort();
  const { errorMessage, resolvedUrl } = useResolvedAnnotatedFigureSource(data, mediaPort);
  const pickerKey = nodeViewUiKey({
    owner: "annotated-figure",
    surface: "file-picker",
    id: ownerId,
  });
  const [pickerOpen, setPickerOpen] = usePickerOpen(pickerKey);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<AnnotatedFigurePinDragState | null>(null);
  const pointerOriginRef = useRef<AnnotatedFigurePinPointerOrigin | null>(null);
  const suppressNextCanvasClickRef = useRef(false);
  const suppressNextPinClickRef = useRef<string | null>(null);
  const previousCaptionDisplayRef = useRef(data.captionDisplay);
  const previousAnnotationIdsRef = useRef<string[]>(model?.annotations.map(({ id }) => id) ?? []);
  const [drag, setDrag] = useState<AnnotatedFigurePinDragState | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [compactCaptionPopoverId, setCompactCaptionPopoverId] = useState<string | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const compactCaptionPopoverIdRef = useRef(compactCaptionPopoverId);
  const workspaceOpenRef = useRef(workspaceOpen);
  compactCaptionPopoverIdRef.current = compactCaptionPopoverId;
  workspaceOpenRef.current = workspaceOpen;
  const captionEditorId = useId();
  const captionEditorExtensions = useMemo(() => createAnnotatedFigureCaptionEditorExtensions(), []);
  const outerSelectedAnnotationId =
    model?.annotations.find(
      ({ node, pos }) =>
        props.editor.state.selection.from >= pos &&
        props.editor.state.selection.to <= pos + node.nodeSize,
    )?.id ?? null;
  const selectedAnnotationExists = model?.annotations.some(({ id }) => id === selectedAnnotationId);
  const annotationOrderKey = model?.annotations.map(({ id }) => id).join("\u0000") ?? "";
  const liveSelectedAnnotationId = selectedAnnotationExists
    ? selectedAnnotationId
    : outerSelectedAnnotationId;
  const liveCompactCaptionPopoverId =
    data.captionDisplay === "popover" &&
    model?.annotations.some(({ id }) => id === compactCaptionPopoverId)
      ? compactCaptionPopoverId
      : null;
  const openAnnotation = model?.annotations.find(({ id }) => id === liveCompactCaptionPopoverId);
  const captionTarget = useMemo(
    () =>
      ownerId && liveCompactCaptionPopoverId
        ? createAnnotatedFigureCaptionTarget({
            editor: props.editor,
            figureId: ownerId,
            annotationId: liveCompactCaptionPopoverId,
          })
        : null,
    [liveCompactCaptionPopoverId, ownerId, props.editor],
  );

  const setPinDrag = (next: AnnotatedFigurePinDragState | null) => {
    dragRef.current = next;
    setDrag(next);
  };

  const clearPinDrag = (releaseCapture: boolean) => {
    const current = dragRef.current;
    const pointerOrigin = pointerOriginRef.current;
    setPinDrag(null);
    pointerOriginRef.current = null;
    if (
      releaseCapture &&
      current &&
      pointerOrigin?.element.hasPointerCapture?.(current.pointerId)
    ) {
      pointerOrigin.element.releasePointerCapture(current.pointerId);
    }
  };

  useEffect(() => {
    const ownerDocument = props.editor.view.dom.ownerDocument;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !dragRef.current) return;
      event.preventDefault();
      clearPinDrag(true);
    };
    ownerDocument.addEventListener("keydown", handleKeyDown);
    return () => ownerDocument.removeEventListener("keydown", handleKeyDown);
  });

  useEffect(() => {
    const currentAnnotationIds = annotationOrderKey ? annotationOrderKey.split("\u0000") : [];
    if (
      outerSelectedAnnotationId &&
      data.captionDisplay === "list" &&
      !workspaceOpen &&
      selectedAnnotationId !== outerSelectedAnnotationId
    ) {
      // Selection is outer document state; this mirrors only the active row for compact UI.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedAnnotationId(outerSelectedAnnotationId);
    } else if (selectedAnnotationId && !selectedAnnotationExists) {
      const previousIndex = previousAnnotationIdsRef.current.indexOf(selectedAnnotationId);
      const neighboringId =
        workspaceOpen && previousIndex >= 0
          ? (currentAnnotationIds[Math.min(previousIndex, currentAnnotationIds.length - 1)] ?? null)
          : null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedAnnotationId(neighboringId);
    }

    if (compactCaptionPopoverId && !liveCompactCaptionPopoverId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCompactCaptionPopoverId(null);
      queueMicrotask(() =>
        focusPinOrCanvas(props.editor.view.dom, compactCaptionPopoverId, stageRef),
      );
    }

    previousAnnotationIdsRef.current = currentAnnotationIds;
  }, [
    annotationOrderKey,
    compactCaptionPopoverId,
    data.captionDisplay,
    liveCompactCaptionPopoverId,
    outerSelectedAnnotationId,
    props.editor.view.dom,
    selectedAnnotationExists,
    selectedAnnotationId,
    workspaceOpen,
  ]);

  useEffect(() => {
    if (!workspaceOpen || (ownerId && model)) return;
    clearPinDrag(true);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWorkspaceOpen(false);
  }, [model, ownerId, workspaceOpen]);

  useEffect(() => {
    const previousDisplay = previousCaptionDisplayRef.current;
    previousCaptionDisplayRef.current = data.captionDisplay;
    if (previousDisplay === data.captionDisplay) return;
    if (data.captionDisplay === "list" && liveSelectedAnnotationId) {
      revealAnnotationRow(props.editor.view.dom, liveSelectedAnnotationId);
    }
  }, [data.captionDisplay, liveSelectedAnnotationId, props.editor.view.dom]);

  const updateData = (patch: Partial<AnnotatedFigureData>) => {
    const next = AnnotatedFigureDataSchema.safeParse({ ...data, ...patch });
    if (!next.success) return;
    target?.transact((tr, resolvedOwner) =>
      setAnnotatedFigureDataChecked({ tr, target: resolvedOwner, data: next.data }),
    );
  };

  const focusOuterCaption = (annotationId: string) => {
    const liveOwner = target?.read();
    const liveModel = liveOwner ? resolveAnnotatedFigureModel(liveOwner) : null;
    const annotation = liveModel?.annotations.find(({ id }) => id === annotationId);
    if (!annotation) return;
    focusTextSelectionNear(props.editor, annotation.pos + 2, { scrollIntoView: false });
    revealAnnotationRow(props.editor.view.dom, annotationId);
  };

  const activateAnnotation = (annotationId: string) => {
    setSelectedAnnotationId(annotationId);
    if (workspaceOpen) return;
    if (data.captionDisplay === "popover") {
      setCompactCaptionPopoverId((current) => (current === annotationId ? null : annotationId));
      return;
    }
    focusOuterCaption(annotationId);
  };

  const deleteAnnotation = (annotationId: string) => {
    if (workspaceOpen) {
      const liveOwner = target?.read();
      const liveModel = liveOwner ? resolveAnnotatedFigureModel(liveOwner) : null;
      const annotationIndex =
        liveModel?.annotations.findIndex(({ id }) => id === annotationId) ?? -1;
      if (!liveModel || annotationIndex < 0) return;
      const deletingSelected = selectedAnnotationId === annotationId;
      const neighboringId = deletingSelected
        ? (liveModel.annotations[annotationIndex + 1]?.id ??
          liveModel.annotations[annotationIndex - 1]?.id ??
          null)
        : selectedAnnotationId;
      if (deletingSelected) flushSync(() => setSelectedAnnotationId(null));
      const result = target?.transact((tr, resolvedOwner) =>
        removeAnnotatedFigureAnnotationChecked({
          tr,
          target: resolvedOwner,
          annotationId,
        }),
      );
      if (result?.ok) setSelectedAnnotationId(neighboringId);
      return;
    }

    if (compactCaptionPopoverIdRef.current === annotationId) {
      flushSync(() => setCompactCaptionPopoverId(null));
    }
    setSelectedAnnotationId((current) => (current === annotationId ? null : current));
    target?.transact((tr, resolvedOwner) =>
      removeAnnotatedFigureAnnotationChecked({
        tr,
        target: resolvedOwner,
        annotationId,
      }),
    );
    queueMicrotask(() => focusPinOrCanvas(props.editor.view.dom, annotationId, stageRef));
  };

  const moveWorkspaceAnnotation = (
    annotationId: string,
    direction: "previous" | "next",
    relativeToId: string,
  ) => {
    target?.transact((tr, resolvedOwner) =>
      moveAnnotatedFigureAnnotationChecked({
        tr,
        target: resolvedOwner,
        annotationId,
        direction: direction === "previous" ? "before" : "after",
        relativeToId,
      }),
    );
  };

  const addAnnotation = (x: number, y: number) => {
    const annotationId = createStableId();
    const result = target?.transact((tr, resolvedOwner) =>
      addAnnotatedFigureAnnotationChecked({
        tr,
        target: resolvedOwner,
        annotationId,
        x,
        y,
      }),
    );
    if (!result?.ok) return;
    setSelectedAnnotationId(annotationId);
    if (workspaceOpen) return;
    if (data.captionDisplay === "popover") {
      setCompactCaptionPopoverId(annotationId);
    } else {
      focusOuterCaption(annotationId);
    }
  };

  const openWorkspace = () => {
    clearPinDrag(true);
    workspaceOpenRef.current = true;
    if (compactCaptionPopoverIdRef.current) {
      flushSync(() => setCompactCaptionPopoverId(null));
    }
    const nextSelection =
      (liveSelectedAnnotationId &&
      model?.annotations.some(({ id }) => id === liveSelectedAnnotationId)
        ? liveSelectedAnnotationId
        : model?.annotations[0]?.id) ?? null;
    setSelectedAnnotationId(nextSelection);
    setWorkspaceOpen(true);
  };

  const handleWorkspaceOpenChange = (open: boolean) => {
    if (open) {
      openWorkspace();
      return;
    }
    clearPinDrag(true);
    suppressNextCanvasClickRef.current = false;
    suppressNextPinClickRef.current = null;
    workspaceOpenRef.current = false;
    setWorkspaceOpen(false);
  };

  const handleStageClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!resolvedUrl) return;
    if (suppressNextCanvasClickRef.current) {
      suppressNextCanvasClickRef.current = false;
      return;
    }
    if (event.target instanceof Element && event.target.closest("[data-pin]")) return;
    const stage = event.currentTarget;
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    addAnnotation(
      ((event.clientX - rect.left) / rect.width) * 100,
      ((event.clientY - rect.top) / rect.height) * 100,
    );
  };

  const handlePinPointerDown = (
    annotationId: string,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (event.button !== 0) return;
    const annotation = model?.annotations.find(({ id }) => id === annotationId);
    if (!annotation) return;
    event.preventDefault();
    event.stopPropagation();
    pointerOriginRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      element: event.currentTarget,
    };
    setPinDrag({
      annotationId,
      pointerId: event.pointerId,
      originX: annotation.x,
      originY: annotation.y,
      previewX: annotation.x,
      previewY: annotation.y,
      moved: false,
    });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePinPointerMove = (
    annotationId: string,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const current = dragRef.current;
    const pointerOrigin = pointerOriginRef.current;
    if (
      !current ||
      !pointerOrigin ||
      current.annotationId !== annotationId ||
      current.pointerId !== event.pointerId
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const stage = event.currentTarget.closest<HTMLElement>(".sc-annotated-figure__canvas");
    if (!stage) {
      clearPinDrag(true);
      return;
    }
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      clearPinDrag(true);
      return;
    }
    const deltaX = event.clientX - pointerOrigin.clientX;
    const deltaY = event.clientY - pointerOrigin.clientY;
    const moved = current.moved || Math.hypot(deltaX, deltaY) >= PIN_DRAG_THRESHOLD_PX;
    if (!moved) return;
    if (!current.moved) {
      setSelectedAnnotationId(annotationId);
      setCompactCaptionPopoverId((openId) => (openId === annotationId ? null : openId));
    }
    setPinDrag({
      ...current,
      moved: true,
      previewX: clampCoordinate(current.originX + (deltaX / rect.width) * 100),
      previewY: clampCoordinate(current.originY + (deltaY / rect.height) * 100),
    });
  };

  const handlePinPointerUp = (
    annotationId: string,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const current = dragRef.current;
    if (
      !current ||
      current.annotationId !== annotationId ||
      current.pointerId !== event.pointerId
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (current.moved) {
      suppressNextCanvasClickRef.current = true;
      suppressNextPinClickRef.current = annotationId;
      target?.transact((tr, resolvedOwner) =>
        setAnnotatedFigureAnnotationPositionChecked({
          tr,
          target: resolvedOwner,
          annotationId,
          x: current.previewX,
          y: current.previewY,
        }),
      );
      setTimeout(() => {
        suppressNextCanvasClickRef.current = false;
        if (suppressNextPinClickRef.current === annotationId) {
          suppressNextPinClickRef.current = null;
        }
      }, 0);
    }
    clearPinDrag(true);
  };

  const handlePinPointerCancel = (
    annotationId: string,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const current = dragRef.current;
    if (
      !current ||
      current.annotationId !== annotationId ||
      (event.type !== "lostpointercapture" && current.pointerId !== event.pointerId)
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    clearPinDrag(false);
  };

  const visibleAnnotations = (model?.annotations ?? []).map((annotation) =>
    drag?.annotationId === annotation.id
      ? { ...annotation, x: drag.previewX, y: drag.previewY }
      : annotation,
  );

  const renderAuthoringSurface = (presentation: "compact" | "workspace") => (
    <AnnotatedFigureSurface
      data={data}
      annotations={visibleAnnotations}
      draggingPinId={drag?.moved ? drag.annotationId : null}
      errorMessage={errorMessage}
      fileUrl={resolvedUrl}
      presentation={presentation}
      {...(presentation === "compact" ? { stageRef } : {})}
      emptyAction={
        <MediaEmptyAction
          onClick={() => setPickerOpen(true)}
          aria-label="Add annotated figure image"
          label="Add image"
          className="sc-annotated-figure__empty"
        />
      }
      onActivatePin={(annotationId) => {
        if (suppressNextPinClickRef.current === annotationId) {
          suppressNextPinClickRef.current = null;
          return;
        }
        activateAnnotation(annotationId);
      }}
      onPinPointerCancel={handlePinPointerCancel}
      onPinPointerDown={handlePinPointerDown}
      onPinPointerMove={handlePinPointerMove}
      onPinPointerUp={handlePinPointerUp}
      onRemovePin={deleteAnnotation}
      onStageClick={handleStageClick}
      pinActivationLabel={(annotation) => {
        if (presentation === "workspace") {
          return `Select pin for annotation ${annotation.number} caption`;
        }
        return data.captionDisplay === "popover"
          ? `Edit annotation ${annotation.number} caption`
          : `Select annotation ${annotation.number}`;
      }}
      {...(presentation === "compact" && data.captionDisplay === "popover"
        ? {
            renderPinActivator: (annotation, activator) => {
              const open = liveCompactCaptionPopoverId === annotation.id;
              return (
                <EditableOverlayPopover.Root
                  open={open}
                  onOpenChange={(nextOpen) => {
                    if (nextOpen) return;
                    setCompactCaptionPopoverId((current) =>
                      current === annotation.id ? null : current,
                    );
                  }}
                >
                  <EditableOverlayPopover.Trigger asChild>
                    {activator}
                  </EditableOverlayPopover.Trigger>
                  {open && captionTarget && openAnnotation ? (
                    <EditableOverlayPopover.Portal>
                      <EditableOverlayPopover.Content
                        className="sc-annotated-figure__caption-popover"
                        collisionPadding={12}
                        headerActions={
                          <EditableOverlayPopover.TextAction
                            tone="danger"
                            onClick={() => deleteAnnotation(annotation.id)}
                          >
                            Delete annotation {annotation.number}
                          </EditableOverlayPopover.TextAction>
                        }
                        onClick={(event) => event.stopPropagation()}
                        onCloseAutoFocus={(event) => {
                          event.preventDefault();
                          queueMicrotask(() => {
                            if (workspaceOpenRef.current) return;
                            const nextOpenId = compactCaptionPopoverIdRef.current;
                            if (nextOpenId && nextOpenId !== annotation.id) return;
                            focusPinOrCanvas(props.editor.view.dom, annotation.id, stageRef);
                          });
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                        side="bottom"
                        sideOffset={8}
                        title={`Annotation ${annotation.number}`}
                        editor={{
                          ariaLabel: `Annotation ${annotation.number} caption`,
                          bubbleMenuPluginKey: `annotated-figure-caption-${captionEditorId.replace(
                            /[^A-Za-z0-9_-]/g,
                            "",
                          )}`,
                          className: "sc-annotated-figure__caption-field",
                          extensions: captionEditorExtensions,
                          fieldKey: `annotation:${annotation.id}:caption`,
                          mountClassName: "sc-annotated-figure__caption-editor",
                          outerEditor: props.editor,
                          placeholder: "Describe this annotation",
                          syncKey: openAnnotation.captionNode,
                          target: captionTarget,
                        }}
                      />
                    </EditableOverlayPopover.Portal>
                  ) : null}
                </EditableOverlayPopover.Root>
              );
            },
          }
        : {})}
      expandAction={
        presentation === "compact" && resolvedUrl ? (
          <MediaAuthoringActions
            addLabel="Add annotation"
            ariaLabel="Annotated figure image tools"
            editAction={
              <WorkspaceDialog.Trigger asChild>
                <MediaExpandButton
                  aria-label="Edit annotated figure in expanded workspace"
                  glyph="edit"
                  tooltipLabel="Edit annotated figure"
                />
              </WorkspaceDialog.Trigger>
            }
            onAdd={() => addAnnotation(50, 50)}
            onReplace={() => setPickerOpen(true)}
          />
        ) : null
      }
    />
  );

  return (
    <NodeViewWrapper
      data-node="annotated-figure-canvas"
      className="sc-annotated-figure__canvas-node"
    >
      <WorkspaceDialog.Root open={workspaceOpen} onOpenChange={handleWorkspaceOpenChange}>
        {renderAuthoringSurface("compact")}
        {workspaceOpen && ownerId && model ? (
          <AnnotatedFigureWorkspace
            annotations={model.annotations}
            canvas={renderAuthoringSurface("workspace")}
            captionEditorExtensions={captionEditorExtensions}
            figureId={ownerId}
            onAddAnnotation={() => addAnnotation(50, 50)}
            onDeleteAnnotation={deleteAnnotation}
            onMoveAnnotation={moveWorkspaceAnnotation}
            onReplaceImage={() => setPickerOpen(true)}
            onSelectAnnotation={activateAnnotation}
            outerEditor={props.editor}
            selectedAnnotationId={liveSelectedAnnotationId}
          />
        ) : null}
      </WorkspaceDialog.Root>
      <FilePickerModal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        kind="media"
        defaultMediaType="image"
        title={data.source ? "Replace image" : "Add image"}
        onResolved={(result) => {
          updateData({
            source: pickerResultToSource(result),
            ...(result.alt ? { alt: result.alt } : {}),
          });
        }}
      />
    </NodeViewWrapper>
  );
}

function clampCoordinate(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function findAnnotationRow(editorDom: HTMLElement, annotationId: string): HTMLElement | null {
  return (
    Array.from(editorDom.querySelectorAll<HTMLElement>("[data-annotation-id]")).find(
      (element) => element.dataset["annotationId"] === annotationId,
    ) ?? null
  );
}

function focusPinOrCanvas(
  editorDom: HTMLElement,
  annotationId: string,
  stageRef: { current: HTMLDivElement | null },
) {
  const pin = Array.from(editorDom.querySelectorAll<HTMLElement>("[data-pin]")).find(
    (element) => element.dataset["pin"] === annotationId,
  );
  const trigger = pin?.querySelector<HTMLButtonElement>(".sc-annotated-figure__pin-activate");
  if (trigger?.isConnected) {
    trigger.focus();
    return;
  }
  stageRef.current?.focus();
}

function revealAnnotationRow(editorDom: HTMLElement, annotationId: string, attemptsRemaining = 3) {
  const row = findAnnotationRow(editorDom, annotationId);
  if (row) {
    row.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    return;
  }
  if (attemptsRemaining > 0) {
    requestAnimationFrame(() =>
      revealAnnotationRow(editorDom, annotationId, attemptsRemaining - 1),
    );
  }
}

function focusAnnotationRowControl(
  editorDom: HTMLElement,
  annotationId: string,
  preferredDirection: "previous" | "next",
  attemptsRemaining = 3,
) {
  const row = findAnnotationRow(editorDom, annotationId);
  if (row) {
    row.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    const preferred = row.querySelector<HTMLButtonElement>(
      `[data-annotation-move="${preferredDirection}"]:not(:disabled)`,
    );
    const fallback = row.querySelector<HTMLButtonElement>(
      "[data-annotation-move]:not(:disabled), .sc-annotated-figure__annotation-remove",
    );
    (preferred ?? fallback)?.focus();
    return;
  }
  if (attemptsRemaining > 0) {
    requestAnimationFrame(() =>
      focusAnnotationRowControl(editorDom, annotationId, preferredDirection, attemptsRemaining - 1),
    );
  }
}

function setAnnotatedFigureDataChecked({
  tr,
  target,
  data,
}: {
  tr: Transaction;
  target: ResolvedAuthoringNode;
  data: AnnotatedFigureData;
}): CheckedMutationResult<Transaction> {
  const currentOwner = tr.doc.nodeAt(target.pos);
  if (
    !currentOwner ||
    currentOwner.type.name !== "annotated_figure" ||
    currentOwner.attrs["id"] !== target.node.attrs["id"]
  ) {
    return {
      ok: false,
      issue: {
        code: "stale_annotated_figure_owner",
        message: "The Annotated Figure owner is no longer current.",
      },
    };
  }

  tr.setNodeMarkup(target.pos, undefined, { ...currentOwner.attrs, data });
  tr.doc.check();
  return { ok: true, tr };
}
