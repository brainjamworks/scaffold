import {
  ArrowsClockwiseIcon as ArrowsClockwise,
  CrosshairIcon as Crosshair,
  ImageIcon as ImagePlaceholder,
  PencilSimpleIcon as PencilSimple,
  PlusIcon as Plus,
  TrashIcon as Trash,
} from "@phosphor-icons/react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  type DragDropCanvasData,
  type DragDropMarker,
  type DragDropPrivateAssessment,
  type EmbeddedDataId,
  type MarkerPresetId,
  type MarkerVisual,
  type SpatialPlacementCircle,
} from "@scaffold/contracts";

import {
  SpatialImageSurface,
  normalizedPointToOverlayStyle,
  type SpatialImageSurfaceState,
} from "@/editor/assessment/shared/spatial";
import { MediaWorkspace } from "@/editor/media/presentation/MediaWorkspace";
import { MediaEmptyAction } from "@/ui/components/app/MediaEmptyAction/MediaEmptyAction";
import { IconButton } from "@/ui/components/IconButton/IconButton";
import { Select, type SelectOption } from "@/ui/components/Select/Select";
import { iconMd, iconSm } from "@/ui/tokens/icon-sizes";

import { DragDropAuthoringWorkspace } from "./DragDropAuthoringWorkspace";

import "@/editor/assessment/drag-drop/DragDrop.css";

export const DRAG_DROP_MARKER_PRESETS = ["cross", "pin", "dot", "flag", "check"] as const;

const PRESET_LABELS: Record<MarkerPresetId, string> = {
  cross: "Cross",
  pin: "Pin",
  dot: "Dot",
  flag: "Flag",
  check: "Check",
};

const DEFAULT_MARKER_RADIUS = 8;
const MIN_MARKER_RADIUS = 1;
const MAX_MARKER_RADIUS = 50;
const DRAG_THRESHOLD_PX = 4;

function markerVisualOptions(includeCustom: boolean): readonly SelectOption[] {
  return [
    ...DRAG_DROP_MARKER_PRESETS.map(
      (preset): SelectOption => ({ value: preset, label: PRESET_LABELS[preset] }),
    ),
    ...(includeCustom ? [{ value: "custom", label: "Custom icon" } as const] : []),
  ];
}

const USE_DEFAULT_MARKER_OPTION: SelectOption = { value: "inherit", label: "Use default" };

export type DragDropAuthoringPresentation = "compact" | "full-slide" | "expanded";

interface DragDropAuthoringCanvasProps {
  readonly data: DragDropCanvasData;
  readonly assessment: DragDropPrivateAssessment;
  readonly imageSrc: string | null;
  readonly mediaError?: boolean;
  readonly presentation?: DragDropAuthoringPresentation;
  /** Bounded containers show a preview + pencil; editing happens in the workspace. */
  readonly canEditInline?: boolean;
  readonly onAnnounce?: ((message: string) => void) | undefined;
  readonly renderLiveRegion?: boolean;
  readonly onRequestBackground: () => void;
  readonly onRetryBackground?: () => void;
  readonly onRequestWorkspace?: (() => void) | undefined;
  readonly onCreateMarker: (
    draft: Readonly<{ label: string; visualOverride: MarkerVisual | null }>,
    geometry: SpatialPlacementCircle,
  ) => EmbeddedDataId | null;
  readonly onUpdateMarker: (
    markerId: EmbeddedDataId,
    patch: Partial<Pick<DragDropMarker, "label" | "visualOverride">>,
  ) => void;
  readonly onReorderMarkers: (markerIds: readonly EmbeddedDataId[]) => void;
  readonly onSetCorrectPlacement: (
    markerId: EmbeddedDataId,
    geometry: SpatialPlacementCircle,
  ) => void;
  readonly onDeleteMarker: (markerId: EmbeddedDataId) => void;
  readonly onSetDefaultMarkerVisual: (visual: MarkerVisual) => void;
  readonly onRequestCustomIcon?: (
    apply: (visual: Extract<MarkerVisual, { kind: "custom" }>) => void,
  ) => void;
  readonly customIconSrc?: (mediaId: string) => string | null;
}

