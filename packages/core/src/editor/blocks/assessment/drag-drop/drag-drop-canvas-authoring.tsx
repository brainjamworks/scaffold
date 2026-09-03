import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
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

import { Select, type SelectOption } from "@/ui/components/Select/Select";

import "@/editor/assessment/drag-drop/DragDrop.css";

export const DRAG_DROP_MARKER_PRESETS = ["cross", "pin", "dot", "flag", "check"] as const;

function markerVisualOptions(includeCustom: boolean): readonly SelectOption[] {
  return [
    ...DRAG_DROP_MARKER_PRESETS.map(
      (preset): SelectOption => ({ value: preset, label: preset }),
    ),
    ...(includeCustom ? [{ value: "custom", label: "Custom icon" } as const] : []),
  ];
}

const USE_DEFAULT_MARKER_OPTION: SelectOption = { value: "inherit", label: "Use default" };

interface DragDropAuthoringCanvasProps {
  readonly data: DragDropCanvasData;
  readonly assessment: DragDropPrivateAssessment;
  readonly imageSrc: string | null;
  readonly mediaError?: boolean;
  readonly onRequestBackground: () => void;
  readonly onRetryBackground?: () => void;
  readonly onCreateMarker: (
    draft: Readonly<{ label: string; visualOverride: MarkerVisual | null }>,
    geometry: SpatialPlacementCircle,
  ) => void;
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

type PendingMarker = Readonly<{
  label: string;
  visualOverride: MarkerVisual | null;
  radius: number;
}>;

type PlacementOperation =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "create"; draft: PendingMarker }>
  | Readonly<{ kind: "reposition"; markerId: EmbeddedDataId }>;

