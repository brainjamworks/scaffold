import {
  ArrowsClockwiseIcon as ArrowsClockwise,
  CheckCircleIcon as CheckCircle,
  ImageIcon as ImagePlaceholder,
  PencilSimpleIcon as PencilSimple,
  PlusIcon as Plus,
  TrashIcon as Trash,
} from "@phosphor-icons/react";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type RefObject,
} from "react";

import { getScaffoldCapabilitiesForEditor } from "@/composition/extensions/scaffold-capabilities-storage";
import { cn } from "@/lib/cn";
import { MediaWorkspace } from "@/editor/media/presentation/MediaWorkspace";
import { CourseThemePortalBoundary } from "@/theme/course";
import { Button } from "@/ui/components/Button/Button";
import { WorkspaceDialog } from "@/ui/components/WorkspaceDialog/WorkspaceDialog";
import { resolveActiveBoundedPlacement } from "@/editor/bounded-containers/model/bounded-container-placement";
import { nodeViewUiStateKey, useNodeViewOpenState } from "@/editor/prosemirror/node-view-ui-state";
import {
  resolveAssessmentAttrParent,
  richTextDocumentToAssessmentFeedback,
} from "@/editor/blocks/assessment/shared/model/private-assessment-attrs";
import { AssessmentChoiceAuthoringAction } from "@/ui/components/course/AssessmentChoiceAuthoringRow/AssessmentChoiceAuthoringRow";
import { createEmbeddedDataId } from "@/document/model/identity/stable-ids";
import {
  useAuthoringNodeTarget,
  type AuthoringNodeTarget,
} from "@/editor/prosemirror/authoring-target";
import { Placeholder } from "@/editor/prosemirror/placeholder/Placeholder";
import { createFieldContentEditorExtensions } from "@/editor/rich-text/authoring/field-content-extensions";
import { EditableOverlayPopover } from "@/editor/rich-text/authoring/nested-overlay/EditableOverlayPopoverShell";
import { RichTextArea } from "@/editor/rich-text/authoring/nested-overlay/RichTextArea";
import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";
import {
  FilePickerModal,
  type FilePickerResult,
} from "@/editor/media/authoring/picker/LazyFilePickerModal";

function applyImageHotspotPick(result: FilePickerResult): ImageBlockAttrs | null {
  if (result.source === "upload" && result.upload) {
    return {
      mode: "managed",
      mediaId: result.upload.id,
      alt: result.alt?.trim() || result.title?.trim() || result.upload.fileName,
    };
  }
  if (result.source === "browse" && result.browse) {
    return {
      mode: "managed",
      mediaId: result.browse.id,
      alt: result.alt?.trim() || result.title?.trim() || result.browse.fileName,
    };
  }
  if (result.source === "url" && result.url) {
    return {
      mode: "external",
      src: result.url,
      alt: result.alt?.trim() || result.title?.trim() || "Hotspot image",
    };
  }
  return null;
}
import { useMediaPort } from "@/host/providers/ScaffoldServicesProvider";
import {
  ImageHotspotCanvasDataSchema,
  ImageHotspotPrivateAssessmentSchema,
  type HotspotItem,
  type ImageHotspotCanvasData,
  type ImageHotspotPrivateAssessment,
} from "@scaffold/contracts";
import { toTiptapRichTextDocument, type ScaffoldRichTextDocument } from "@/schemas/rich-text";
import type { ImageBlockAttrs } from "@scaffold/contracts";
import { iconMd, iconSm } from "@/ui/tokens/icon-sizes";
import { MediaEmptyAction } from "@/ui/components/app/MediaEmptyAction/MediaEmptyAction";

import { ImageHotspotCanvasSurface } from "@/editor/assessment/image-hotspot/image-hotspot-canvas-surface";
import {
  addImageHotspotChecked,
  patchImageHotspotChecked,
  removeImageHotspotChecked,
  replaceImageHotspotImageChecked,
  resolveImageHotspotAuthoringModel,
  setImageHotspotAltTextChecked,
  setImageHotspotClickLimitChecked,
  setImageHotspotFeedbackChecked,
  setImageHotspotMissFeedbackChecked,
  toggleImageHotspotCorrectChecked,
} from "./image-hotspot-authoring-commands";
import {
  createImageHotspotCanvasNode,
  eventToPercent,
  findHitHotspot,
  patchHotspotInCanvasData,
} from "@/editor/assessment/image-hotspot/image-hotspot-canvas-shared";
import { ImageHotspotAuthoringWorkspace } from "./ImageHotspotAuthoringWorkspace";

import "@/editor/assessment/image-hotspot/ImageHotspot.css";

function edgeSafeMarkerStyle(x: number, y: number) {
  return {
    "--sc-image-hotspot-marker-x": `${x}%`,
    "--sc-image-hotspot-marker-y": `${y}%`,
  } as CSSProperties;
}

function resizeHandleStyle(hotspot: HotspotItem) {
  return {
    "--sc-image-hotspot-resize-handle-x": `${hotspot.centerX + hotspot.radius}%`,
    "--sc-image-hotspot-resize-handle-y": `${hotspot.centerY}%`,
  } as CSSProperties;
}

/**
 * `image_hotspot_canvas` is an ATOMIC PM node. Owns the entire image +
 * hotspot interactive surface as React state inside one NodeView root.
 * Hotspots are not PM children — they live in `attrs.data.hotspots[]`
 * and the runtime click list lives in the assessment store's
 * `response.clicks` (via the assessment runtime interaction).
 *
 * Why atomic: hotspot placement is coordinate-based positioning over
 * an image — there's no natural mapping to PM block layout. The
 * canvas owns its DOM (SVG overlay + image), does its own pointer
 * event routing, and treats PM as opaque outside.
 */
export const ImageHotspotCanvasAuthoringNode = createImageHotspotCanvasNode({
  addNodeView: () => ReactNodeViewRenderer(ImageHotspotCanvasNodeView),
});

// ─────────────────────────────────────────────────────────────────────
// Geometry helpers — pure functions. Aspect-ratio aware: radius is %
// of image WIDTH, so y-distance must be scaled by (width / height) at
// hit-test time so circles render circular on non-square images.
// ─────────────────────────────────────────────────────────────────────

const MIN_RADIUS = 2;
const KEYBOARD_HOTSPOT_RADIUS = 8;
const HOTSPOT_DRAG_THRESHOLD_PX = 4;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

// Main NodeView — authoring-only. Runtime uses image-hotspot-canvas-runtime.tsx.
// ─────────────────────────────────────────────────────────────────────