type PointerInteraction =
  | Readonly<{ mode: "idle" }>
  | Readonly<{
      mode: "pressing";
      markerId: EmbeddedDataId | null;
      startClient: Readonly<{ x: number; y: number }>;
      startPoint: Readonly<{ x: number; y: number }>;
    }>
  | Readonly<{ mode: "drawing"; center: Readonly<{ x: number; y: number }> }>
  | Readonly<{ mode: "moving"; markerId: EmbeddedDataId }>
  | Readonly<{ mode: "resizing"; markerId: EmbeddedDataId }>;

/**
 * Canvas-first Drag and Drop authoring, mirroring the image-hotspot
 * architecture: direct manipulation on the image (click to place, drag
 * to move, drag the ring handle to set tolerance), a floating icon
 * toolbar inline, and a MediaWorkspace canvas + inspector sidebar in
 * the expanded presentation. Marker details live in the inspector, on
 * demand — never as an always-visible form wall.
 */
export function DragDropAuthoringCanvas({
  assessment,
  canEditInline = true,
  customIconSrc = () => null,
  data,
  imageSrc,
  mediaError = false,
  onAnnounce,
  onCreateMarker,
  onDeleteMarker,
  onReorderMarkers,
  onRequestBackground,
  onRequestCustomIcon,
  onRequestWorkspace,
  onRetryBackground,
  onSetCorrectPlacement,
  onSetDefaultMarkerVisual,
  onUpdateMarker,
  presentation = "compact",
  renderLiveRegion = true,
}: DragDropAuthoringCanvasProps) {
  const isExpanded = presentation === "expanded";
  const surfaceState = useRef<SpatialImageSurfaceState | null>(null);
  const fitStageRef = useRef<HTMLDivElement>(null);
  const fieldLabelId = useId();
  const [selectedId, setSelectedId] = useState<EmbeddedDataId | null>(null);
  const [armedRepositionId, setArmedRepositionId] = useState<EmbeddedDataId | null>(null);
  const [draftPlacement, setDraftPlacement] = useState<Readonly<{
    markerId: EmbeddedDataId;
    geometry: SpatialPlacementCircle;
  }> | null>(null);
  const [drawPreview, setDrawPreview] = useState<Readonly<{
    center: Readonly<{ x: number; y: number }>;
    radius: number;
  }> | null>(null);
  const [announcementState, setAnnouncementState] = useState("");
  const announce = onAnnounce ?? setAnnouncementState;
  const interaction = useRef<PointerInteraction>({ mode: "idle" });
  const markerListRef = useRef<HTMLOListElement>(null);
  const suppressSurfaceClickRef = useRef(false);

  const editable = isExpanded || canEditInline;
  const isInteracting =
    interaction.current.mode === "moving" ||
    interaction.current.mode === "resizing" ||
    interaction.current.mode === "drawing";

  useEffect(() => {
    if (!isExpanded) return;
    setSelectedId((current) => {
      if (current && data.markers.some((marker) => marker.id === current)) return current;
      return data.markers[0]?.id ?? null;
    });
  }, [data.markers, isExpanded]);

  useEffect(() => {
    if (editable) return;
    setSelectedId(null);
    setArmedRepositionId(null);
    setDraftPlacement(null);
    interaction.current = { mode: "idle" };
  }, [editable]);

  useEffect(() => {
    if (!isExpanded || !selectedId) return;
    const row = markerListRef.current?.querySelector<HTMLElement>(
      `[data-workspace-marker-id="${CSS.escape(selectedId)}"]`,
    );
    row?.scrollIntoView?.({ block: "nearest" });
  }, [isExpanded, selectedId]);

  if (data.image === null || data.imageAspectRatio === null || imageSrc === null || mediaError) {
    return (
      <DragDropEmptyState
        mediaError={mediaError}
        hasImage={data.image !== null}
        onRequestBackground={onRequestBackground}
        onRetryBackground={onRetryBackground}
      />
    );
  }

  const placements = draftPlacement
    ? assessment.correctPlacements.map((placement) =>
        placement.markerId === draftPlacement.markerId
          ? { markerId: placement.markerId, geometry: draftPlacement.geometry }
          : placement,
      )
    : assessment.correctPlacements;

  const placementFor = (markerId: EmbeddedDataId): SpatialPlacementCircle => {
    const placement = placements.find((candidate) => candidate.markerId === markerId);
    if (!placement) throw new Error(`Marker "${markerId}" is missing its correct placement.`);
    return placement.geometry;
  };

  const markerNumber = (markerId: EmbeddedDataId) =>
    data.markers.findIndex((marker) => marker.id === markerId) + 1;

  const markerName = (marker: DragDropMarker, index: number) =>
    marker.label.trim() || `Marker ${index + 1}`;

  const drawRadius = (
    center: Readonly<{ x: number; y: number }>,
    point: Readonly<{ x: number; y: number }>,
  ) => {
    const aspect = surfaceState.current?.aspectRatio ?? 1;
    const dx = point.x - center.x;
    const dy = (point.y - center.y) / (aspect || 1);
    return Math.min(MAX_MARKER_RADIUS, Math.max(MIN_MARKER_RADIUS, Math.hypot(dx, dy)));
  };

  const createMarkerAt = (
    point: Readonly<{ x: number; y: number }>,
    radius: number = DEFAULT_MARKER_RADIUS,
  ) => {
    const label = `Marker ${data.markers.length + 1}`;
    const id = onCreateMarker(
      { label, visualOverride: null },
      {
        kind: "circle",
        centerX: point.x,
        centerY: point.y,
        radius,
      },
    );
    if (id) {
      setSelectedId(id);
      announce(`${label} placed. Drag it to fine-tune, or edit its details.`);
    }
    return id;
  };

  const addMarkerAtCenter = () => {
    const id = createMarkerAt({ x: 50, y: 50 });
    if (id && !editable && onRequestWorkspace) onRequestWorkspace();
    return id;
  };

  const commitDraftPlacement = () => {
    const draft = draftPlacement;
    setDraftPlacement(null);
    if (!draft) return;
    onSetCorrectPlacement(draft.markerId, draft.geometry);
    announce(`Marker ${markerNumber(draft.markerId)} updated.`);
  };

  // ── Pointer interaction: press → (threshold) → move/resize drafts,
  //    commit on release. A press that never crosses the threshold is a
  //    click: select a marker, or place a new/armed one on empty canvas.
  const onSurfacePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    // Stop ProseMirror from moving its selection (and scrolling to it)
    // when the canvas is operated.
    event.preventDefault();
    event.stopPropagation();
    if (!editable) return;
    const point = surfaceState.current?.pointFromClient({ x: event.clientX, y: event.clientY });
    if (!point) return;
    const markerElement = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-authoring-marker-id]",
    );
    const handleElement = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-authoring-resize-handle]",
    );
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is unavailable in some test environments.
    }
    if (handleElement && selectedId) {
      interaction.current = { mode: "resizing", markerId: selectedId };
      setDraftPlacement({ markerId: selectedId, geometry: placementFor(selectedId) });
      return;
    }
    const markerId = (markerElement?.dataset["authoringMarkerId"] ?? null) as EmbeddedDataId | null;
    interaction.current = {
      mode: "pressing",
      markerId,
      startClient: { x: event.clientX, y: event.clientY },
      startPoint: point,
    };
  };

  const onSurfacePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = interaction.current;
    if (current.mode === "idle") return;
    const point = surfaceState.current?.pointFromClient({ x: event.clientX, y: event.clientY });
    if (!point) return;
    if (current.mode === "pressing") {
      const dx = event.clientX - current.startClient.x;
      const dy = event.clientY - current.startClient.y;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      if (!current.markerId) {
        // Empty-canvas drag draws the acceptance zone in one motion.
        interaction.current = { mode: "drawing", center: current.startPoint };
        setDrawPreview({
          center: current.startPoint,
          radius: drawRadius(current.startPoint, point),
        });
        return;
      }
      interaction.current = { mode: "moving", markerId: current.markerId };
      setSelectedId(current.markerId);
      setDraftPlacement({
        markerId: current.markerId,
        geometry: { ...placementFor(current.markerId), centerX: point.x, centerY: point.y },
      });
      return;
    }
    if (current.mode === "drawing") {
      setDrawPreview({ center: current.center, radius: drawRadius(current.center, point) });
      return;
    }
    if (current.mode === "moving") {
      setDraftPlacement((draft) =>
        draft
          ? { markerId: draft.markerId, geometry: { ...draft.geometry, centerX: point.x, centerY: point.y } }
          : draft,
      );
      return;
    }
    setDraftPlacement((draft) => {
      if (!draft) return draft;
      const radius = Math.min(
        MAX_MARKER_RADIUS,
        Math.max(MIN_MARKER_RADIUS, Math.abs(point.x - draft.geometry.centerX)),
      );
      return { markerId: draft.markerId, geometry: { ...draft.geometry, radius } };
    });
  };

  const onSurfacePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = interaction.current;
    interaction.current = { mode: "idle" };
    if (current.mode === "idle") return;
    if (current.mode === "drawing") {
      suppressSurfaceClickRef.current = true;
      const preview = drawPreview;
      setDrawPreview(null);
      if (preview) createMarkerAt(preview.center, preview.radius);
      return;
    }
    if (current.mode === "moving" || current.mode === "resizing") {
      suppressSurfaceClickRef.current = true;
      commitDraftPlacement();
      return;
    }
    // A settled click.
    const point =
      surfaceState.current?.pointFromClient({ x: event.clientX, y: event.clientY }) ??
      current.startPoint;
    if (current.markerId) {
      setSelectedId(current.markerId);
      announce(`Marker ${markerNumber(current.markerId)} selected.`);
      return;
    }
    if (armedRepositionId) {
      const geometry = placementFor(armedRepositionId);
      onSetCorrectPlacement(armedRepositionId, {
        ...geometry,
        centerX: point.x,
        centerY: point.y,
      });
      announce(`Marker ${markerNumber(armedRepositionId)} repositioned.`);
      setArmedRepositionId(null);
      return;
    }
    createMarkerAt(point);
  };

  const canvasSurface = (
    <SpatialImageSurface
      src={imageSrc}
      alt={data.image.alt ?? ""}
      aspectRatioCssProperty="--sc-drag-drop-aspect-ratio"
      fitContainerRef={fitStageRef}
      surfaceProps={{
        role: "group",
        tabIndex: armedRepositionId ? 0 : -1,
        "aria-label": editable
          ? "Correct marker placement image. Click to place a marker; drag markers to move them."
          : "Correct marker placement preview",
        ...(editable
          ? {
              onPointerDown: onSurfacePointerDown,
              onPointerMove: onSurfacePointerMove,
              onPointerUp: onSurfacePointerUp,
              onClick: () => {
                suppressSurfaceClickRef.current = false;
              },
            }
          : {}),
      }}
    >
      {(state) => {
        surfaceState.current = state;
        return (
          <>
            {canvasToolbar}
            {drawPreview ? (
              <div
                className="sc-app-drag-drop-correct-placement"
                data-drawing=""
                style={placementStyle({
                  kind: "circle",
                  centerX: drawPreview.center.x,
                  centerY: drawPreview.center.y,
                  radius: drawPreview.radius,
                })}
              >
                <span className="sc-app-drag-drop-tolerance" aria-hidden />
              </div>
            ) : null}
            {placements.map((placement) => {
          const index = data.markers.findIndex((marker) => marker.id === placement.markerId);
          const marker = data.markers[index];
          if (!marker) return null;
          const selected = editable && marker.id === selectedId;
          return (
            <div
              key={placement.markerId}
              className="sc-app-drag-drop-correct-placement"
              style={placementStyle(placement.geometry)}
              data-marker-id={placement.markerId}
              data-selected={selected ? "" : undefined}
            >
              <span className="sc-app-drag-drop-tolerance" aria-hidden />
              {selected ? (
                <span
                  className="sc-app-drag-drop-resize-handle"
                  data-authoring-resize-handle=""
                  aria-hidden
                  style={{ "--sc-drag-drop-handle-offset": `${placement.geometry.radius}%` } as CSSProperties}
                />
              ) : null}
              <button
                type="button"
                className="sc-app-drag-drop-marker"
                data-authoring-marker-id={placement.markerId}
                aria-label={`Marker ${index + 1}: ${markerName(marker, index)}${selected ? ", selected" : ""}`}
                aria-pressed={selected}
                onClick={(clickEvent) => clickEvent.preventDefault()}
              >
                <MarkerVisualView
                  visual={marker.visualOverride ?? data.defaultMarkerVisual}
                  customIconSrc={customIconSrc}
                />
              </button>
            </div>
          );
            })}
          </>
        );
      }}
    </SpatialImageSurface>
  );

  const stage = (
    <div
      ref={fitStageRef}
      className="sc-app-drag-drop-stage"
      data-drag-drop-authoring-presentation={presentation}
      data-editable={editable ? "" : undefined}
      onMouseDown={(event) => {
        // Non-surface chrome inside the stage must not hand the event to
        // ProseMirror either.
        event.stopPropagation();
      }}
    >
      {canvasSurface}
      {armedRepositionId ? (
        <p className="sc-app-drag-drop-placement-hint" role="status">
          Click the image to reposition marker {markerNumber(armedRepositionId)}. Press Escape to
          cancel.
        </p>
      ) : null}
    </div>
  );

  const canvasToolbar =
    !isExpanded ? (
        <div
          role="toolbar"
          aria-label="Drag and Drop tools"
          className="sc-app-drag-drop-canvas-toolbar"
          hidden={isInteracting}
        >
          {editable ? (
            <>
              <DragDropAuthoringWorkspace.InlineAction
                label="Replace background image"
                intent="replace"
                onClick={onRequestBackground}
              >
                <ArrowsClockwise size={iconMd} aria-hidden />
              </DragDropAuthoringWorkspace.InlineAction>
              <DragDropAuthoringWorkspace.InlineAction
                data-drag-drop-add-marker=""
                label="Add marker"
                intent="add"
                onClick={addMarkerAtCenter}
              >
                <Plus size={iconMd} aria-hidden />
              </DragDropAuthoringWorkspace.InlineAction>
            </>
          ) : null}
          <DragDropAuthoringWorkspace.InlineAction
            label="Edit markers in expanded workspace"
            intent="edit"
            onClick={onRequestWorkspace}
          >
            <PencilSimple size={iconMd} aria-hidden />
          </DragDropAuthoringWorkspace.InlineAction>
        </div>
    ) : null;

  const liveRegion = renderLiveRegion ? (
    <span className="sc-sr-only" aria-live="polite" aria-atomic="true">
      {announcementState}
    </span>
  ) : null;

  if (!isExpanded) {
    return (
      <section
        className="sc-app-drag-drop-shell"
        aria-label="Drag and Drop authoring"
        onKeyDown={(event: KeyboardEvent) => {
          if (event.key === "Escape" && armedRepositionId) {
            event.stopPropagation();
            setArmedRepositionId(null);
            announce("Reposition cancelled.");
          }
        }}
      >
        {stage}
        {liveRegion}
      </section>
    );
  }

  const selectedIndex = data.markers.findIndex((marker) => marker.id === selectedId);

  return (
    <>
      <MediaWorkspace.Canvas
        aria-label="Drag and Drop workspace canvas"
        className="sc-app-drag-drop-workspace__canvas"
        onKeyDown={(event: KeyboardEvent) => {
          if (event.key === "Escape" && armedRepositionId) {
            event.stopPropagation();
            setArmedRepositionId(null);
            announce("Reposition cancelled.");
          }
        }}
      >
        {stage}
      </MediaWorkspace.Canvas>
      <MediaWorkspace.Sidebar
        aria-label="Marker details"
        className="sc-app-drag-drop-workspace__sidebar"
      >
        <MediaWorkspace.SidebarHeader
          title="Markers"
          description="Click the image to place a marker. Select a row to edit its details."
          count={data.markers.length}
          countLabel={`${data.markers.length} total markers`}
        />
        <div className="sc-app-drag-drop-workspace__defaults">
          <span className="sc-app-drag-drop-workspace__field">
            <span id={`${fieldLabelId}-default-appearance`}>Default marker appearance</span>
            <Select
              aria-labelledby={`${fieldLabelId}-default-appearance`}
              value={
                data.defaultMarkerVisual.kind === "preset"
                  ? data.defaultMarkerVisual.preset
                  : "custom"
              }
              onChange={(next) => {
                if (next === "custom") {
                  onRequestCustomIcon?.(onSetDefaultMarkerVisual);
                } else {
                  onSetDefaultMarkerVisual({ kind: "preset", preset: next as MarkerPresetId });
                }
              }}
              options={markerVisualOptions(Boolean(onRequestCustomIcon))}
            />
          </span>
        </div>
        {data.markers.length > 0 ? (
          <MediaWorkspace.List
            ref={markerListRef}
            aria-label="Markers"
            className="sc-app-drag-drop-workspace__list"
          >
            {data.markers.map((marker, index) => {
              const selected = marker.id === selectedId;
              const summary = markerName(marker, index);
              return (
                <MediaWorkspace.Item
                  key={marker.id}
                  selected={selected}
                  data-workspace-marker-id={marker.id}
                  className="sc-app-drag-drop-workspace__item"
                >
                  <MediaWorkspace.ItemHeader>
                    <MediaWorkspace.ItemSelect
                      aria-label={`Select marker ${index + 1}: ${summary}`}
                      aria-pressed={selected}
                      onClick={() => setSelectedId(marker.id)}
                    >
                      <MediaWorkspace.ItemNumber aria-hidden>{index + 1}</MediaWorkspace.ItemNumber>
                      <span className="sc-app-drag-drop-workspace__row-preview" aria-hidden>
                        <MarkerVisualView
                          visual={marker.visualOverride ?? data.defaultMarkerVisual}
                          customIconSrc={customIconSrc}
                        />
                      </span>
                      <span className="sc-app-drag-drop-workspace__row-summary">{summary}</span>
                    </MediaWorkspace.ItemSelect>
                  </MediaWorkspace.ItemHeader>
                  {selected ? (
                    <MarkerRowEditor
                      fieldLabelId={fieldLabelId}
                      marker={marker}
                      index={index}
                      markerCount={data.markers.length}
                      placement={placementFor(marker.id)}
                      armedReposition={armedRepositionId === marker.id}
                      customIconSrc={customIconSrc}
                      onArmReposition={() => {
                        setArmedRepositionId((current) =>
                          current === marker.id ? null : marker.id,
                        );
                        announce(
                          armedRepositionId === marker.id
                            ? "Reposition cancelled."
                            : `Click the image to reposition ${summary}.`,
                        );
                      }}
                      onDelete={() => {
                        onDeleteMarker(marker.id);
                        announce(`${summary} deleted.`);
                      }}
                      onMove={(direction) => {
                        const target = index + direction;
                        if (target < 0 || target >= data.markers.length) return;
                        onReorderMarkers(move(data.markers, index, target));
                        announce(`${summary} moved ${direction === -1 ? "up" : "down"}.`);
                      }}
                      onRequestCustomIcon={
                        onRequestCustomIcon
                          ? () =>
                              onRequestCustomIcon((visual) =>
                                onUpdateMarker(marker.id, { visualOverride: visual }),
                              )
                          : undefined
                      }
                      onSetCorrectPlacement={onSetCorrectPlacement}
                      onUpdateMarker={onUpdateMarker}
                    />
                  ) : null}
                </MediaWorkspace.Item>
              );
            })}
          </MediaWorkspace.List>
        ) : (
          <MediaWorkspace.Empty className="sc-app-drag-drop-workspace__empty">
            <strong>No markers yet</strong>
            <span>Click anywhere on the image to place the first marker.</span>
            <MediaEmptyAction
              aria-label="Add first marker"
              icon={<Plus size={iconSm} aria-hidden />}
              label="Add first marker"
              onClick={addMarkerAtCenter}
            />
          </MediaWorkspace.Empty>
        )}
        <p className="sc-app-drag-drop-workspace__hint">
          {selectedIndex >= 0
            ? "Drag the selected marker to move it. Drag the ring handle to set its tolerance."
            : "The ring around each marker is the area that counts as correct."}
        </p>
      </MediaWorkspace.Sidebar>
      {liveRegion}
    </>
  );
}