export function DragDropAuthoringCanvas({
  assessment,
  customIconSrc = () => null,
  data,
  imageSrc,
  mediaError = false,
  onCreateMarker,
  onDeleteMarker,
  onReorderMarkers,
  onRequestBackground,
  onRequestCustomIcon,
  onRetryBackground,
  onSetCorrectPlacement,
  onSetDefaultMarkerVisual,
  onUpdateMarker,
}: DragDropAuthoringCanvasProps) {
  const surfaceState = useRef<SpatialImageSurfaceState | null>(null);
  const fieldLabelId = useId();
  const [showMarkerForm, setShowMarkerForm] = useState(false);
  const [label, setLabel] = useState("");
  const [visualOverride, setVisualOverride] = useState<MarkerVisual | null>(null);
  const [radius, setRadius] = useState(5);
  const [operation, setOperation] = useState<PlacementOperation>({ kind: "idle" });
  const addMarkerButtonRef = useRef<HTMLButtonElement>(null);
  const restoreAddMarkerFocus = useRef(false);

  useEffect(() => {
    if (!showMarkerForm && restoreAddMarkerFocus.current) {
      restoreAddMarkerFocus.current = false;
      addMarkerButtonRef.current?.focus();
    }
  }, [showMarkerForm]);

  if (data.image === null || data.imageAspectRatio === null || imageSrc === null || mediaError) {
    return (
      <section className="sc-app-drag-drop-setup" aria-label="Drag and Drop setup">
        <strong>
          {mediaError
            ? "The background image is unavailable."
            : "Add a background image before creating markers."}
        </strong>
        <p>
          {mediaError
            ? "Retry the image or choose a replacement before placing correct positions."
            : "Choose an image, then add each named marker and its correct position."}
        </p>
        <div className="sc-app-drag-drop-actions">
          {mediaError && onRetryBackground ? (
            <button type="button" onClick={onRetryBackground}>
              Retry background image
            </button>
          ) : null}
          <button type="button" onClick={onRequestBackground}>
            {data.image === null ? "Choose background image" : "Change background image"}
          </button>
        </div>
      </section>
    );
  }

  const beginMarkerPlacement = () => {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) return;
    setOperation({
      kind: "create",
      draft: { label: trimmedLabel, visualOverride, radius },
    });
  };

  const cancelMarker = () => {
    restoreAddMarkerFocus.current = true;
    setOperation({ kind: "idle" });
    setShowMarkerForm(false);
    setLabel("");
    setVisualOverride(null);
    setRadius(5);
  };

  const placeAtClientPoint = (clientX: number, clientY: number) => {
    const point = surfaceState.current?.pointFromClient({ x: clientX, y: clientY });
    if (!point) return;
    if (operation.kind === "create") {
      onCreateMarker(
        { label: operation.draft.label, visualOverride: operation.draft.visualOverride },
        {
          kind: "circle",
          centerX: point.x,
          centerY: point.y,
          radius: operation.draft.radius,
        },
      );
      cancelMarker();
      return;
    }
    if (operation.kind === "reposition") {
      const current = placementFor(assessment, operation.markerId);
      onSetCorrectPlacement(operation.markerId, {
        ...current.geometry,
        centerX: point.x,
        centerY: point.y,
      });
      setOperation({ kind: "idle" });
    }
  };

  return (
    <section className="sc-app-drag-drop-authoring" aria-label="Drag and Drop authoring">
      <header className="sc-app-drag-drop-authoring__toolbar">
        <span className="sc-app-drag-drop-toolbar__field">
          <span id={`${fieldLabelId}-default-appearance`}>Default marker appearance</span>
          <Select
            aria-labelledby={`${fieldLabelId}-default-appearance`}
            value={
              data.defaultMarkerVisual.kind === "preset"
                ? data.defaultMarkerVisual.preset
                : "custom"
            }
            onChange={(next) => {
              if (next !== "custom") {
                onSetDefaultMarkerVisual({
                  kind: "preset",
                  preset: next as MarkerPresetId,
                });
              }
            }}
            options={markerVisualOptions(data.defaultMarkerVisual.kind === "custom")}
          />
        </span>
        {onRequestCustomIcon ? (
          <button
            type="button"
            className="sc-app-drag-drop-toolbar__action"
            onClick={() => onRequestCustomIcon(onSetDefaultMarkerVisual)}
          >
            Choose custom default icon
          </button>
        ) : null}
        <button
          type="button"
          className="sc-app-drag-drop-toolbar__action"
          onClick={onRequestBackground}
        >
          Change background
        </button>
        <button
          ref={addMarkerButtonRef}
          type="button"
          className="sc-app-drag-drop-toolbar__action"
          data-intent="add"
          onClick={() => setShowMarkerForm(true)}
        >
          Add marker
        </button>
      </header>

      {showMarkerForm ? (
        <div className="sc-app-drag-drop-marker-form">
          <label className="sc-app-drag-drop-marker-form__field">
            Marker label
            <input
              className="sc-app-drag-drop-marker-form__input"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              required
            />
          </label>
          <span className="sc-app-drag-drop-marker-form__field">
            <span id={`${fieldLabelId}-marker-appearance`}>Marker appearance</span>
            <Select
              aria-labelledby={`${fieldLabelId}-marker-appearance`}
              value={
                visualOverride?.kind === "preset"
                  ? visualOverride.preset
                  : visualOverride?.kind === "custom"
                    ? "custom"
                    : "inherit"
              }
              onChange={(next) => {
                if (next === "inherit") setVisualOverride(null);
                else if (next !== "custom")
                  setVisualOverride({ kind: "preset", preset: next as MarkerPresetId });
              }}
              options={[
                USE_DEFAULT_MARKER_OPTION,
                ...markerVisualOptions(visualOverride?.kind === "custom"),
              ]}
            />
          </span>
          {onRequestCustomIcon ? (
            <button
              type="button"
              className="sc-app-drag-drop-marker-form__action"
              onClick={() => onRequestCustomIcon(setVisualOverride)}
            >
              Choose custom icon
            </button>
          ) : null}
          <label className="sc-app-drag-drop-marker-form__field">
            Tolerance radius
            <input
              className="sc-app-drag-drop-marker-form__input"
              aria-label="Tolerance radius"
              type="number"
              min="0.1"
              max="100"
              step="0.5"
              value={radius}
              onChange={(event) => setRadius(Number(event.target.value))}
            />
          </label>
          <button
            type="button"
            className="sc-app-drag-drop-marker-form__action"
            data-intent="add"
            disabled={!label.trim()}
            onClick={beginMarkerPlacement}
          >
            Place marker
          </button>
          <button
            type="button"
            className="sc-app-drag-drop-marker-form__action"
            onClick={cancelMarker}
          >
            Cancel marker
          </button>
        </div>
      ) : null}

      {operation.kind === "create" ? (
        <p role="status">Select the correct position for {operation.draft.label}.</p>
      ) : operation.kind === "reposition" ? (
        <p role="status">
          Select a new correct position for {markerFor(data, operation.markerId).label}.
        </p>
      ) : null}

      <div className="sc-app-drag-drop-authoring__layout">
        <div className="sc-app-drag-drop-stage">
          <SpatialImageSurface
            src={imageSrc}
            alt={data.image.alt ?? ""}
            aspectRatioCssProperty="--sc-drag-drop-aspect-ratio"
            surfaceProps={{
              role: "group",
              tabIndex: operation.kind === "idle" ? -1 : 0,
              "aria-label": "Correct marker placement image",
              onClick: (event) => placeAtClientPoint(event.clientX, event.clientY),
            }}
          >
            {(state) => {
              surfaceState.current = state;
              return assessment.correctPlacements.map((placement) => {
                const marker = markerFor(data, placement.markerId);
                return (
                  <div
                    key={placement.markerId}
                    className="sc-app-drag-drop-correct-placement"
                    style={placementStyle(placement.geometry)}
                    data-marker-id={placement.markerId}
                  >
                    <span className="sc-app-drag-drop-tolerance" aria-hidden />
                    <span className="sc-app-drag-drop-marker">
                      <MarkerVisualView
                        visual={marker.visualOverride ?? data.defaultMarkerVisual}
                        customIconSrc={customIconSrc}
                      />
                    </span>
                  </div>
                );
              });
            }}
          </SpatialImageSurface>
        </div>

        <aside className="sc-app-drag-drop-marker-panel" aria-label="Authored markers">
          <ol>
            {data.markers.map((marker, index) => {
              const placement = placementFor(assessment, marker.id);
              return (
                <li key={marker.id}>
                  <div className="sc-app-drag-drop-marker-panel__header">
                    <span className="sc-app-drag-drop-marker-panel__preview">
                      <MarkerVisualView
                        visual={marker.visualOverride ?? data.defaultMarkerVisual}
                        customIconSrc={customIconSrc}
                      />
                    </span>
                    <span className="sc-app-drag-drop-marker-label">{marker.label}</span>
                  </div>
                  <MarkerDraftFields
                    marker={marker}
                    placement={placement.geometry}
                    onSetCorrectPlacement={onSetCorrectPlacement}
                    onUpdateMarker={onUpdateMarker}
                  />
                  <span className="sc-app-drag-drop-marker-panel__field">
                    <span id={`${fieldLabelId}-appearance-${marker.id}`}>
                      Appearance for {marker.label}
                    </span>
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
                          onRequestCustomIcon?.((visual) =>
                            onUpdateMarker(marker.id, { visualOverride: visual }),
                          );
                        } else {
                          onUpdateMarker(marker.id, {
                            visualOverride: {
                              kind: "preset",
                              preset: next as MarkerPresetId,
                            },
                          });
                        }
                      }}
                      options={[
                        USE_DEFAULT_MARKER_OPTION,
                        ...markerVisualOptions(true),
                      ]}
                    />
                  </span>
                  {onRequestCustomIcon ? (
                    <button
                      type="button"
                      className="sc-app-drag-drop-marker-panel__action"
                      onClick={() =>
                        onRequestCustomIcon((visual) =>
                          onUpdateMarker(marker.id, { visualOverride: visual }),
                        )
                      }
                    >
                      Choose custom icon for {marker.label}
                    </button>
                  ) : null}
                  <div className="sc-app-drag-drop-marker-panel__actions">
                    <button
                      type="button"
                      className="sc-app-drag-drop-marker-panel__action"
                      onClick={() => setOperation({ kind: "reposition", markerId: marker.id })}
                    >
                      Reposition {marker.label}
                    </button>
                    <button
                      type="button"
                      className="sc-app-drag-drop-marker-panel__action"
                      disabled={index === 0}
                      onClick={() => onReorderMarkers(move(data.markers, index, index - 1))}
                    >
                      Move {marker.label} up
                    </button>
                    <button
                      type="button"
                      className="sc-app-drag-drop-marker-panel__action"
                      disabled={index === data.markers.length - 1}
                      onClick={() => onReorderMarkers(move(data.markers, index, index + 1))}
                    >
                      Move {marker.label} down
                    </button>
                    <button
                      type="button"
                      className="sc-app-drag-drop-marker-panel__action"
                      onClick={() => onDeleteMarker(marker.id)}
                    >
                      Delete {marker.label}
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        </aside>
      </div>
    </section>
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

function MarkerDraftFields({
  marker,
  onSetCorrectPlacement,
  onUpdateMarker,
  placement,
}: {
  marker: DragDropMarker;
  placement: SpatialPlacementCircle;
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
    if (!Number.isFinite(next) || next <= 0) {
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
    <>
      <input
        className="sc-app-drag-drop-marker-panel__input"
        aria-label={`Label for ${marker.label}`}
        value={labelDraft}
        onBlur={commitLabel}
        onChange={(event) => setLabelDraft(event.target.value)}
        onKeyDown={(event) => handleKey(event, commitLabel, () => setLabelDraft(marker.label))}
      />
      <input
        className="sc-app-drag-drop-marker-panel__input"
        aria-label={`Tolerance radius for ${marker.label}`}
        type="number"
        min="0.1"
        max="100"
        step="0.5"
        value={radiusDraft}
        onBlur={commitRadius}
        onChange={(event) => setRadiusDraft(event.target.value)}
        onKeyDown={(event) =>
          handleKey(event, commitRadius, () => setRadiusDraft(String(placement.radius)))
        }
      />
    </>
  );
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

function markerFor(data: DragDropCanvasData, markerId: EmbeddedDataId) {
  const marker = data.markers.find(({ id }) => id === markerId);
  if (!marker) throw new Error(`Correct placement references missing marker "${markerId}".`);
  return marker;
}

function placementFor(assessment: DragDropPrivateAssessment, markerId: EmbeddedDataId) {
  const placement = assessment.correctPlacements.find(
    (candidate) => candidate.markerId === markerId,
  );
  if (!placement) throw new Error(`Marker "${markerId}" is missing its correct placement.`);
  return placement;
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
