import type { EmbeddedDataId, EmbeddedNodeId } from "@scaffold/contracts";

import type { PresentationTimelineProjection } from "./presentation-timeline-projection";

export interface PresentationTimelineViewportGeometry {
  readonly durationMs: number;
  readonly viewportWidthPx: number;
}

export interface PresentationTimelineZoomBounds {
  readonly minPixelsPerSecond: number;
  readonly maxPixelsPerSecond: number;
}

export interface PresentationTimelineViewport {
  readonly pixelsPerSecond: number;
  readonly viewportLeftPx: number;
}

export interface ZoomPresentationTimelineAtPointerInput extends PresentationTimelineViewportGeometry {
  readonly currentPixelsPerSecond: number;
  readonly currentViewportLeftPx: number;
  readonly requestedPixelsPerSecond: number;
  readonly pointerX: number;
}

export type PresentationTimelineEditDraft =
  | {
      readonly kind: "move-action";
      readonly actionId: EmbeddedDataId;
      readonly atMs: number;
    }
  | {
      readonly kind: "resize-action";
      readonly actionId: EmbeddedDataId;
      readonly atMs: number;
      readonly durationMs: number;
    };

export interface PresentationTimelineControllerSnapshot {
  readonly selectedTargetId: EmbeddedNodeId | null;
  readonly selectedActionId: EmbeddedDataId | null;
  readonly playheadDraftMs: number;
  readonly zoomMode: "fit" | "manual";
  readonly pixelsPerSecond: number;
  readonly viewportLeftPx: number;
  readonly editDraft: PresentationTimelineEditDraft | null;
}

export interface CreatePresentationTimelineControllerInput {
  readonly initialProjection: PresentationTimelineProjection;
  readonly initialSelectedTargetId?: EmbeddedNodeId | null;
  readonly initialViewport: PresentationTimelineViewportGeometry;
  readonly zoomBounds: PresentationTimelineZoomBounds;
}

export type PresentationTimelineSelectionOutcome =
  | {
      readonly kind: "target-selected";
      readonly targetId: EmbeddedNodeId;
    }
  | {
      readonly kind: "action-selected";
      readonly actionId: EmbeddedDataId;
      readonly targetId: EmbeddedNodeId;
    }
  | {
      readonly kind: "target-not-found";
      readonly surfaceId: EmbeddedNodeId;
      readonly requestedTargetId: EmbeddedNodeId;
    }
  | {
      readonly kind: "action-not-found";
      readonly surfaceId: EmbeddedNodeId;
      readonly requestedActionId: EmbeddedDataId;
      readonly requestedTargetId: EmbeddedNodeId;
    }
  | {
      readonly kind: "action-target-mismatch";
      readonly surfaceId: EmbeddedNodeId;
      readonly requestedActionId: EmbeddedDataId;
      readonly requestedTargetId: EmbeddedNodeId;
      readonly actualTargetId: EmbeddedNodeId;
    };

export class PresentationTimelineController {
  readonly #listeners = new Set<() => void>();
  readonly #zoomBounds: PresentationTimelineZoomBounds;
  #projection: PresentationTimelineProjection;
  #viewportGeometry: PresentationTimelineViewportGeometry;
  #snapshot: PresentationTimelineControllerSnapshot;
  #destroyed = false;