function DragDropEmptyState({
  hasImage,
  mediaError,
  onRequestBackground,
  onRetryBackground,
}: {
  hasImage: boolean;
  mediaError: boolean;
  onRequestBackground: () => void;
  onRetryBackground?: (() => void) | undefined;
}) {
  return (
    <div className="sc-app-drag-drop-empty">
      <MediaEmptyAction
        aria-label={hasImage ? "Change background image" : "Add background image"}
        icon={<ImagePlaceholder size={iconSm} weight="regular" aria-hidden />}
        label={
          mediaError
            ? "The background image is unavailable"
            : hasImage
              ? "Change background image"
              : "Add background image"
        }
        onClick={mediaError && onRetryBackground ? onRetryBackground : onRequestBackground}
      />
      <p className="sc-app-drag-drop-empty__description">
        {mediaError
          ? "Retry the image or choose a replacement before placing markers."
          : "Upload an image, then click it to place each marker learners will drag into position."}
      </p>
      {mediaError && onRetryBackground ? (
        <button type="button" className="sc-app-drag-drop-empty__retry" onClick={onRequestBackground}>
          Choose a replacement image
        </button>
      ) : null}
    </div>
  );
}

function MarkerRowEditor({
  armedReposition,
  fieldLabelId,
  index,
  marker,
  markerCount,
  onArmReposition,
  onDelete,
  onMove,
  onRequestCustomIcon,
  onSetCorrectPlacement,
  onUpdateMarker,
  placement,
}: {
  armedReposition: boolean;
  fieldLabelId: string;
  index: number;
  marker: DragDropMarker;
  markerCount: number;
  placement: SpatialPlacementCircle;
  customIconSrc: (mediaId: string) => string | null;
  onArmReposition: () => void;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
  onRequestCustomIcon?: (() => void) | undefined;
  onSetCorrectPlacement: DragDropAuthoringCanvasProps["onSetCorrectPlacement"];
  onUpdateMarker: DragDropAuthoringCanvasProps["onUpdateMarker"];
}) {
  const [labelDraft, setLabelDraft] = useState(marker.label);
  const [radiusDraft, setRadiusDraft] = useState(String(placement.radius));

  useEffect(() => setLabelDraft(marker.label), [marker.label]);
  useEffect(() => setRadiusDraft(String(placement.radius)), [placement.radius]);

  const commitLabel = () => {
    const next = labelDraft.trim();
    if (!next) {
      setLabelDraft(marker.label);
      return;
    }
    setLabelDraft(next);
    if (next !== marker.label) onUpdateMarker(marker.id, { label: next });
  };

  const commitRadius = () => {
    const next = Number(radiusDraft);
    if (!Number.isFinite(next) || next < MIN_MARKER_RADIUS || next > MAX_MARKER_RADIUS) {
      setRadiusDraft(String(placement.radius));
      return;
    }
    setRadiusDraft(String(next));
    if (next !== placement.radius) {
      onSetCorrectPlacement(marker.id, { ...placement, radius: next });
    }
  };

  const handleKey = (
    event: KeyboardEvent<HTMLInputElement>,
    commit: () => void,
    cancel: () => void,
  ) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  };

  return (
    <div className="sc-app-drag-drop-workspace__row-editor">
      <label className="sc-app-drag-drop-workspace__field">
        Label
        <input
          className="sc-app-drag-drop-workspace__input"
          value={labelDraft}
          onBlur={commitLabel}
          onChange={(event) => setLabelDraft(event.target.value)}
          onKeyDown={(event) => handleKey(event, commitLabel, () => setLabelDraft(marker.label))}
        />
      </label>
      <span className="sc-app-drag-drop-workspace__field">
        <span id={`${fieldLabelId}-appearance-${marker.id}`}>Appearance</span>
        <Select
          aria-labelledby={`${fieldLabelId}-appearance-${marker.id}`}
          value={
            marker.visualOverride?.kind === "preset"
              ? marker.visualOverride.preset
              : marker.visualOverride?.kind === "custom"
                ? "custom"
                : "inherit"
          }
          onChange={(next) => {
            if (next === "inherit") {
              onUpdateMarker(marker.id, { visualOverride: null });
            } else if (next === "custom") {
              onRequestCustomIcon?.();
            } else {
              onUpdateMarker(marker.id, {
                visualOverride: { kind: "preset", preset: next as MarkerPresetId },
              });
            }
          }}
          options={[
            USE_DEFAULT_MARKER_OPTION,
            ...markerVisualOptions(Boolean(onRequestCustomIcon)),
          ]}
        />
      </span>
      <label className="sc-app-drag-drop-workspace__field">
        Tolerance (% of image width)
        <input
          className="sc-app-drag-drop-workspace__input"
          type="number"
          min={MIN_MARKER_RADIUS}
          max={MAX_MARKER_RADIUS}
          step="0.5"
          value={radiusDraft}
          onBlur={commitRadius}
          onChange={(event) => setRadiusDraft(event.target.value)}
          onKeyDown={(event) =>
            handleKey(event, commitRadius, () => setRadiusDraft(String(placement.radius)))
          }
        />
      </label>
      <div
        className="sc-app-drag-drop-workspace__row-actions"
        role="group"
        aria-label={`Actions for marker ${index + 1}`}
      >
        <IconButton
          aria-label={`Reposition marker ${index + 1} on the image`}
          aria-pressed={armedReposition}
          title="Reposition on image"
          size="md"
          variant="ghost"
          onClick={onArmReposition}
        >
          <Crosshair size={iconSm} aria-hidden />
        </IconButton>
        <IconButton
          aria-label={`Move marker ${index + 1} earlier`}
          title="Move earlier"
          size="md"
          variant="ghost"
          disabled={index === 0}
          onClick={() => onMove(-1)}
        >
          <span aria-hidden className="sc-app-drag-drop-workspace__order-glyph">
            ↑
          </span>
        </IconButton>
        <IconButton
          aria-label={`Move marker ${index + 1} later`}
          title="Move later"
          size="md"
          variant="ghost"
          disabled={index === markerCount - 1}
          onClick={() => onMove(1)}
        >
          <span aria-hidden className="sc-app-drag-drop-workspace__order-glyph">
            ↓
          </span>
        </IconButton>
        <IconButton
          aria-label={`Delete marker ${index + 1}`}
          title="Delete marker"
          size="md"
          variant="ghost"
          data-intent="delete"
          onClick={onDelete}
        >
          <Trash size={iconSm} aria-hidden />
        </IconButton>
      </div>
    </div>
  );
}