function ImageHotspotCanvasNodeView(props: NodeViewProps) {
  const getCanvasPos = useCallback(() => {
    const rawPos = safeGetPos(props.getPos);
    return typeof rawPos === "number" ? rawPos : null;
  }, [props.getPos]);
  const pos = getCanvasPos();

  const owner = useMemo(
    () =>
      pos === null
        ? null
        : resolveAssessmentAttrParent(props.editor, pos, [
            "image_hotspot",
            "surface_image_hotspot_question",
          ]),
    [pos, props.editor],
  );
  const blockId = typeof owner?.node.attrs["id"] === "string" ? owner.node.attrs["id"] : null;
  const target = useAuthoringNodeTarget(
    props.editor,
    blockId && owner ? { id: blockId, nodeType: owner.typeName } : null,
  );
  const resolvedOwner = target?.read();
  const model = resolvedOwner ? resolveImageHotspotAuthoringModel(resolvedOwner) : null;
  const data = model?.data ?? ImageHotspotCanvasDataSchema.parse({});
  const assessment = model?.assessment ?? ImageHotspotPrivateAssessmentSchema.parse({});
  return (
    <NodeViewWrapper
      data-node="image-hotspot-canvas"
      data-surface-owned-image-hotspot-canvas={
        owner?.typeName === "surface_image_hotspot_question" ? "" : undefined
      }
    >
      <AuthorCanvas
        assessment={assessment}
        data={data}
        editor={props.editor}
        getCanvasPos={getCanvasPos}
        blockId={blockId}
        authoredBlockId={blockId}
        presentation={
          owner?.typeName === "surface_image_hotspot_question" ? "full-slide" : "compact"
        }
        target={target}
      />
    </NodeViewWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Author UI — image picker + SVG overlay for draw/move/resize.
// ─────────────────────────────────────────────────────────────────────

type InteractionMode = "idle" | "drawing" | "moving" | "resizing";
type HotspotPatch = Partial<Omit<HotspotItem, "id">>;

interface AuthorCanvasProps {
  assessment: ImageHotspotPrivateAssessment;
  data: ImageHotspotCanvasData;
  editor: NodeViewProps["editor"];
  getCanvasPos: () => number | null;
  blockId: string | null;
  authoredBlockId: string | null;
  target: AuthoringNodeTarget | null;
  popoverPortalContainerRef?: RefObject<HTMLDivElement | null> | undefined;
  presentation?: "compact" | "full-slide" | "expanded";
  selectedHotspotRequestId?: string | null;
  onAnnounce?: ((message: string) => void) | undefined;
  renderLiveRegion?: boolean | undefined;
}

function AuthorCanvas({
  assessment,
  data,
  editor,
  getCanvasPos,
  blockId,
  authoredBlockId,
  target,
  popoverPortalContainerRef,
  presentation = "compact",
  selectedHotspotRequestId,
  onAnnounce,
  renderLiveRegion = true,
}: AuthorCanvasProps) {
  const isExpanded = presentation === "expanded";
  const isFullSlide = presentation === "full-slide";
  const mediaPort = useMediaPort();
  const pickerKey = nodeViewUiStateKey({
    owner: "image-hotspot",
    surface: isExpanded ? "file-picker-expanded" : "file-picker",
    id: blockId,
  });
  const [pickerOpen, setPickerOpen] = useNodeViewOpenState(pickerKey);
  const workspaceKey = nodeViewUiStateKey({
    owner: "image-hotspot",
    surface: "course-workspace-authoring",
    id: blockId,
  });
  const [workspaceOpen, setWorkspaceOpen] = useNodeViewOpenState(workspaceKey);
  const workspaceElementRef = useRef<HTMLDivElement>(null);
  const [workspaceSelectionRequestId, setWorkspaceSelectionRequestId] = useState<string | null>(
    null,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailsOpenId, setDetailsOpenId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const announce = onAnnounce ?? setAnnouncement;
  const [pendingFocusTarget, setPendingFocusTarget] = useState<string | null>(null);
  const [draftHotspotsState, setDraftHotspotsState] = useState<HotspotItem[] | null>(null);
  const [resolvedManagedSrc, setResolvedManagedSrc] = useState<{
    mediaId: string;
    url: string;
  } | null>(null);
  const dataRef = useRef(data);
  const draftHotspotsRef = useRef<HotspotItem[] | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fitStageRef = useRef<HTMLDivElement>(null);
  const hotspotListRef = useRef<HTMLOListElement>(null);
  const suppressNextCanvasPointerDownRef = useRef(false);
  const suppressNextMarkerClickRef = useRef<string | null>(null);
  const interactionRef = useRef({
    mode: "idle" as InteractionMode,
    activeId: null as string | null,
    drawCenter: { x: 0, y: 0 },
    drawRadius: 0,
    moveStart: { x: 0, y: 0 },
    moveOrigin: { cx: 0, cy: 0 },
    resizeOrigin: { cx: 0, cy: 0 },
    moveInitiator: "surface" as "marker" | "surface",
    pointerStart: { x: 0, y: 0 },
    moved: false,
  });
  const [drawingPreview, setDrawingPreview] = useState<{
    cx: number;
    cy: number;
    r: number;
  } | null>(null);
  const isInteracting = drawingPreview !== null || draftHotspotsState !== null;
  const boundedFillActive = useEditorState({
    editor,
    selector: ({ editor }) => isImageHotspotBoundedFillActive(editor, getCanvasPos),
  });
  const isBoundedCompact = !isExpanded && !isFullSlide && boundedFillActive;
  const canEditInline = isExpanded || isFullSlide || !boundedFillActive;
  const fitStrategy = "contain";
  const visibleHotspots = draftHotspotsState ?? data.hotspots;

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (!pendingFocusTarget) return;
    const root =
      popoverPortalContainerRef?.current instanceof HTMLElement
        ? popoverPortalContainerRef.current
        : containerRef.current?.closest<HTMLElement>(".sc-course-image-hotspot-shell");
    const selector =
      pendingFocusTarget === "add"
        ? "[data-image-hotspot-add-region]"
        : `[data-hotspot-author-marker-id="${CSS.escape(pendingFocusTarget)}"], [data-workspace-hotspot-id="${CSS.escape(pendingFocusTarget)}"] button`;
    root?.querySelector<HTMLElement>(selector)?.focus();
    setPendingFocusTarget(null);
  }, [data.hotspots, pendingFocusTarget, popoverPortalContainerRef]);

  useEffect(() => {
    if (canEditInline) return;
    setSelectedId(null);
    setDetailsOpenId(null);
    setDraftHotspotsState(null);
    draftHotspotsRef.current = null;
    setDrawingPreview(null);
    interactionRef.current = {
      ...interactionRef.current,
      mode: "idle",
      activeId: null,
    };
    suppressNextMarkerClickRef.current = null;
  }, [canEditInline]);

  useEffect(() => {
    if (!isExpanded) return;
    setDetailsOpenId(null);
    setSelectedId((current) => {
      if (current && data.hotspots.some((h) => h.id === current)) return current;
      return data.hotspots[0]?.id ?? null;
    });
  }, [data.hotspots, isExpanded]);

  useEffect(() => {
    if (!isExpanded || !selectedHotspotRequestId) return;
    setSelectedId(selectedHotspotRequestId);
  }, [isExpanded, selectedHotspotRequestId]);

  useEffect(() => {
    if (!isExpanded || !selectedId) return;
    const selectedRow = Array.from(
      hotspotListRef.current?.querySelectorAll<HTMLElement>("[data-workspace-hotspot-id]") ?? [],
    ).find((row) => row.dataset["workspaceHotspotId"] === selectedId);
    selectedRow?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [data.hotspots, isExpanded, selectedId]);

  const image = data.image;
  const externalSrc = image?.mode === "external" ? image.src : null;
  const managedMediaId = image?.mode === "managed" ? image.mediaId : null;

  // Resolve managed images through the media port. External image
  // URLs are derived directly during render, so this effect only handles
  // the async branch.
  useEffect(() => {
    if (!managedMediaId) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        if (!mediaPort) {
          throw new Error("No media port configured.");
        }
        const url = await mediaPort.resolve(managedMediaId);
        if (!cancelled) setResolvedManagedSrc({ mediaId: managedMediaId, url });
      } catch {
        if (!cancelled) setResolvedManagedSrc(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [managedMediaId, mediaPort]);

  const resolvedSrc =
    externalSrc ??
    (managedMediaId && resolvedManagedSrc?.mediaId === managedMediaId
      ? resolvedManagedSrc.url
      : null);

  const announceMutationResult = (
    result: ReturnType<NonNullable<AuthoringNodeTarget["transact"]>> | null | undefined,
    successMessage: string,
  ) => {
    announce(result?.ok ? successMessage : (result?.issue.message ?? "Action rejected."));
    return result?.ok === true;
  };

  const setDraftHotspots = (hotspots: HotspotItem[] | null) => {
    draftHotspotsRef.current = hotspots;
    setDraftHotspotsState(hotspots);
  };

  const beginDraftHotspots = () => {
    setDraftHotspots(dataRef.current.hotspots);
  };

  const updateDraftHotspot = (id: string, patch: HotspotPatch) => {
    const current = draftHotspotsRef.current ?? dataRef.current.hotspots;
    setDraftHotspots(
      patchHotspotInCanvasData({ ...dataRef.current, hotspots: current }, id, patch).hotspots,
    );
  };

  const commitDraftHotspots = () => {
    const draftHotspots = draftHotspotsRef.current;
    if (!draftHotspots) return;
    const activeId = interactionRef.current.activeId;
    const draft = activeId ? draftHotspots.find((hotspot) => hotspot.id === activeId) : null;
    const current = activeId
      ? dataRef.current.hotspots.find((hotspot) => hotspot.id === activeId)
      : null;
    if (draft && current) {
      const result = target?.transact((tr, owner) =>
        patchImageHotspotChecked({
          tr,
          target: owner,
          hotspotId: draft.id,
          patch: {
            centerX: draft.centerX,
            centerY: draft.centerY,
            radius: draft.radius,
          },
        }),
      );
      announceMutationResult(
        result,
        `Region ${dataRef.current.hotspots.indexOf(current) + 1} updated.`,
      );
    }
    setDraftHotspots(null);
  };

  const addHotspotRegion = (hotspot: Omit<HotspotItem, "id">) => {
    const id = createEmbeddedDataId();
    const result = target?.transact((tr, owner) =>
      addImageHotspotChecked({
        tr,
        target: owner,
        hotspot: { id, ...hotspot },
      }),
    );
    if (!announceMutationResult(result, `${hotspot.label} added.`)) return null;
    setSelectedId(id);
    return id;
  };

  const replaceImage = (image: ImageBlockAttrs) => {
    const result = target?.transact((tr, owner) =>
      replaceImageHotspotImageChecked({ tr, target: owner, image }),
    );
    if (!announceMutationResult(result, "Image replaced. Regions and responses were reset.")) {
      return false;
    }
    setSelectedId(null);
    setDetailsOpenId(null);
    return true;
  };

  const addKeyboardHotspotRegion = () => {
    return addHotspotRegion({
      centerX: 50,
      centerY: 50,
      radius: KEYBOARD_HOTSPOT_RADIUS,
      label: `Region ${dataRef.current.hotspots.length + 1}`,
    });
  };

  const patchHotspot = (id: string, patch: HotspotPatch) => {
    const index = dataRef.current.hotspots.findIndex((hotspot) => hotspot.id === id);
    const result = target?.transact((tr, owner) =>
      patchImageHotspotChecked({
        tr,
        target: owner,
        hotspotId: id,
        patch,
      }),
    );
    return announceMutationResult(result, `Region ${index + 1} updated.`);
  };

  const setAltText = (alt: string) => {
    const result = target?.transact((tr, owner) =>
      setImageHotspotAltTextChecked({ tr, target: owner, alt }),
    );
    return announceMutationResult(result, "Alternative text updated.");
  };

  const setClickLimit = (maxClicks: number | null) => {
    const result = target?.transact((tr, owner) =>
      setImageHotspotClickLimitChecked({ tr, target: owner, maxClicks }),
    );
    return announceMutationResult(result, "Selection limit updated.");
  };

  const removeHotspot = (id: string) => {
    const index = dataRef.current.hotspots.findIndex((hotspot) => hotspot.id === id);
    const remaining = dataRef.current.hotspots.filter((hotspot) => hotspot.id !== id);
    const focusId = remaining[index]?.id ?? remaining[index - 1]?.id ?? "add";
    const result = target?.transact((tr, owner) =>
      removeImageHotspotChecked({ tr, target: owner, hotspotId: id }),
    );
    if (!announceMutationResult(result, `Region ${index + 1} deleted.`)) return;
    if (selectedId === id) setSelectedId(focusId === "add" ? null : focusId);
    if (detailsOpenId === id) setDetailsOpenId(null);
    setPendingFocusTarget(focusId);
  };

  const toggleCorrect = (id: string) => {
    const index = dataRef.current.hotspots.findIndex((hotspot) => hotspot.id === id);
    const result = target?.transact((tr, owner) =>
      toggleImageHotspotCorrectChecked({ tr, target: owner, hotspotId: id }),
    );
    announceMutationResult(result, `Correct state changed for region ${index + 1}.`);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>, aspectRatio: number) => {
    if (e.button !== 0 || !containerRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    if (suppressNextCanvasPointerDownRef.current) {
      suppressNextCanvasPointerDownRef.current = false;
      interactionRef.current = {
        ...interactionRef.current,
        mode: "idle",
        activeId: null,
      };
      setDraftHotspots(null);
      return;
    }

    if (detailsOpenId !== null) {
      setDetailsOpenId(null);
      interactionRef.current = {
        ...interactionRef.current,
        mode: "idle",
        activeId: null,
      };
      setDraftHotspots(null);
      return;
    }

    const pct = eventToPercent(e, containerRef.current);

    // The resize target overlaps the marker's 44px move target for small
    // regions, so it is rendered above the marker and routed explicitly.
    const selected = visibleHotspots.find((h) => h.id === selectedId);
    const resizeHandle =
      e.target instanceof Element
        ? e.target.closest<HTMLElement>("[data-hotspot-resize-handle-id]")
        : null;
    if (selected && resizeHandle?.dataset.hotspotResizeHandleId === selected.id) {
      beginDraftHotspots();
      interactionRef.current = {
        ...interactionRef.current,
        mode: "resizing",
        activeId: selected.id,
        resizeOrigin: { cx: selected.centerX, cy: selected.centerY },
      };
      containerRef.current.setPointerCapture(e.pointerId);
      return;
    }

    const selectedHit = selected ? findHitHotspot(pct.x, pct.y, [selected], aspectRatio) : null;
    const hit = selectedHit ?? findHitHotspot(pct.x, pct.y, visibleHotspots, aspectRatio);
    if (hit) {
      setSelectedId(hit.id);
      setDetailsOpenId(null);
      beginDraftHotspots();
      interactionRef.current = {
        ...interactionRef.current,
        mode: "moving",
        activeId: hit.id,
        moveStart: { x: pct.x, y: pct.y },
        moveOrigin: { cx: hit.centerX, cy: hit.centerY },
        moveInitiator: "surface",
        pointerStart: { x: e.clientX, y: e.clientY },
        moved: true,
      };
      containerRef.current.setPointerCapture(e.pointerId);
      return;
    }

    // Empty space → start drawing a new hotspot
    setSelectedId(null);
    setDetailsOpenId(null);
    setDraftHotspots(null);
    interactionRef.current = {
      ...interactionRef.current,
      mode: "drawing",
      activeId: null,
      drawCenter: { x: pct.x, y: pct.y },
      drawRadius: 0,
    };
    setDrawingPreview({ cx: pct.x, cy: pct.y, r: 0 });
    containerRef.current.setPointerCapture(e.pointerId);
  };

  const onMarkerPointerDown = (hotspot: HotspotItem, e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || !containerRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const pct = eventToPercent(e, containerRef.current);
    setSelectedId(hotspot.id);
    interactionRef.current = {
      ...interactionRef.current,
      mode: "moving",
      activeId: hotspot.id,
      moveStart: { x: pct.x, y: pct.y },
      moveOrigin: { cx: hotspot.centerX, cy: hotspot.centerY },
      moveInitiator: "marker",
      pointerStart: { x: e.clientX, y: e.clientY },
      moved: false,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLElement>, aspectRatio: number) => {
    let i = interactionRef.current;
    if (i.mode === "idle" || !containerRef.current) return;
    const pct = eventToPercent(e, containerRef.current);

    if (i.mode === "drawing") {
      const dx = pct.x - i.drawCenter.x;
      const dy = (pct.y - i.drawCenter.y) * aspectRatio;
      const r = Math.sqrt(dx * dx + dy * dy);
      interactionRef.current = { ...i, drawRadius: r };
      setDrawingPreview({ cx: i.drawCenter.x, cy: i.drawCenter.y, r });
      return;
    }

    if (i.mode === "moving" && i.activeId) {
      const activeId = i.activeId;
      if (i.moveInitiator === "marker" && !i.moved) {
        const distance = Math.hypot(e.clientX - i.pointerStart.x, e.clientY - i.pointerStart.y);
        if (distance < HOTSPOT_DRAG_THRESHOLD_PX) return;
        beginDraftHotspots();
        setDetailsOpenId(null);
        i = { ...i, moved: true };
        interactionRef.current = i;
      }
      const dx = pct.x - i.moveStart.x;
      const dy = pct.y - i.moveStart.y;
      const target = (draftHotspotsRef.current ?? dataRef.current.hotspots).find(
        (h) => h.id === activeId,
      );
      if (!target) return;
      updateDraftHotspot(activeId, {
        centerX: clamp(i.moveOrigin.cx + dx, 0, 100),
        centerY: clamp(i.moveOrigin.cy + dy, 0, 100),
      });
      return;
    }

    if (i.mode === "resizing" && i.activeId) {
      const dx = pct.x - i.resizeOrigin.cx;
      const dy = (pct.y - i.resizeOrigin.cy) * aspectRatio;
      const newR = Math.max(MIN_RADIUS, Math.sqrt(dx * dx + dy * dy));
      const target = (draftHotspotsRef.current ?? dataRef.current.hotspots).find(
        (h) => h.id === i.activeId,
      );
      if (!target) return;
      updateDraftHotspot(i.activeId, { radius: newR });
    }
  };

  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    const i = interactionRef.current;
    if (i.mode === "idle") {
      suppressNextCanvasPointerDownRef.current = false;
      return;
    }
    const cancelled = e.type === "pointercancel" || e.type === "lostpointercapture";

    if (i.mode === "drawing" && !cancelled && i.drawRadius >= MIN_RADIUS) {
      addHotspotRegion({
        centerX: clamp(i.drawCenter.x, 0, 100),
        centerY: clamp(i.drawCenter.y, 0, 100),
        radius: i.drawRadius,
        label: `Region ${dataRef.current.hotspots.length + 1}`,
      });
    }

    if (i.mode === "moving" || i.mode === "resizing") {
      if (cancelled || (i.moveInitiator === "marker" && !i.moved)) {
        setDraftHotspots(null);
      } else {
        commitDraftHotspots();
      }
    }

    if (!cancelled && i.mode === "moving" && i.moveInitiator === "marker" && i.moved) {
      suppressNextMarkerClickRef.current = i.activeId;
      setTimeout(() => {
        if (suppressNextMarkerClickRef.current === i.activeId) {
          suppressNextMarkerClickRef.current = null;
        }
      }, 0);
    }

    setDrawingPreview(null);
    interactionRef.current = { ...i, mode: "idle", activeId: null };
    if (containerRef.current?.hasPointerCapture(e.pointerId)) {
      containerRef.current.releasePointerCapture(e.pointerId);
    }
  };

  const onDetailsPointerDownOutside = (event: { target: EventTarget | null }) => {
    const target = event.target;
    if (target instanceof Node && containerRef.current?.contains(target)) {
      suppressNextCanvasPointerDownRef.current = true;
    }
  };

  const selectedHotspotIndex = selectedId
    ? visibleHotspots.findIndex((h) => h.id === selectedId)
    : -1;
  const selectedHotspot = selectedHotspotIndex >= 0 ? visibleHotspots[selectedHotspotIndex]! : null;

  // Empty-state CTA when no image picked yet. Dashed-border pill +
  // ink-hover, matching every other "add" affordance (Add choice / Add
  // item / Add hint / Add pair) so the brand mark's dashed slot
  // metaphor lands on this surface too. Hover lifts to ink, never
  // teal, per the Triple-In-Reserve Rule.
  if (!data.image || !resolvedSrc) {
    return (
      <div className="sc-app-image-hotspot-empty">
        <MediaEmptyAction
          aria-label="Add hotspot image"
          icon={<ImagePlaceholder size={iconSm} weight="regular" aria-hidden />}
          label="Add hotspot image"
          onClick={() => setPickerOpen(true)}
        />
        <p className="sc-app-image-hotspot-empty__description">
          Upload or paste a URL, then draw hotspot regions on top.
        </p>
        <FilePickerModal
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          kind="media"
          allowedMediaTypes={["image"]}
          defaultMediaType="image"
          title="Add hotspot image"
          onResolved={(result) => {
            const image = applyImageHotspotPick(result);
            return image ? replaceImage(image) : false;
          }}
        />
      </div>
    );
  }

  const canvasSurface = (
    <ImageHotspotCanvasSurface
      mode="authoring"
      containerRef={containerRef}
      fitContainerRef={fitStageRef}
      fitStrategy={fitStrategy}
      src={resolvedSrc}
      alt={data.image.alt ?? ""}
      ariaLabel={
        isBoundedCompact ? "Image hotspot authoring preview" : "Image hotspot authoring area"
      }
      className={
        canEditInline
          ? "sc-course-image-hotspot-canvas--authoring"
          : "sc-course-image-hotspot-canvas--authoring-preview"
      }
      contentEditable={false}
      {...(canEditInline
        ? {
            onSurfacePointerDown: (
              event: PointerEvent<HTMLDivElement>,
              surface: { aspectRatio: number },
            ) => onPointerDown(event, surface.aspectRatio),
            onSurfacePointerMove: (
              event: PointerEvent<HTMLDivElement>,
              surface: { aspectRatio: number },
            ) => onPointerMove(event, surface.aspectRatio),
            onSurfacePointerUp: (
              event: PointerEvent<HTMLDivElement>,
              _surface: { aspectRatio: number },
            ) => onPointerUp(event),
          }
        : {})}
    >
      {({ aspectRatio, naturalSize }) => {
        return (
          <>
            {!isExpanded && !isBoundedCompact && (
              <div
                role="toolbar"
                aria-label="Image hotspot image tools"
                className="sc-app-image-hotspot__canvas-toolbar"
                hidden={isInteracting}
              >
                {!isBoundedCompact && (
                  <>
                    <ImageHotspotAuthoringWorkspace.InlineAction
                      label="Replace image"
                      intent="replace"
                      onClick={() => setPickerOpen(true)}
                    >
                      <ArrowsClockwise size={iconMd} aria-hidden />
                    </ImageHotspotAuthoringWorkspace.InlineAction>
                    <ImageHotspotAuthoringWorkspace.InlineAction
                      data-image-hotspot-add-region=""
                      label="Add hotspot region"
                      intent="add"
                      onClick={() => {
                        const id = addKeyboardHotspotRegion();
                        if (!canEditInline && id) {
                          setWorkspaceSelectionRequestId(id);
                          setWorkspaceOpen(true);
                        }
                      }}
                    >
                      <Plus size={iconMd} aria-hidden />
                    </ImageHotspotAuthoringWorkspace.InlineAction>
                  </>
                )}
                <ImageHotspotAuthoringWorkspace.Trigger asChild>
                  <ImageHotspotAuthoringWorkspace.InlineAction
                    label="Edit hotspots in expanded workspace"
                    intent="edit"
                  >
                    <PencilSimple size={iconMd} aria-hidden />
                  </ImageHotspotAuthoringWorkspace.InlineAction>
                </ImageHotspotAuthoringWorkspace.Trigger>
              </div>
            )}
            {naturalSize && (
              <svg
                aria-hidden="true"
                className="sc-course-image-hotspot-overlay"
                viewBox={`0 0 ${naturalSize.w} ${naturalSize.h}`}
                preserveAspectRatio="none"
              >
                {visibleHotspots.map((h) => {
                  const isSel = h.id === selectedId;
                  const cx = (h.centerX / 100) * naturalSize.w;
                  const cy = (h.centerY / 100) * naturalSize.h;
                  const r = (h.radius / 100) * naturalSize.w;
                  const isCorrect = assessment.correctHotspotIds.includes(h.id);
                  return (
                    <g
                      key={h.id}
                      className="sc-app-image-hotspot__author-region"
                      data-course-state={isCorrect ? "correct" : undefined}
                      data-hotspot-state={isSel ? "selected" : "idle"}
                    >
                      <circle
                        cx={cx}
                        cy={cy}
                        r={r}
                        className="sc-app-image-hotspot__author-region-contrast"
                      />
                      <circle
                        cx={cx}
                        cy={cy}
                        r={r}
                        className="sc-app-image-hotspot__author-region-shape"
                      />
                    </g>
                  );
                })}
                {drawingPreview && (
                  <g>
                    <circle
                      cx={(drawingPreview.cx / 100) * naturalSize.w}
                      cy={(drawingPreview.cy / 100) * naturalSize.h}
                      r={(drawingPreview.r / 100) * naturalSize.w}
                      className="sc-app-image-hotspot__author-region-contrast sc-app-image-hotspot__author-region-contrast--preview"
                    />
                    <circle
                      cx={(drawingPreview.cx / 100) * naturalSize.w}
                      cy={(drawingPreview.cy / 100) * naturalSize.h}
                      r={(drawingPreview.r / 100) * naturalSize.w}
                      className="sc-app-image-hotspot__author-region-preview"
                    />
                  </g>
                )}
              </svg>
            )}

            {canEditInline && selectedHotspot && (
              <span
                aria-hidden="true"
                className="sc-app-image-hotspot__author-resize-handle"
                data-hotspot-resize-handle-id={selectedHotspot.id}
                style={resizeHandleStyle(selectedHotspot)}
              />
            )}

            {canEditInline &&
              visibleHotspots.map((h, idx) => {
                const isSel = h.id === selectedId;
                const detailsOpen = h.id === detailsOpenId;
                const hotspotName = `Edit hotspot ${idx + 1}${h.label ? `: ${h.label}` : ""}`;
                const markerButton = (
                  <button
                    key={h.id}
                    type="button"
                    aria-label={hotspotName}
                    data-hotspot-selected={isSel ? "true" : "false"}
                    data-hotspot-author-marker-id={h.id}
                    onPointerDown={(e) => onMarkerPointerDown(h, e)}
                    onPointerMove={(e) => {
                      e.stopPropagation();
                      onPointerMove(e, aspectRatio);
                    }}
                    onPointerUp={(e) => {
                      e.stopPropagation();
                      onPointerUp(e);
                    }}
                    onPointerCancel={(e) => {
                      e.stopPropagation();
                      onPointerUp(e);
                    }}
                    onLostPointerCapture={(e) => {
                      e.stopPropagation();
                      onPointerUp(e);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (suppressNextMarkerClickRef.current === h.id) {
                        e.preventDefault();
                        suppressNextMarkerClickRef.current = null;
                        return;
                      }
                      setSelectedId(h.id);
                      if (isExpanded) setDetailsOpenId(null);
                    }}
                    className="sc-app-image-hotspot-author-marker"
                    style={edgeSafeMarkerStyle(h.centerX, h.centerY)}
                  >
                    <span className="sc-app-image-hotspot-author-marker__number" aria-hidden>
                      {idx + 1}
                    </span>
                    <span className="sc-app-image-hotspot-author-marker__edit" aria-hidden>
                      <PencilSimple size={10} weight="bold" />
                    </span>
                  </button>
                );

                if (isExpanded) return markerButton;

                return (
                  <EditableOverlayPopover.Root
                    key={h.id}
                    open={detailsOpen}
                    onOpenChange={(open) => {
                      if (open) {
                        setSelectedId(h.id);
                        setDetailsOpenId(h.id);
                        return;
                      }
                      setDetailsOpenId((current) => (current === h.id ? null : current));
                    }}
                  >
                    <EditableOverlayPopover.Trigger asChild>
                      {markerButton}
                    </EditableOverlayPopover.Trigger>
                    {detailsOpen && (
                      <EditableOverlayPopover.Portal container={popoverPortalContainerRef?.current}>
                        <CompactHotspotEditorPopover
                          assessment={assessment}
                          editor={editor}
                          hotspot={h}
                          index={idx}
                          authoredBlockId={authoredBlockId}
                          onPointerDownOutside={onDetailsPointerDownOutside}
                          onPatch={(patch) => patchHotspot(h.id, patch)}
                          onToggleCorrect={() => toggleCorrect(h.id)}
                          onDelete={() => removeHotspot(h.id)}
                          target={target}
                        />
                      </EditableOverlayPopover.Portal>
                    )}
                  </EditableOverlayPopover.Root>
                );
              })}
          </>
        );
      }}
    </ImageHotspotCanvasSurface>
  );

  const expandedInspector = (
    <MediaWorkspace.Sidebar
      aria-label="Selected hotspot details"
      className="sc-app-image-hotspot-workspace__sidebar"
    >
      <MediaWorkspace.SidebarHeader
        title="Hotspots"
        description="Select a region or row to edit its details."
        count={visibleHotspots.length}
        countLabel={`${visibleHotspots.length} total hotspots`}
      />
      <ImageHotspotDefinitionFields
        alt={data.image?.alt ?? ""}
        maxClicks={data.maxClicks}
        onAltCommit={setAltText}
        onClickLimitCommit={setClickLimit}
      />
      {visibleHotspots.length > 0 ? (
        <MediaWorkspace.List
          ref={hotspotListRef}
          aria-label="Hotspots"
          className="sc-app-image-hotspot-workspace__list"
        >
          {visibleHotspots.map((hotspot, index) => {
            const selected = hotspot.id === selectedHotspot?.id;
            const summary = hotspot.label.trim() || "Untitled hotspot";

            return (
              <MediaWorkspace.Item
                key={hotspot.id}
                selected={selected}
                data-workspace-hotspot-id={hotspot.id}
                data-hotspot-state={selected ? "selected" : "idle"}
                className="sc-app-image-hotspot-workspace__item"
              >
                <MediaWorkspace.ItemHeader>
                  <MediaWorkspace.ItemSelect
                    aria-label={`Select hotspot ${index + 1}: ${summary}`}
                    aria-pressed={selected}
                    className="sc-app-image-hotspot-workspace__item-select"
                    onClick={() => {
                      setSelectedId(hotspot.id);
                      setDetailsOpenId(null);
                    }}
                  >
                    <MediaWorkspace.ItemNumber aria-hidden>{index + 1}</MediaWorkspace.ItemNumber>
                    <span className="sc-app-image-hotspot-workspace__row-summary">{summary}</span>
                  </MediaWorkspace.ItemSelect>
                </MediaWorkspace.ItemHeader>
                {selected && (
                  <div className="sc-app-image-hotspot-workspace__row-editor">
                    <HotspotEditorContent
                      hotspot={hotspot}
                      assessment={assessment}
                      bubbleMenuAppendTo={() =>
                        popoverPortalContainerRef?.current instanceof HTMLElement
                          ? popoverPortalContainerRef.current
                          : null
                      }
                      editor={editor}
                      index={index}
                      authoredBlockId={authoredBlockId}
                      showHeader
                      onPatch={(patch) => patchHotspot(hotspot.id, patch)}
                      onToggleCorrect={() => toggleCorrect(hotspot.id)}
                      onDelete={() => removeHotspot(hotspot.id)}
                      target={target}
                    />
                  </div>
                )}
              </MediaWorkspace.Item>
            );
          })}
        </MediaWorkspace.List>
      ) : (
        <MediaWorkspace.Empty className="sc-app-image-hotspot-workspace__empty">
          <strong>No hotspots yet</strong>
          <span>Add a region to define an interactive hotspot.</span>
          <MediaEmptyAction
            aria-label="Add first hotspot region"
            icon={<Plus size={iconSm} aria-hidden />}
            label="Add first region"
            onClick={() => {
              const id = addKeyboardHotspotRegion();
              if (id) setWorkspaceSelectionRequestId(id);
            }}
          />
        </MediaWorkspace.Empty>
      )}
      <MissFeedbackEditor
        assessment={assessment}
        authoredBlockId={authoredBlockId}
        bubbleMenuAppendTo={() =>
          popoverPortalContainerRef?.current instanceof HTMLElement
            ? popoverPortalContainerRef.current
            : null
        }
        editor={editor}
        target={target}
      />
    </MediaWorkspace.Sidebar>
  );

  const filePickerModal = (
    <FilePickerModal
      open={pickerOpen}
      onOpenChange={setPickerOpen}
      kind="media"
      allowedMediaTypes={["image"]}
      defaultMediaType="image"
      title="Replace hotspot image"
      onResolved={(result) => {
        const image = applyImageHotspotPick(result);
        return image ? replaceImage(image) : false;
      }}
    />
  );

  if (isExpanded) {
    return (
      <>
        <MediaWorkspace.Canvas
          ref={fitStageRef}
          aria-label="Image hotspot workspace canvas"
          className="sc-app-image-hotspot-workspace__canvas"
        >
          <CourseThemePortalBoundary>{canvasSurface}</CourseThemePortalBoundary>
        </MediaWorkspace.Canvas>
        {expandedInspector}
        {renderLiveRegion ? (
          <span className="sc-sr-only" aria-live="polite" aria-atomic="true">
            {announcement}
          </span>
        ) : null}
        {filePickerModal}
      </>
    );
  }

  return (
    <div
      className={cn(
        "sc-course-image-hotspot-shell",
        isFullSlide && "sc-course-image-hotspot-shell--full-slide",
      )}
    >
      <ImageHotspotAuthoringWorkspace.Root
        open={workspaceOpen}
        onOpenChange={(open) => {
          setWorkspaceOpen(open);
          if (!open) setWorkspaceSelectionRequestId(null);
        }}
      >
        <div
          ref={fitStageRef}
          className="sc-course-image-hotspot-fit-stage"
          data-image-hotspot-presentation={
            isFullSlide ? "full-slide" : isBoundedCompact ? "bounded" : "compact"
          }
        >
          {canvasSurface}
          {isBoundedCompact && (
            <div
              role="toolbar"
              aria-label="Image hotspot image tools"
              className="sc-app-image-hotspot__canvas-toolbar"
            >
              <ImageHotspotAuthoringWorkspace.Trigger asChild>
                <ImageHotspotAuthoringWorkspace.InlineAction
                  label="Edit hotspots in expanded workspace"
                  intent="edit"
                >
                  <PencilSimple size={iconMd} aria-hidden />
                </ImageHotspotAuthoringWorkspace.InlineAction>
              </ImageHotspotAuthoringWorkspace.Trigger>
            </div>
          )}
        </div>
        <ImageHotspotAuthoringWorkspace.Content
          ref={workspaceElementRef}
          title="Edit image hotspots"
          description={`${visibleHotspots.length} region${visibleHotspots.length === 1 ? "" : "s"}. Draw and manage hotspot regions on the image.`}
          toolbar={
            <ImageHotspotAuthoringWorkspace.ToolbarGroup aria-label="Image actions">
              <ImageHotspotAuthoringWorkspace.ToolbarAction
                label="Replace hotspot image"
                intent="replace"
                onClick={() => setPickerOpen(true)}
              >
                <ArrowsClockwise size={iconMd} aria-hidden />
              </ImageHotspotAuthoringWorkspace.ToolbarAction>
              <ImageHotspotAuthoringWorkspace.ToolbarAction
                data-image-hotspot-add-region=""
                label="Add hotspot region"
                intent="add"
                onClick={() => {
                  const id = addKeyboardHotspotRegion();
                  if (id) setWorkspaceSelectionRequestId(id);
                }}
              >
                <Plus size={iconMd} aria-hidden />
              </ImageHotspotAuthoringWorkspace.ToolbarAction>
            </ImageHotspotAuthoringWorkspace.ToolbarGroup>
          }
        >
          <AuthorCanvas
            assessment={assessment}
            data={data}
            editor={editor}
            getCanvasPos={getCanvasPos}
            blockId={blockId}
            authoredBlockId={authoredBlockId}
            popoverPortalContainerRef={workspaceElementRef}
            presentation="expanded"
            selectedHotspotRequestId={workspaceSelectionRequestId}
            onAnnounce={announce}
            renderLiveRegion={false}
            target={target}
          />
        </ImageHotspotAuthoringWorkspace.Content>
      </ImageHotspotAuthoringWorkspace.Root>

      {renderLiveRegion ? (
        <span className="sc-sr-only" aria-live="polite" aria-atomic="true">
          {announcement}
        </span>
      ) : null}

      {filePickerModal}
    </div>
  );
}

function isImageHotspotBoundedFillActive(
  editor: NodeViewProps["editor"],
  getCanvasPos: () => number | null,
): boolean {
  const canvasPos = getCanvasPos();
  if (canvasPos === null) return false;
  const parent = resolveAssessmentAttrParent(editor, canvasPos, ["image_hotspot"]);
  if (!parent) return false;
  const capabilities = getScaffoldCapabilitiesForEditor(editor);
  return (
    resolveActiveBoundedPlacement({
      blockDefinitions: capabilities.blocks.registry,
      capability: "fill",
      doc: editor.state.doc,
      layoutDefinitions: capabilities.layouts.registry,
      pos: parent.pos,
    }) === "fill"
  );
}

function ImageHotspotDefinitionFields({
  alt,
  maxClicks,
  onAltCommit,
  onClickLimitCommit,
}: {
  alt: string;
  maxClicks: number | null;
  onAltCommit: (alt: string) => boolean;
  onClickLimitCommit: (maxClicks: number | null) => boolean;
}) {
  const altInputId = useId();
  const limitInputId = useId();
  const [altDraft, setAltDraft] = useState(alt);
  const [limitDraft, setLimitDraft] = useState(maxClicks === null ? "" : String(maxClicks));

  useEffect(() => setAltDraft(alt), [alt]);
  useEffect(() => setLimitDraft(maxClicks === null ? "" : String(maxClicks)), [maxClicks]);

  const commitAlt = () => {
    const next = altDraft.trim();
    if (next === alt) {
      setAltDraft(next);
      return;
    }
    if (!onAltCommit(next)) setAltDraft(alt);
  };

  const commitLimit = () => {
    const current = maxClicks === null ? "" : String(maxClicks);
    const normalized = limitDraft.trim();
    if (normalized === current) {
      setLimitDraft(normalized);
      return;
    }
    if (normalized === "") {
      if (!onClickLimitCommit(null)) setLimitDraft(current);
      return;
    }
    const next = Number(normalized);
    if (!Number.isInteger(next) || !onClickLimitCommit(next)) {
      setLimitDraft(current);
    }
  };

  return (
    <div className="sc-app-image-hotspot-workspace__definition-fields">
      <div className="sc-app-image-hotspot-editor__field">
        <label htmlFor={altInputId} className="sc-app-image-hotspot-editor__label">
          Image alternative text
        </label>
        <WorkspaceDialog.TextField
          id={altInputId}
          value={altDraft}
          data-no-select
          onBlur={commitAlt}
          onChange={(event) => setAltDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
      </div>
      <div className="sc-app-image-hotspot-editor__field">
        <label htmlFor={limitInputId} className="sc-app-image-hotspot-editor__label">
          Maximum selections
        </label>
        <WorkspaceDialog.TextField
          id={limitInputId}
          type="number"
          min={1}
          step={1}
          value={limitDraft}
          placeholder="No limit"
          data-no-select
          onBlur={commitLimit}
          onChange={(event) => setLimitDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
      </div>
    </div>
  );
}

function CompactHotspotEditorPopover({
  assessment,
  editor,
  hotspot,
  index,
  authoredBlockId,
  onDelete,
  onPatch,
  onPointerDownOutside,
  onToggleCorrect,
  target,
}: {
  assessment: ImageHotspotPrivateAssessment;
  editor: NodeViewProps["editor"];
  hotspot: HotspotItem;
  index: number;
  authoredBlockId: string | null;
  onDelete: () => void;
  onPatch: (patch: HotspotPatch) => boolean;
  onPointerDownOutside: (event: { target: EventTarget | null }) => void;
  onToggleCorrect: () => void;
  target: AuthoringNodeTarget | null;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <EditableOverlayPopover.Shell
        bodyRef={bodyRef}
        collisionPadding={12}
        headerActions={<HotspotDeleteButton index={index} onDelete={onDelete} />}
        onClick={(event) => event.stopPropagation()}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onPointerDown={(event) => event.stopPropagation()}
        onPointerDownOutside={onPointerDownOutside}
        side="bottom"
        sideOffset={8}
        title={`Hotspot ${index + 1}`}
      >
        <HotspotEditorContent
          assessment={assessment}
          bubbleMenuAppendTo={() => bodyRef.current}
          editor={editor}
          hotspot={hotspot}
          index={index}
          authoredBlockId={authoredBlockId}
          onDelete={onDelete}
          onPatch={onPatch}
          onToggleCorrect={onToggleCorrect}
          target={target}
        />
        <EditableOverlayPopover.Arrow />
      </EditableOverlayPopover.Shell>
    </>
  );
}

// Per-hotspot details — label + isCorrect toggle + attr-backed feedback.
function HotspotEditorContent({
  hotspot,
  assessment,
  bubbleMenuAppendTo,
  editor,
  index,
  authoredBlockId,
  showHeader = false,
  onPatch,
  onToggleCorrect,
  onDelete,
  target,
}: {
  hotspot: HotspotItem;
  assessment: ImageHotspotPrivateAssessment;
  bubbleMenuAppendTo: () => HTMLElement | null;
  editor: NodeViewProps["editor"];
  index: number;
  authoredBlockId: string | null;
  showHeader?: boolean;
  onPatch: (patch: HotspotPatch) => boolean;
  onToggleCorrect: () => void;
  onDelete: () => void;
  target: AuthoringNodeTarget | null;
}) {
  const isCorrect = assessment.correctHotspotIds.includes(hotspot.id);
  const feedback = assessment.feedbackByHotspotId[hotspot.id] ?? null;
  const editorFieldId = useId();
  const labelInputId = useId();
  const centerXInputId = useId();
  const centerYInputId = useId();
  const radiusInputId = useId();
  const [labelDraft, setLabelDraft] = useState(hotspot.label);
  const [centerXDraft, setCenterXDraft] = useState(String(hotspot.centerX));
  const [centerYDraft, setCenterYDraft] = useState(String(hotspot.centerY));
  const [radiusDraft, setRadiusDraft] = useState(String(hotspot.radius));
  const bubbleMenuPluginKey = useMemo(
    () => `image-hotspot-feedback-${editorFieldId.replace(/[^A-Za-z0-9_-]/g, "")}`,
    [editorFieldId],
  );
  const extensions = useMemo(
    () => [
      ...createFieldContentEditorExtensions(),
      Placeholder.configure({
        includeChildren: false,
        placeholder: "Enter feedback for this region",
        showOnlyCurrent: false,
        showOnlyWhenEditable: true,
      }),
    ],
    [],
  );
  const feedbackTarget = useMemo(
    () => ({
      kind: "attr" as const,
      read: () => readHotspotFeedbackDocument(target, hotspot.id),
      write: (nextDocument: ScaffoldRichTextDocument) => {
        target?.transact((tr, owner) =>
          setImageHotspotFeedbackChecked({
            tr,
            target: owner,
            hotspotId: hotspot.id,
            feedback: richTextDocumentToAssessmentFeedback(nextDocument),
          }),
        );
      },
    }),
    [hotspot.id, target],
  );
  const syncKey = useMemo(
    () => `${hotspot.id}:${JSON.stringify(feedback?.document ?? null)}`,
    [feedback?.document, hotspot.id],
  );

  useEffect(() => setLabelDraft(hotspot.label), [hotspot.id, hotspot.label]);
  useEffect(() => setCenterXDraft(String(hotspot.centerX)), [hotspot.centerX, hotspot.id]);
  useEffect(() => setCenterYDraft(String(hotspot.centerY)), [hotspot.centerY, hotspot.id]);
  useEffect(() => setRadiusDraft(String(hotspot.radius)), [hotspot.id, hotspot.radius]);

  const commitLabel = () => {
    const next = labelDraft.trim();
    if (next === hotspot.label) {
      setLabelDraft(next);
      return;
    }
    if (!onPatch({ label: next })) setLabelDraft(hotspot.label);
  };

  const commitGeometry = (
    field: "centerX" | "centerY" | "radius",
    draft: string,
    current: number,
    resetDraft: (value: string) => void,
  ) => {
    const next = Number(draft);
    if (!Number.isFinite(next)) {
      resetDraft(String(current));
      return;
    }
    if (next === current) {
      resetDraft(String(next));
      return;
    }
    const patch =
      field === "centerX"
        ? { centerX: next }
        : field === "centerY"
          ? { centerY: next }
          : { radius: next };
    if (!onPatch(patch)) resetDraft(String(current));
  };

  return (
    <div className="sc-app-image-hotspot-editor">
      {showHeader && (
        <div className="sc-app-image-hotspot-editor__header">
          <span className="sc-app-image-hotspot-editor__title">Hotspot {index + 1}</span>
          <HotspotDeleteButton index={index} onDelete={onDelete} />
        </div>
      )}

      <div className="sc-app-image-hotspot-editor__field">
        <label htmlFor={labelInputId} className="sc-app-image-hotspot-editor__label">
          Public region label
        </label>
        <WorkspaceDialog.TextField
          id={labelInputId}
          type="text"
          value={labelDraft}
          data-no-select
          onBlur={commitLabel}
          onChange={(event) => setLabelDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          placeholder="Short label for this region"
          className="sc-app-image-hotspot-editor__input"
        />
      </div>

      <fieldset className="sc-app-image-hotspot-editor__geometry">
        <legend>Geometry (percent)</legend>
        <div className="sc-app-image-hotspot-editor__geometry-grid">
          <div className="sc-app-image-hotspot-editor__field">
            <label htmlFor={centerXInputId} className="sc-app-image-hotspot-editor__label">
              Centre X
            </label>
            <WorkspaceDialog.TextField
              id={centerXInputId}
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={centerXDraft}
              data-no-select
              onBlur={() =>
                commitGeometry("centerX", centerXDraft, hotspot.centerX, setCenterXDraft)
              }
              onChange={(event) => setCenterXDraft(event.currentTarget.value)}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
            />
          </div>
          <div className="sc-app-image-hotspot-editor__field">
            <label htmlFor={centerYInputId} className="sc-app-image-hotspot-editor__label">
              Centre Y
            </label>
            <WorkspaceDialog.TextField
              id={centerYInputId}
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={centerYDraft}
              data-no-select
              onBlur={() =>
                commitGeometry("centerY", centerYDraft, hotspot.centerY, setCenterYDraft)
              }
              onChange={(event) => setCenterYDraft(event.currentTarget.value)}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
            />
          </div>
          <div className="sc-app-image-hotspot-editor__field">
            <label htmlFor={radiusInputId} className="sc-app-image-hotspot-editor__label">
              Radius
            </label>
            <WorkspaceDialog.TextField
              id={radiusInputId}
              type="number"
              min={MIN_RADIUS}
              max={100}
              step={0.5}
              value={radiusDraft}
              data-no-select
              onBlur={() => commitGeometry("radius", radiusDraft, hotspot.radius, setRadiusDraft)}
              onChange={(event) => setRadiusDraft(event.currentTarget.value)}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
            />
          </div>
        </div>
      </fieldset>

      <Button
        type="button"
        size="lg"
        variant={isCorrect ? "success" : "secondary"}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          onToggleCorrect();
        }}
        aria-pressed={isCorrect}
        data-course-state={isCorrect ? "correct" : undefined}
        data-no-select
        className="sc-app-image-hotspot-editor__correct-toggle"
      >
        <CheckCircle
          size={iconSm}
          weight={isCorrect ? "fill" : "regular"}
          className={isCorrect ? "sc-app-image-hotspot-editor__correct-icon" : undefined}
        />
        {isCorrect ? "Marked correct" : "Mark as correct"}
      </Button>

      <div className="sc-app-image-hotspot-editor__field">
        <label id={editorFieldId} className="sc-app-image-hotspot-editor__label">
          Feedback
        </label>
        <RichTextArea
          placeholder="Enter feedback for this region"
          ariaLabel={`Hotspot ${index + 1} feedback`}
          ariaLabelledBy={editorFieldId}
          bubbleMenuAppendTo={bubbleMenuAppendTo}
          bubbleMenuPluginKey={bubbleMenuPluginKey}
          extensions={extensions}
          fieldKey={`image_hotspot:${authoredBlockId ?? "pending"}:hotspot:${hotspot.id}:feedback`}
          outerEditor={editor}
          syncKey={syncKey}
          target={feedbackTarget}
        />
      </div>
    </div>
  );
}

function HotspotDeleteButton({ index, onDelete }: { index: number; onDelete: () => void }) {
  return (
    <AssessmentChoiceAuthoringAction
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        onDelete();
      }}
      label={`Delete hotspot ${index + 1}`}
      intent="delete"
      owner="app"
    >
      <Trash size={iconSm} aria-hidden />
    </AssessmentChoiceAuthoringAction>
  );
}

function MissFeedbackEditor({
  assessment,
  authoredBlockId,
  bubbleMenuAppendTo,
  editor,
  target,
}: {
  assessment: ImageHotspotPrivateAssessment;
  authoredBlockId: string | null;
  bubbleMenuAppendTo: () => HTMLElement | null;
  editor: NodeViewProps["editor"];
  target: AuthoringNodeTarget | null;
}) {
  const labelId = useId();
  const pluginId = useId();
  const feedback = assessment.missFeedback ?? null;
  const extensions = useMemo(
    () => [
      ...createFieldContentEditorExtensions(),
      Placeholder.configure({
        includeChildren: false,
        placeholder: "Feedback for a click outside every region",
        showOnlyCurrent: false,
        showOnlyWhenEditable: true,
      }),
    ],
    [],
  );
  const feedbackTarget = useMemo(
    () => ({
      kind: "attr" as const,
      read: () => {
        const owner = target?.read();
        const model = owner ? resolveImageHotspotAuthoringModel(owner) : null;
        return toTiptapRichTextDocument(model?.assessment.missFeedback?.document);
      },
      write: (nextDocument: ScaffoldRichTextDocument) => {
        target?.transact((tr, owner) =>
          setImageHotspotMissFeedbackChecked({
            tr,
            target: owner,
            feedback: richTextDocumentToAssessmentFeedback(nextDocument),
          }),
        );
      },
    }),
    [target],
  );

  return (
    <div className="sc-app-image-hotspot-workspace__miss-feedback">
      <label id={labelId} className="sc-app-image-hotspot-editor__label">
        Miss feedback
      </label>
      <RichTextArea
        ariaLabel="Image hotspot miss feedback"
        ariaLabelledBy={labelId}
        bubbleMenuAppendTo={bubbleMenuAppendTo}
        bubbleMenuPluginKey={`image-hotspot-miss-feedback-${pluginId.replace(/[^A-Za-z0-9_-]/g, "")}`}
        extensions={extensions}
        fieldKey={`image_hotspot:${authoredBlockId ?? "pending"}:miss-feedback`}
        outerEditor={editor}
        placeholder="Feedback for a click outside every region"
        syncKey={JSON.stringify(feedback?.document ?? null)}
        target={feedbackTarget}
      />
    </div>
  );
}

function readHotspotFeedbackDocument(
  target: AuthoringNodeTarget | null,
  hotspotId: string,
): ScaffoldRichTextDocument | null {
  const owner = target?.read();
  const model = owner ? resolveImageHotspotAuthoringModel(owner) : null;
  return toTiptapRichTextDocument(model?.assessment.feedbackByHotspotId[hotspotId]?.document);
}

// ─────────────────────────────────────────────────────────────────────