  constructor({
    initialProjection,
    initialSelectedTargetId,
    initialViewport,
    zoomBounds,
  }: CreatePresentationTimelineControllerInput) {
    assertZoomBounds(zoomBounds);
    this.#zoomBounds = Object.freeze({ ...zoomBounds });
    this.#projection = initialProjection;
    this.#viewportGeometry = Object.freeze({ ...initialViewport });
    const viewport = fitPresentationTimelineViewport(initialViewport, zoomBounds);
    const selectedTargetId = initialSelectedTargetId ?? initialProjection.surfaceId;
    this.#snapshot = freezeSnapshot({
      selectedTargetId: projectionHasTarget(initialProjection, selectedTargetId)
        ? selectedTargetId
        : null,
      selectedActionId: null,
      playheadDraftMs: 0,
      zoomMode: "fit",
      pixelsPerSecond: viewport.pixelsPerSecond,
      viewportLeftPx: viewport.viewportLeftPx,
      editDraft: null,
    });
  }

  readonly getSnapshot = (): PresentationTimelineControllerSnapshot => this.#snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.#destroyed) return () => undefined;
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  isTargetExpanded(targetId: EmbeddedNodeId): boolean {
    return this.#snapshot.selectedTargetId === targetId;
  }

  selectTarget(targetId: EmbeddedNodeId): PresentationTimelineSelectionOutcome {
    if (!projectionHasTarget(this.#projection, targetId)) {
      return Object.freeze({
        kind: "target-not-found",
        surfaceId: this.#projection.surfaceId,
        requestedTargetId: targetId,
      });
    }
    this.#replaceSnapshot({
      selectedTargetId: targetId,
      selectedActionId: null,
      editDraft: null,
    });
    return Object.freeze({ kind: "target-selected", targetId });
  }

  selectAction(
    actionId: EmbeddedDataId,
    targetId: EmbeddedNodeId,
  ): PresentationTimelineSelectionOutcome {
    if (!projectionHasTarget(this.#projection, targetId)) {
      return Object.freeze({
        kind: "target-not-found",
        surfaceId: this.#projection.surfaceId,
        requestedTargetId: targetId,
      });
    }
    const actualTargetId = projectionActionTarget(this.#projection, actionId);
    if (!actualTargetId) {
      return Object.freeze({
        kind: "action-not-found",
        surfaceId: this.#projection.surfaceId,
        requestedActionId: actionId,
        requestedTargetId: targetId,
      });
    }
    if (actualTargetId !== targetId) {
      return Object.freeze({
        kind: "action-target-mismatch",
        surfaceId: this.#projection.surfaceId,
        requestedActionId: actionId,
        requestedTargetId: targetId,
        actualTargetId,
      });
    }
    this.#replaceSnapshot({
      selectedTargetId: targetId,
      selectedActionId: actionId,
      editDraft: this.#snapshot.editDraft?.actionId === actionId ? this.#snapshot.editDraft : null,
    });
    return Object.freeze({ kind: "action-selected", actionId, targetId });
  }

  setSurface(projection: PresentationTimelineProjection): void {
    if (this.#destroyed || projection.surfaceId === this.#projection.surfaceId) return;
    this.#projection = projection;
    this.#viewportGeometry = Object.freeze({
      ...this.#viewportGeometry,
      durationMs: projection.durationMs ?? 0,
    });
    const viewport = fitPresentationTimelineViewport(this.#viewportGeometry, this.#zoomBounds);
    this.#replaceSnapshot({
      selectedTargetId: projectionHasTarget(projection, projection.surfaceId)
        ? projection.surfaceId
        : null,
      selectedActionId: null,
      playheadDraftMs: 0,
      zoomMode: "fit",
      pixelsPerSecond: viewport.pixelsPerSecond,
      viewportLeftPx: 0,
      editDraft: null,
    });
  }

  reconcileContent(projection: PresentationTimelineProjection): void {
    if (this.#destroyed) return;
    if (projection.surfaceId !== this.#projection.surfaceId) {
      throw new Error(
        `Presentation Timeline cannot reconcile Surface "${projection.surfaceId}" while owning "${this.#projection.surfaceId}".`,
      );
    }
    this.#projection = projection;
    this.#viewportGeometry = Object.freeze({
      ...this.#viewportGeometry,
      durationMs: projection.durationMs ?? 0,
    });
    const selectedTargetId = this.#snapshot.selectedTargetId;
    const targetSurvives =
      selectedTargetId !== null && projectionHasTarget(projection, selectedTargetId);
    const selectedActionId = this.#snapshot.selectedActionId;
    const actionSurvives =
      targetSurvives &&
      selectedActionId !== null &&
      projectionActionTarget(projection, selectedActionId) === selectedTargetId;
    const viewport =
      this.#snapshot.zoomMode === "fit"
        ? fitPresentationTimelineViewport(this.#viewportGeometry, this.#zoomBounds)
        : {
            pixelsPerSecond: this.#snapshot.pixelsPerSecond,
            viewportLeftPx: clampViewportLeft(
              this.#snapshot.viewportLeftPx,
              this.#viewportGeometry,
              this.#snapshot.pixelsPerSecond,
            ),
          };
    this.#replaceSnapshot({
      selectedTargetId: targetSurvives ? selectedTargetId : null,
      selectedActionId: actionSurvives ? selectedActionId : null,
      playheadDraftMs: clamp(this.#snapshot.playheadDraftMs, 0, this.#viewportGeometry.durationMs),
      pixelsPerSecond: viewport.pixelsPerSecond,
      viewportLeftPx: viewport.viewportLeftPx,
      editDraft: actionSurvives ? this.#snapshot.editDraft : null,
    });
  }

  clearActionSelection(): void {
    this.#replaceSnapshot({ selectedActionId: null, editDraft: null });
  }

  setPlayheadDraft(playheadMs: number, durationMs: number): void {
    assertDurationMs(durationMs);
    assertNonNegativeFinite(playheadMs, "Presentation Timeline playhead");
    this.#replaceSnapshot({ playheadDraftMs: clamp(playheadMs, 0, durationMs) });
  }

  fit(geometry: PresentationTimelineViewportGeometry): void {
    this.#viewportGeometry = Object.freeze({ ...geometry });
    const viewport = fitPresentationTimelineViewport(geometry, this.#zoomBounds);
    this.#replaceSnapshot({
      zoomMode: "fit",
      pixelsPerSecond: viewport.pixelsPerSecond,
      viewportLeftPx: viewport.viewportLeftPx,
    });
  }

  zoomAtPointer(
    input: Omit<
      ZoomPresentationTimelineAtPointerInput,
      "currentPixelsPerSecond" | "currentViewportLeftPx"
    >,
  ): void {
    this.#viewportGeometry = Object.freeze({
      durationMs: input.durationMs,
      viewportWidthPx: input.viewportWidthPx,
    });
    const viewport = zoomPresentationTimelineViewportAtPointer(
      {
        ...input,
        currentPixelsPerSecond: this.#snapshot.pixelsPerSecond,
        currentViewportLeftPx: this.#snapshot.viewportLeftPx,
      },
      this.#zoomBounds,
    );
    this.#replaceSnapshot({
      zoomMode: "manual",
      pixelsPerSecond: viewport.pixelsPerSecond,
      viewportLeftPx: viewport.viewportLeftPx,
    });
  }

  setViewportLeft(leftPx: number, geometry: PresentationTimelineViewportGeometry): void {
    assertViewportGeometry(geometry);
    assertNonNegativeFinite(leftPx, "Presentation Timeline viewport offset");
    this.#viewportGeometry = Object.freeze({ ...geometry });
    this.#replaceSnapshot({
      viewportLeftPx: clampViewportLeft(leftPx, geometry, this.#snapshot.pixelsPerSecond),
    });
  }

  setEditDraft(draft: PresentationTimelineEditDraft): void {
    if (this.#snapshot.selectedActionId !== draft.actionId) {
      throw new Error(
        `Presentation Timeline edit draft action "${draft.actionId}" is not selected.`,
      );
    }
    assertNonNegativeFinite(draft.atMs, "Presentation Timeline edit draft time");
    if (draft.kind === "resize-action") {
      assertNonNegativeFinite(draft.durationMs, "Presentation Timeline edit draft duration");
    }
    this.#replaceSnapshot({ editDraft: Object.freeze({ ...draft }) });
  }

  clearEditDraft(): void {
    this.#replaceSnapshot({ editDraft: null });
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#listeners.clear();
  }

  #replaceSnapshot(patch: Partial<PresentationTimelineControllerSnapshot>): void {
    const next = { ...this.#snapshot, ...patch };
    if (
      next.selectedTargetId === this.#snapshot.selectedTargetId &&
      next.selectedActionId === this.#snapshot.selectedActionId &&
      next.playheadDraftMs === this.#snapshot.playheadDraftMs &&
      next.zoomMode === this.#snapshot.zoomMode &&
      next.pixelsPerSecond === this.#snapshot.pixelsPerSecond &&
      next.viewportLeftPx === this.#snapshot.viewportLeftPx &&
      next.editDraft === this.#snapshot.editDraft
    ) {
      return;
    }
    this.#snapshot = freezeSnapshot(next);
    for (const listener of this.#listeners) listener();
  }
}

