import type { EmbeddedDataId, EmbeddedNodeId } from "@scaffold/contracts";

import type {
  SemanticNavigationOptions,
  SemanticNavigationResult,
} from "@/document/authoring/semantic-document";

export interface PresentationTimelineSemanticSelection {
  getSnapshot(): { readonly selectedId: EmbeddedNodeId | null };
  subscribe(listener: () => void): () => void;
  select(id: EmbeddedNodeId, options: SemanticNavigationOptions): Promise<SemanticNavigationResult>;
}

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
  readonly semanticSelection: PresentationTimelineSemanticSelection;
  readonly initialViewport: PresentationTimelineViewportGeometry;
  readonly zoomBounds: PresentationTimelineZoomBounds;
}

export class PresentationTimelineController {
  readonly #listeners = new Set<() => void>();
  readonly #semanticSelection: PresentationTimelineSemanticSelection;
  readonly #unsubscribeSemanticSelection: () => void;
  readonly #zoomBounds: PresentationTimelineZoomBounds;
  #selectedActionTargetId: EmbeddedNodeId | null = null;
  #selectionRequestToken = 0;
  #snapshot: PresentationTimelineControllerSnapshot;
  #destroyed = false;

  constructor({
    semanticSelection,
    initialViewport,
    zoomBounds,
  }: CreatePresentationTimelineControllerInput) {
    assertZoomBounds(zoomBounds);
    this.#semanticSelection = semanticSelection;
    this.#zoomBounds = Object.freeze({ ...zoomBounds });
    const viewport = fitPresentationTimelineViewport(initialViewport, zoomBounds);
    this.#snapshot = freezeSnapshot({
      selectedTargetId: semanticSelection.getSnapshot().selectedId,
      selectedActionId: null,
      playheadDraftMs: 0,
      zoomMode: "fit",
      pixelsPerSecond: viewport.pixelsPerSecond,
      viewportLeftPx: viewport.viewportLeftPx,
      editDraft: null,
    });
    this.#unsubscribeSemanticSelection = semanticSelection.subscribe(
      this.#handleSemanticSelectionChange,
    );
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

  selectTarget(targetId: EmbeddedNodeId): Promise<SemanticNavigationResult> {
    this.#selectionRequestToken += 1;
    return this.#selectSemanticTarget(targetId);
  }

  async selectAction(
    actionId: EmbeddedDataId,
    targetId: EmbeddedNodeId,
  ): Promise<SemanticNavigationResult> {
    const token = ++this.#selectionRequestToken;
    const result = await this.#selectSemanticTarget(targetId);
    if (
      token === this.#selectionRequestToken &&
      result.kind === "reached" &&
      result.id === targetId &&
      this.#semanticSelection.getSnapshot().selectedId === targetId
    ) {
      this.#selectedActionTargetId = targetId;
      this.#replaceSnapshot({
        selectedActionId: actionId,
        editDraft:
          this.#snapshot.editDraft?.actionId === actionId ? this.#snapshot.editDraft : null,
      });
    }
    return result;
  }

  clearActionSelection(): void {
    this.#selectedActionTargetId = null;
    this.#replaceSnapshot({ selectedActionId: null, editDraft: null });
  }

  setPlayheadDraft(playheadMs: number, durationMs: number): void {
    assertDurationMs(durationMs);
    assertNonNegativeFinite(playheadMs, "Presentation Timeline playhead");
    this.#replaceSnapshot({ playheadDraftMs: clamp(playheadMs, 0, durationMs) });
  }

  fit(geometry: PresentationTimelineViewportGeometry): void {
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
    this.#selectionRequestToken += 1;
    this.#unsubscribeSemanticSelection();
    this.#listeners.clear();
  }

  readonly #handleSemanticSelectionChange = (): void => {
    if (this.#destroyed) return;
    const selectedTargetId = this.#semanticSelection.getSnapshot().selectedId;
    const keepActionSelection = selectedTargetId === this.#selectedActionTargetId;
    if (!keepActionSelection) this.#selectedActionTargetId = null;
    this.#replaceSnapshot({
      selectedTargetId,
      ...(keepActionSelection ? {} : { selectedActionId: null, editDraft: null }),
    });
  };

  #selectSemanticTarget(targetId: EmbeddedNodeId): Promise<SemanticNavigationResult> {
    return this.#semanticSelection.select(targetId, {
      origin: "presentation-timeline",
      focusEditor: false,
    });
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
