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
import { useCallback, useEffect, useId, useMemo, useRef, useState, type PointerEvent } from "react";

import { WorkspaceDialog } from "@/ui/components/WorkspaceDialog/WorkspaceDialog";
import { resolveActiveBoundedPlacement } from "@/editor/bounded-containers/model/bounded-container-structure-policy";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import {
  nodeViewUiKey,
  usePickerOpen,
} from "@/editor/media/authoring/picker/file-picker-open-state";
import { MediaAuthoringActions } from "@/editor/media/presentation/MediaAuthoringActions";
import { MediaExpandButton } from "@/editor/media/presentation/MediaExpandButton";
import { MediaWorkspace } from "@/editor/media/presentation/MediaWorkspace";
import {
  resolveAssessmentAttrParent,
  richTextDocumentToAssessmentFeedback,
} from "@/editor/blocks/assessment/shared/model/private-assessment-attrs";
import { CHOICE_TRAILING_BTN } from "@/editor/blocks/assessment/shared/chrome/ChoiceAnswerItem";
import { findAncestorAssessmentId } from "@/editor/blocks/assessment/shared/model/assessment-prosemirror";
import { createStableId } from "@/document/model/identity/stable-ids";
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
      ...(result.alt ? { alt: result.alt } : {}),
    };
  }
  if (result.source === "browse" && result.browse) {
    return {
      mode: "managed",
      mediaId: result.browse.id,
      ...(result.alt ? { alt: result.alt } : {}),
    };
  }
  if (result.source === "url" && result.url) {
    return {
      mode: "external",
      src: result.url,
      ...(result.alt ? { alt: result.alt } : {}),
    };
  }
  return null;
}
import { useMediaPort } from "@/host/providers/ScaffoldServicesProvider";
import { cn } from "@/lib/cn";
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

import { ImageHotspotCanvasSurface } from "./image-hotspot-canvas-surface";
import {
  removeImageHotspotChecked,
  resolveImageHotspotAuthoringModel,
  setImageHotspotCanvasDataChecked,
  setImageHotspotFeedbackChecked,
  toggleImageHotspotCorrectChecked,
} from "./image-hotspot-authoring-commands";
import {
  createImageHotspotCanvasNode,
  eventToPercent,
  findHitHotspot,
  patchHotspotInCanvasData,
} from "./image-hotspot-canvas-shared";

import "./ImageHotspot.css";

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
export function createImageHotspotCanvasAuthoringNode(blockDefinitions: BlockDefinitionLookup) {
  return createImageHotspotCanvasNode({
    addNodeView: () =>
      ReactNodeViewRenderer((props) => (
        <ImageHotspotCanvasNodeView {...props} blockDefinitions={blockDefinitions} />
      )),
  });
}

// ─────────────────────────────────────────────────────────────────────
// Geometry helpers — pure functions. Aspect-ratio aware: radius is %
// of image WIDTH, so y-distance must be scaled by (width / height) at
// hit-test time so circles render circular on non-square images.
// ─────────────────────────────────────────────────────────────────────

const MIN_RADIUS = 2;
const RESIZE_HANDLE_HIT = 1.8;
const KEYBOARD_HOTSPOT_RADIUS = 8;