function projectionHasTarget(
  projection: PresentationTimelineProjection,
  targetId: EmbeddedNodeId,
): boolean {
  return projection.rows.some((row) => row.targetId === targetId);
}

function projectionActionTarget(
  projection: PresentationTimelineProjection,
  actionId: EmbeddedDataId,
): EmbeddedNodeId | null {
  let targetId: EmbeddedNodeId | null = null;
  for (const row of projection.rows) {
    if (!row.actions.some((action) => action.id === actionId)) continue;
    if (targetId !== null) {
      throw new Error(`Presentation Timeline action identity "${actionId}" is duplicated.`);
    }
    targetId = row.targetId;
  }
  return targetId;
}

export function fitPresentationTimelineViewport(
  geometry: PresentationTimelineViewportGeometry,
  bounds: PresentationTimelineZoomBounds,
): PresentationTimelineViewport {
  assertViewportGeometry(geometry);
  assertZoomBounds(bounds);
  const calculatedPixelsPerSecond =
    geometry.durationMs === 0
      ? bounds.minPixelsPerSecond
      : (geometry.viewportWidthPx * 1_000) / geometry.durationMs;
  return Object.freeze({
    pixelsPerSecond: clamp(
      calculatedPixelsPerSecond,
      bounds.minPixelsPerSecond,
      bounds.maxPixelsPerSecond,
    ),
    viewportLeftPx: 0,
  });
}