export function MarkerVisualView({
  customIconSrc,
  visual,
}: {
  visual: MarkerVisual;
  customIconSrc: (mediaId: string) => string | null;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  if (visual.kind === "custom") {
    const src = customIconSrc(visual.source.mediaId);
    if (src && !imageFailed) {
      return <img src={src} alt="" aria-hidden onError={() => setImageFailed(true)} />;
    }
    return (
      <span
        role="img"
        aria-label="Custom marker icon unavailable"
        data-testid="custom-marker-fallback"
      >
        ●
      </span>
    );
  }
  return <span aria-hidden>{presetSymbol(visual.preset)}</span>;
}

function presetSymbol(preset: MarkerPresetId): string {
  switch (preset) {
    case "cross":
      return "×";
    case "pin":
      return "⌖";
    case "dot":
      return "●";
    case "flag":
      return "⚑";
    case "check":
      return "✓";
  }
}

function move(markers: readonly DragDropMarker[], from: number, to: number): EmbeddedDataId[] {
  const ids = markers.map(({ id }) => id);
  const [id] = ids.splice(from, 1);
  if (!id) throw new Error("Cannot reorder a missing Drag and Drop marker.");
  ids.splice(to, 0, id);
  return ids;
}

function placementStyle(geometry: SpatialPlacementCircle): CSSProperties {
  return {
    ...normalizedPointToOverlayStyle({ x: geometry.centerX, y: geometry.centerY }),
    "--sc-drag-drop-radius": `${geometry.radius}%`,
  } as CSSProperties;
}