function isOnResizeHandle(
  x: number,
  y: number,
  hotspot: HotspotItem,
  aspectRatio: number,
): boolean {
  const handleX = hotspot.centerX + hotspot.radius;
  const handleY = hotspot.centerY;
  const dx = x - handleX;
  const dy = (y - handleY) * aspectRatio;
  return Math.sqrt(dx * dx + dy * dy) <= RESIZE_HANDLE_HIT;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

// Main NodeView — authoring-only. Runtime uses image-hotspot-canvas-runtime.tsx.
// ─────────────────────────────────────────────────────────────────────

function ImageHotspotCanvasNodeView(
  props: NodeViewProps & { blockDefinitions: BlockDefinitionLookup },
) {
  const getCanvasPos = useCallback(() => {
    const rawPos = safeGetPos(props.getPos);
    return typeof rawPos === "number" ? rawPos : null;
  }, [props.getPos]);
  const pos = getCanvasPos();

  const blockId = useMemo(
    () => findAncestorAssessmentId(props.editor, pos ?? undefined, ["image_hotspot"]),
    [pos, props.editor],
  );
  const target = useAuthoringNodeTarget(
    props.editor,
    blockId ? { id: blockId, nodeType: "image_hotspot" } : null,
  );
  const resolvedOwner = target?.read();
  const model = resolvedOwner ? resolveImageHotspotAuthoringModel(resolvedOwner) : null;
  const data = model?.data ?? ImageHotspotCanvasDataSchema.parse({});
  const assessment = model?.assessment ?? ImageHotspotPrivateAssessmentSchema.parse({});
  const problemId = blockId;

  return (
    <NodeViewWrapper data-node="image-hotspot-canvas">
      <AuthorCanvas
        blockDefinitions={props.blockDefinitions}
        assessment={assessment}
        data={data}
        editor={props.editor}
        getCanvasPos={getCanvasPos}
        blockId={blockId}
        problemId={problemId}
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
  blockDefinitions: BlockDefinitionLookup;
  assessment: ImageHotspotPrivateAssessment;
  data: ImageHotspotCanvasData;
  editor: NodeViewProps["editor"];
  getCanvasPos: () => number | null;
  blockId: string | null;
  problemId: string | null;
  target: AuthoringNodeTarget | null;
  popoverPortalContainer?: Element | null;
  presentation?: "compact" | "expanded";
  selectedHotspotRequestId?: string | null;
}

function AuthorCanvas({
  blockDefinitions,
  assessment,
  data,
  editor,
  getCanvasPos,
  blockId,
  problemId,
  target,
  popoverPortalContainer,
  presentation = "compact",
  selectedHotspotRequestId,
}: AuthorCanvasProps) {
  const isExpanded = presentation === "expanded";
  const mediaPort = useMediaPort();
  const pickerKey = nodeViewUiKey({
    owner: "image-hotspot",
    surface: isExpanded ? "file-picker-expanded" : "file-picker",
    id: blockId,
  });
  const [pickerOpen, setPickerOpen] = usePickerOpen(pickerKey);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceElement, setWorkspaceElement] = useState<HTMLDivElement | null>(null);
  const [workspaceSelectionRequestId, setWorkspaceSelectionRequestId] = useState<string | null>(
    null,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailsOpenId, setDetailsOpenId] = useState<string | null>(null);
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
  const interactionRef = useRef({
    mode: "idle" as InteractionMode,
    activeId: null as string | null,
    drawCenter: { x: 0, y: 0 },
    drawRadius: 0,
    moveStart: { x: 0, y: 0 },
    moveOrigin: { cx: 0, cy: 0 },
    resizeOrigin: { cx: 0, cy: 0 },
  });
  const [drawingPreview, setDrawingPreview] = useState<{
    cx: number;
    cy: number;
    r: number;
  } | null>(null);
  const isInteracting = drawingPreview !== null || draftHotspotsState !== null;
  const boundedFillActive = useEditorState({
    editor,
    selector: ({ editor }) =>
      isImageHotspotBoundedFillActive(editor, getCanvasPos, blockDefinitions),
  });
  const isBoundedCompact = !isExpanded && boundedFillActive;
  const canEditInline = isExpanded || !boundedFillActive;
  const fitStrategy = isExpanded || isBoundedCompact ? "contain" : "width";
  const visibleHotspots = draftHotspotsState ?? data.hotspots;

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

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

  const commitData = (next: ImageHotspotCanvasData): boolean => {
    const result = target?.transact((tr, owner) =>
      setImageHotspotCanvasDataChecked({ tr, target: owner, data: next }),
    );
    if (!result?.ok) return false;
    dataRef.current = next;
    return true;
  };

  const setHotspots = (hotspots: HotspotItem[]) => {
    commitData({ ...dataRef.current, hotspots });
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
    setHotspots(draftHotspots);
    setDraftHotspots(null);
  };

  const addHotspotRegion = (hotspot: Omit<HotspotItem, "id">) => {
    const id = createStableId();
    setHotspots([
      ...dataRef.current.hotspots,
      {
        id,
        ...hotspot,
      },
    ]);
    setSelectedId(id);
    return id;
  };

  const addKeyboardHotspotRegion = () => {
    return addHotspotRegion({
      centerX: 50,
      centerY: 50,
      radius: KEYBOARD_HOTSPOT_RADIUS,
      label: "",
    });
  };

  const patchHotspot = (id: string, patch: HotspotPatch) => {
    commitData(patchHotspotInCanvasData(dataRef.current, id, patch));
  };

  const removeHotspot = (id: string) => {
    const result = target?.transact((tr, owner) =>
      removeImageHotspotChecked({ tr, target: owner, hotspotId: id }),
    );
    if (!result?.ok) return;
    if (selectedId === id) setSelectedId(null);
    if (detailsOpenId === id) setDetailsOpenId(null);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>, aspectRatio: number) => {
    if (e.button !== 0 || !containerRef.current) return;
    e.preventDefault();

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

    // Resize handle first — it sits inside the selected hotspot's
    // bounds, so checking it before the hit test prevents the click
    // from being interpreted as "start moving".
    const selected = visibleHotspots.find((h) => h.id === selectedId);
    if (selected && isOnResizeHandle(pct.x, pct.y, selected, aspectRatio)) {
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

    const hit = findHitHotspot(pct.x, pct.y, visibleHotspots, aspectRatio);
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

  const onPointerMove = (e: PointerEvent<HTMLDivElement>, aspectRatio: number) => {
    const i = interactionRef.current;
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
      const dx = pct.x - i.moveStart.x;
      const dy = pct.y - i.moveStart.y;
      const target = (draftHotspotsRef.current ?? dataRef.current.hotspots).find(
        (h) => h.id === i.activeId,
      );
      if (!target) return;
      updateDraftHotspot(i.activeId, {
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

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const i = interactionRef.current;
    if (i.mode === "idle") {
      suppressNextCanvasPointerDownRef.current = false;
      return;
    }
    const cancelled = e.type === "pointercancel";

    if (i.mode === "drawing" && !cancelled && i.drawRadius >= MIN_RADIUS) {
      addHotspotRegion({
        centerX: clamp(i.drawCenter.x, 0, 100),
        centerY: clamp(i.drawCenter.y, 0, 100),
        radius: i.drawRadius,
        label: "",
      });
    }

    if (i.mode === "moving" || i.mode === "resizing") {
      if (cancelled) {
        setDraftHotspots(null);
      } else {
        commitDraftHotspots();
      }
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
      <div className="sc-image-hotspot-empty">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          aria-label="Add hotspot image"
          className="sc-image-hotspot-empty__button"
        >
          <span className="sc-image-hotspot-empty__icon">
            <ImagePlaceholder size={iconSm} weight="regular" aria-hidden />
          </span>
          <span>
            <span className="sc-image-hotspot-empty__title">Add hotspot image</span>
            <span className="sc-image-hotspot-empty__description">
              Upload or paste a URL, then draw hotspot regions on top.
            </span>
          </span>
        </button>
        <FilePickerModal
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          kind="media"
          defaultMediaType="image"
          title="Add hotspot image"
          onResolved={(result) => {
            const image = applyImageHotspotPick(result);
            if (image) commitData({ ...dataRef.current, image });
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
          ? "sc-image-hotspot-canvas--authoring"
          : "sc-image-hotspot-canvas--authoring-preview"
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
            onSurfacePointerUp: onPointerUp,
          }
        : {})}
    >
      {({ naturalSize }) => (
        <>
          {!isExpanded &&
            (canEditInline ? (
              <MediaAuthoringActions
                addLabel="Add hotspot region"
                ariaLabel="Image hotspot image tools"
                editAction={
                  <WorkspaceDialog.Trigger asChild>
                    <MediaExpandButton
                      aria-label="Edit hotspots in expanded workspace"
                      glyph="edit"
                      tooltipLabel="Edit hotspots"
                    />
                  </WorkspaceDialog.Trigger>
                }
                hidden={isInteracting}
                onAdd={addKeyboardHotspotRegion}
                onReplace={() => setPickerOpen(true)}
              />
            ) : (
              <WorkspaceDialog.Trigger asChild>
                <MediaExpandButton
                  aria-label="Edit hotspots in expanded workspace"
                  glyph="edit"
                  tooltipLabel="Edit hotspots"
                  hidden={isInteracting}
                />
              </WorkspaceDialog.Trigger>
            ))}
          {naturalSize && (
            <svg
              className="sc-image-hotspot-overlay"
              viewBox={`0 0 ${naturalSize.w} ${naturalSize.h}`}
              preserveAspectRatio="none"
            >
              {visibleHotspots.map((h, idx) => {
                const isSel = h.id === selectedId;
                const cx = (h.centerX / 100) * naturalSize.w;
                const cy = (h.centerY / 100) * naturalSize.h;
                const r = (h.radius / 100) * naturalSize.w;
                // Teal = marked correct; navy = drawn but not yet marked correct.
                const color = assessment.correctHotspotIds.includes(h.id)
                  ? "var(--color-accent)"
                  : "var(--color-primary)";
                return (
                  <g key={h.id}>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill={color}
                      fillOpacity={isSel ? 0.25 : 0.18}
                      stroke={color}
                      strokeWidth={isSel ? naturalSize.w * 0.004 : naturalSize.w * 0.002}
                    />
                    <text
                      x={cx}
                      y={cy}
                      fontSize={naturalSize.w * 0.025}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={color}
                      fontWeight={700}
                      style={{ pointerEvents: "none" }}
                    >
                      {idx + 1}
                    </text>
                    {isSel && (
                      <circle
                        cx={((h.centerX + h.radius) / 100) * naturalSize.w}
                        cy={cy}
                        r={naturalSize.w * 0.008}
                        fill="#fff"
                        stroke={color}
                        strokeWidth={naturalSize.w * 0.003}
                      />
                    )}
                  </g>
                );
              })}
              {drawingPreview && (
                <circle
                  cx={(drawingPreview.cx / 100) * naturalSize.w}
                  cy={(drawingPreview.cy / 100) * naturalSize.h}
                  r={(drawingPreview.r / 100) * naturalSize.w}
                  fill="var(--color-primary)"
                  fillOpacity={0.18}
                  stroke="var(--color-primary)"
                  strokeWidth={naturalSize.w * 0.0025}
                  strokeDasharray="8 4"
                />
              )}
            </svg>
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
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedId(h.id);
                    if (isExpanded) setDetailsOpenId(null);
                  }}
                  className="sc-image-hotspot-author-marker"
                  style={{
                    left: `${h.centerX}%`,
                    top: `${h.centerY}%`,
                  }}
                >
                  <span className="sc-image-hotspot-author-marker__number" aria-hidden>
                    {idx + 1}
                  </span>
                  <span className="sc-image-hotspot-author-marker__edit" aria-hidden>
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
                    <EditableOverlayPopover.Portal container={popoverPortalContainer}>
                      <CompactHotspotEditorPopover
                        assessment={assessment}
                        editor={editor}
                        hotspot={h}
                        index={idx}
                        problemId={problemId}
                        onPointerDownOutside={onDetailsPointerDownOutside}
                        onPatch={(patch) => patchHotspot(h.id, patch)}
                        onToggleCorrect={() => toggleHotspotCorrect(target, h.id)}
                        onDelete={() => removeHotspot(h.id)}
                        target={target}
                      />
                    </EditableOverlayPopover.Portal>
                  )}
                </EditableOverlayPopover.Root>
              );
            })}
        </>
      )}
    </ImageHotspotCanvasSurface>
  );

  const expandedInspector = (
    <MediaWorkspace.Sidebar aria-label="Selected hotspot details">
      <MediaWorkspace.SidebarHeader
        title="Hotspots"
        description="Select a region or row to edit its details."
        count={visibleHotspots.length}
        countLabel={`${visibleHotspots.length} total hotspots`}
      />
      {visibleHotspots.length > 0 ? (
        <MediaWorkspace.List ref={hotspotListRef} aria-label="Hotspots">
          {visibleHotspots.map((hotspot, index) => {
            const selected = hotspot.id === selectedHotspot?.id;
            const summary = hotspot.label.trim() || "Untitled hotspot";

            return (
              <MediaWorkspace.Item
                key={hotspot.id}
                selected={selected}
                data-workspace-hotspot-id={hotspot.id}
              >
                <MediaWorkspace.ItemHeader>
                  <MediaWorkspace.ItemSelect
                    aria-label={`Select hotspot ${index + 1}: ${summary}`}
                    aria-pressed={selected}
                    onClick={() => {
                      setSelectedId(hotspot.id);
                      setDetailsOpenId(null);
                    }}
                  >
                    <MediaWorkspace.ItemNumber aria-hidden>{index + 1}</MediaWorkspace.ItemNumber>
                    <span className="sc-image-hotspot-workspace__row-summary">{summary}</span>
                  </MediaWorkspace.ItemSelect>
                </MediaWorkspace.ItemHeader>
                {selected && (
                  <div className="sc-image-hotspot-workspace__row-editor">
                    <HotspotEditorContent
                      hotspot={hotspot}
                      assessment={assessment}
                      bubbleMenuAppendTo={() =>
                        popoverPortalContainer instanceof HTMLElement
                          ? popoverPortalContainer
                          : null
                      }
                      editor={editor}
                      index={index}
                      problemId={problemId}
                      showHeader
                      onPatch={(patch) => patchHotspot(hotspot.id, patch)}
                      onToggleCorrect={() => toggleHotspotCorrect(target, hotspot.id)}
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
        <MediaWorkspace.Empty>
          <strong>No hotspots yet</strong>
          <span>Draw a region on the image or add one from the toolbar.</span>
        </MediaWorkspace.Empty>
      )}
    </MediaWorkspace.Sidebar>
  );

  const filePickerModal = (
    <FilePickerModal
      open={pickerOpen}
      onOpenChange={setPickerOpen}
      kind="media"
      defaultMediaType="image"
      title="Replace hotspot image"
      onResolved={(result) => {
        const image = applyImageHotspotPick(result);
        if (image) commitData({ ...dataRef.current, image });
      }}
    />
  );

  if (isExpanded) {
    return (
      <>
        <MediaWorkspace.Root>
          <MediaWorkspace.Canvas
            ref={fitStageRef}
            aria-label="Image hotspot workspace canvas"
            className="sc-image-hotspot-workspace__canvas"
          >
            {canvasSurface}
          </MediaWorkspace.Canvas>
          {expandedInspector}
        </MediaWorkspace.Root>
        {filePickerModal}
      </>
    );
  }

  return (
    <div className="sc-image-hotspot-shell">
      <WorkspaceDialog.Root
        open={workspaceOpen}
        onOpenChange={(open) => {
          setWorkspaceOpen(open);
          if (!open) setWorkspaceSelectionRequestId(null);
        }}
      >
        <div ref={fitStageRef} className="sc-image-hotspot-fit-stage">
          {canvasSurface}
        </div>
        <WorkspaceDialog.Content ref={setWorkspaceElement} size="large" contentEditable={false}>
          <WorkspaceDialog.Header>
            <div>
              <WorkspaceDialog.Title>Edit image hotspots</WorkspaceDialog.Title>
              <WorkspaceDialog.Description>
                {visibleHotspots.length} region{visibleHotspots.length === 1 ? "" : "s"} · Draw and
                manage hotspot regions on the image.
              </WorkspaceDialog.Description>
            </div>
            <WorkspaceDialog.Close aria-label="Close expanded hotspot workspace" />
          </WorkspaceDialog.Header>
          <WorkspaceDialog.Toolbar aria-label="Image hotspot tools" contentEditable={false}>
            <WorkspaceDialog.ToolbarGroup aria-label="Image actions">
              <WorkspaceDialog.ToolbarButton
                label="Replace hotspot image"
                onClick={() => setPickerOpen(true)}
              >
                <ArrowsClockwise size={iconMd} aria-hidden />
              </WorkspaceDialog.ToolbarButton>
              <WorkspaceDialog.ToolbarButton
                label="Add hotspot region"
                onClick={() => setWorkspaceSelectionRequestId(addKeyboardHotspotRegion())}
              >
                <Plus size={iconMd} aria-hidden />
              </WorkspaceDialog.ToolbarButton>
            </WorkspaceDialog.ToolbarGroup>
          </WorkspaceDialog.Toolbar>
          <AuthorCanvas
            blockDefinitions={blockDefinitions}
            assessment={assessment}
            data={data}
            editor={editor}
            getCanvasPos={getCanvasPos}
            blockId={blockId}
            problemId={problemId}
            popoverPortalContainer={workspaceElement}
            presentation="expanded"
            selectedHotspotRequestId={workspaceSelectionRequestId}
            target={target}
          />
        </WorkspaceDialog.Content>
      </WorkspaceDialog.Root>

      {filePickerModal}
    </div>
  );
}

function isImageHotspotBoundedFillActive(
  editor: NodeViewProps["editor"],
  getCanvasPos: () => number | null,
  blockDefinitions: BlockDefinitionLookup,
): boolean {
  const canvasPos = getCanvasPos();
  if (canvasPos === null) return false;
  const parent = resolveAssessmentAttrParent(editor, canvasPos, ["image_hotspot"]);
  if (!parent) return false;
  return (
    resolveActiveBoundedPlacement({
      blockDefinitions,
      capability: "fill",
      doc: editor.state.doc,
      pos: parent.pos,
    }) === "fill"
  );
}

function CompactHotspotEditorPopover({
  assessment,
  editor,
  hotspot,
  index,
  problemId,
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
  problemId: string | null;
  onDelete: () => void;
  onPatch: (patch: HotspotPatch) => void;
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
          problemId={problemId}
          onDelete={onDelete}
          onPatch={onPatch}
          onToggleCorrect={onToggleCorrect}
          target={target}
        />
        <EditableOverlayPopover.Arrow fill="var(--color-background)" />
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
  problemId,
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
  problemId: string | null;
  showHeader?: boolean;
  onPatch: (patch: HotspotPatch) => void;
  onToggleCorrect: () => void;
  onDelete: () => void;
  target: AuthoringNodeTarget | null;
}) {
  const isCorrect = assessment.correctHotspotIds.includes(hotspot.id);
  const feedback = assessment.feedbackByHotspotId[hotspot.id] ?? null;
  const editorFieldId = useId();
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

  return (
    <div className="sc-image-hotspot-editor">
      {showHeader && (
        <div className="sc-image-hotspot-editor__header">
          <span className="sc-image-hotspot-editor__title">Hotspot {index + 1}</span>
          <HotspotDeleteButton index={index} onDelete={onDelete} />
        </div>
      )}

      <div className="sc-image-hotspot-editor__field">
        <label className="sc-image-hotspot-editor__label">Label</label>
        <input
          type="text"
          value={hotspot.label}
          onChange={(e) => onPatch({ label: e.target.value })}
          placeholder="Short label for this region"
          className="sc-image-hotspot-editor__input"
        />
      </div>

      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          onToggleCorrect();
        }}
        aria-pressed={isCorrect}
        data-no-select
        className={cn(
          // Marked-correct uses the soft pattern: success-bg tint +
          // 1.5px accent border + ink text + teal check — same vocab as
          // marked-correct choice rows. The brand colour stays a
          // signal, not a bath.
          "sc-image-hotspot-editor__correct-toggle",
          isCorrect
            ? "sc-image-hotspot-editor__correct-toggle--correct"
            : "sc-image-hotspot-editor__correct-toggle--neutral",
        )}
      >
        <CheckCircle
          size={iconSm}
          weight={isCorrect ? "fill" : "regular"}
          className={isCorrect ? "sc-image-hotspot-editor__correct-icon" : undefined}
        />
        {isCorrect ? "Marked correct" : "Mark as correct"}
      </button>

      <div className="sc-image-hotspot-editor__field">
        <label id={editorFieldId} className="sc-image-hotspot-editor__label">
          Feedback
        </label>
        <RichTextArea
          placeholder="Enter feedback for this region"
          ariaLabel={`Hotspot ${index + 1} feedback`}
          ariaLabelledBy={editorFieldId}
          bubbleMenuAppendTo={bubbleMenuAppendTo}
          bubbleMenuPluginKey={bubbleMenuPluginKey}
          extensions={extensions}
          fieldKey={`image_hotspot:${problemId ?? "pending"}:hotspot:${hotspot.id}:feedback`}
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
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.stopPropagation();
        onDelete();
      }}
      aria-label={`Delete hotspot ${index + 1}`}
      data-no-select
      className={cn(CHOICE_TRAILING_BTN, "sc-choice-trailing-button--danger")}
    >
      <Trash size={iconSm} />
    </button>
  );
}

function toggleHotspotCorrect(target: AuthoringNodeTarget | null, hotspotId: string) {
  target?.transact((tr, owner) =>
    toggleImageHotspotCorrectChecked({ tr, target: owner, hotspotId }),
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