export function zoomPresentationTimelineViewportAtPointer(
  input: ZoomPresentationTimelineAtPointerInput,
  bounds: PresentationTimelineZoomBounds,
): PresentationTimelineViewport {
  assertViewportGeometry(input);
  assertZoomBounds(bounds);
  assertPositiveFinite(
    input.currentPixelsPerSecond,
    "Presentation Timeline current pixels per second",
  );
  assertPositiveFinite(
    input.requestedPixelsPerSecond,
    "Presentation Timeline requested pixels per second",
  );
  assertNonNegativeFinite(
    input.currentViewportLeftPx,
    "Presentation Timeline current viewport offset",
  );
  if (!Number.isFinite(input.pointerX)) {
    throw new Error("Presentation Timeline pointer position must be finite.");
  }

  const pixelsPerSecond = clamp(
    input.requestedPixelsPerSecond,
    bounds.minPixelsPerSecond,
    bounds.maxPixelsPerSecond,
  );
  const pointerX = clamp(input.pointerX, 0, input.viewportWidthPx);
  const pointedTimeSeconds =
    (input.currentViewportLeftPx + pointerX) / input.currentPixelsPerSecond;
  const requestedLeftPx = pointedTimeSeconds * pixelsPerSecond - pointerX;

  return Object.freeze({
    pixelsPerSecond,
    viewportLeftPx: clampViewportLeft(requestedLeftPx, input, pixelsPerSecond),
  });
}

function clampViewportLeft(
  leftPx: number,
  geometry: PresentationTimelineViewportGeometry,
  pixelsPerSecond: number,
): number {
  const contentWidthPx = (geometry.durationMs / 1_000) * pixelsPerSecond;
  return clamp(leftPx, 0, Math.max(0, contentWidthPx - geometry.viewportWidthPx));
}

function freezeSnapshot(
  snapshot: PresentationTimelineControllerSnapshot,
): PresentationTimelineControllerSnapshot {
  return Object.freeze(snapshot);
}

function assertViewportGeometry(geometry: PresentationTimelineViewportGeometry): void {
  assertDurationMs(geometry.durationMs);
  assertPositiveFinite(geometry.viewportWidthPx, "Presentation Timeline viewport width");
}

function assertDurationMs(durationMs: number): void {
  if (!Number.isSafeInteger(durationMs) || durationMs < 0) {
    throw new Error("Presentation Timeline duration must be a non-negative safe integer.");
  }
}

function assertZoomBounds(bounds: PresentationTimelineZoomBounds): void {
  assertPositiveFinite(bounds.minPixelsPerSecond, "Presentation Timeline minimum zoom");
  assertPositiveFinite(bounds.maxPixelsPerSecond, "Presentation Timeline maximum zoom");
  if (bounds.minPixelsPerSecond > bounds.maxPixelsPerSecond) {
    throw new Error("Presentation Timeline zoom bounds are reversed.");
  }
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`${label} must be positive and finite.`);
}

function assertNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be non-negative and finite.`);
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
