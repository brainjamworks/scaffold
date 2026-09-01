import type { EmbeddedDataId, EmbeddedNodeId } from "@scaffold/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import type {
  SemanticNavigationOptions,
  SemanticNavigationResult,
} from "@/document/authoring/semantic-document";

import {
  PresentationTimelineController,
  fitPresentationTimelineViewport,
  zoomPresentationTimelineViewportAtPointer,
} from "./presentation-timeline-controller";

const TARGET_A = nodeId("target-a");
const TARGET_B = nodeId("target-b");
const ACTION_A = dataId("action-a");
const ACTION_B = dataId("action-b");
const BOUNDS = { minPixelsPerSecond: 10, maxPixelsPerSecond: 200 } as const;

describe("PresentationTimelineController", () => {
  it("delegates target and action selection while expanding only the shared selected target", async () => {
    const semanticSelection = new FakeSemanticSelection(TARGET_A);
    const controller = createController(semanticSelection);

    expect(controller.getSnapshot()).toMatchObject({
      selectedTargetId: TARGET_A,
      selectedActionId: null,
    });
    expect(controller.isTargetExpanded(TARGET_A)).toBe(true);
    expect(controller.isTargetExpanded(TARGET_B)).toBe(false);

    await controller.selectAction(ACTION_B, TARGET_B);

    expect(semanticSelection.selectCalls).toEqual([
      {
        id: TARGET_B,
        options: { origin: "presentation-timeline", focusEditor: false },
      },
    ]);
    expect(controller.getSnapshot()).toMatchObject({
      selectedTargetId: TARGET_B,
      selectedActionId: ACTION_B,
    });
    expect(controller.isTargetExpanded(TARGET_A)).toBe(false);
    expect(controller.isTargetExpanded(TARGET_B)).toBe(true);

    semanticSelection.replace(TARGET_A);
    expect(controller.getSnapshot()).toMatchObject({
      selectedTargetId: TARGET_A,
      selectedActionId: null,
    });
    controller.destroy();
  });

  it("does not change semantic selection or focus when the playhead moves", () => {
    const semanticSelection = new FakeSemanticSelection(TARGET_A);
    const controller = createController(semanticSelection);

    controller.setPlayheadDraft(3_250, 10_000);
    expect(controller.getSnapshot().playheadDraftMs).toBe(3_250);
    expect(semanticSelection.selectCalls).toEqual([]);
    expect(controller.getSnapshot().selectedTargetId).toBe(TARGET_A);

    controller.setPlayheadDraft(20_000, 10_000);
    expect(controller.getSnapshot().playheadDraftMs).toBe(10_000);
    expect(semanticSelection.selectCalls).toEqual([]);
    controller.destroy();
  });

  it("keeps viewport state local with deterministic Fit and pointer-centred bounded zoom", () => {
    const semanticSelection = new FakeSemanticSelection(null);
    const controller = createController(semanticSelection);

    expect(controller.getSnapshot()).toMatchObject({
      zoomMode: "fit",
      pixelsPerSecond: 50,
      viewportLeftPx: 0,
    });

    controller.zoomAtPointer({
      requestedPixelsPerSecond: 100,
      pointerX: 125,
      durationMs: 10_000,
      viewportWidthPx: 500,
    });
    expect(controller.getSnapshot()).toMatchObject({
      zoomMode: "manual",
      pixelsPerSecond: 100,
      viewportLeftPx: 125,
    });

    controller.zoomAtPointer({
      requestedPixelsPerSecond: 1_000,
      pointerX: 50,
      durationMs: 10_000,
      viewportWidthPx: 500,
    });
    expect(controller.getSnapshot()).toMatchObject({
      zoomMode: "manual",
      pixelsPerSecond: 200,
      viewportLeftPx: 300,
    });

    controller.setViewportLeft(10_000, { durationMs: 10_000, viewportWidthPx: 500 });
    expect(controller.getSnapshot().viewportLeftPx).toBe(1_500);

    controller.fit({ durationMs: 100_000, viewportWidthPx: 500 });
    expect(controller.getSnapshot()).toMatchObject({
      zoomMode: "fit",
      pixelsPerSecond: 10,
      viewportLeftPx: 0,
    });

    controller.fit({ durationMs: 100, viewportWidthPx: 500 });
    expect(controller.getSnapshot()).toMatchObject({
      zoomMode: "fit",
      pixelsPerSecond: 200,
      viewportLeftPx: 0,
    });
    controller.destroy();
  });

  it("stores one immutable transient move or resize draft and never persists it", async () => {
    const semanticSelection = new FakeSemanticSelection(TARGET_A);
    const controller = createController(semanticSelection);
    await controller.selectAction(ACTION_A, TARGET_A);
    const listener = vi.fn();
    controller.subscribe(listener);

    controller.setEditDraft({ kind: "move-action", actionId: ACTION_A, atMs: 750 });
    const moveSnapshot = controller.getSnapshot();
    expect(moveSnapshot.editDraft).toEqual({
      kind: "move-action",
      actionId: ACTION_A,
      atMs: 750,
    });
    expect(Object.isFrozen(moveSnapshot)).toBe(true);
    expect(Object.isFrozen(moveSnapshot.editDraft)).toBe(true);

    controller.setEditDraft({
      kind: "resize-action",
      actionId: ACTION_A,
      atMs: 500,
      durationMs: 1_250,
    });
    expect(controller.getSnapshot().editDraft).toEqual({
      kind: "resize-action",
      actionId: ACTION_A,
      atMs: 500,
      durationMs: 1_250,
    });

    controller.clearEditDraft();
    expect(controller.getSnapshot().editDraft).toBeNull();
    expect(listener).toHaveBeenCalledTimes(3);
    controller.destroy();
  });

  it("leaves local action selection unchanged when semantic activation cannot reach its target", async () => {
    const semanticSelection = new FakeSemanticSelection(TARGET_A);
    const controller = createController(semanticSelection);
    await controller.selectAction(ACTION_A, TARGET_A);
    semanticSelection.nextResult = { kind: "missing", id: TARGET_B };

    await expect(controller.selectAction(ACTION_B, TARGET_B)).resolves.toEqual({
      kind: "missing",
      id: TARGET_B,
    });
    expect(controller.getSnapshot()).toMatchObject({
      selectedTargetId: TARGET_A,
      selectedActionId: ACTION_A,
    });
    controller.destroy();
  });
});

describe("presentation Timeline viewport math", () => {
  it("clamps Fit to the minimum pixels per second", () => {
    expect(
      fitPresentationTimelineViewport({ durationMs: 100_000, viewportWidthPx: 500 }, BOUNDS),
    ).toEqual({ pixelsPerSecond: 10, viewportLeftPx: 0 });
  });

  it("preserves an in-range Fit", () => {
    expect(
      fitPresentationTimelineViewport({ durationMs: 10_000, viewportWidthPx: 500 }, BOUNDS),
    ).toEqual({ pixelsPerSecond: 50, viewportLeftPx: 0 });
  });

  it("clamps Fit to the maximum pixels per second", () => {
    expect(
      fitPresentationTimelineViewport({ durationMs: 100, viewportWidthPx: 500 }, BOUNDS),
    ).toEqual({ pixelsPerSecond: 200, viewportLeftPx: 0 });
  });

  it("fits zero duration at the minimum pixels per second", () => {
    expect(
      fitPresentationTimelineViewport({ durationMs: 0, viewportWidthPx: 500 }, BOUNDS),
    ).toEqual({ pixelsPerSecond: 10, viewportLeftPx: 0 });
  });

  it("keeps the pointed time fixed unless a content edge clamps the viewport", () => {
    expect(
      zoomPresentationTimelineViewportAtPointer(
        {
          currentPixelsPerSecond: 50,
          currentViewportLeftPx: 100,
          requestedPixelsPerSecond: 100,
          pointerX: 200,
          durationMs: 20_000,
          viewportWidthPx: 500,
        },
        BOUNDS,
      ),
    ).toEqual({ pixelsPerSecond: 100, viewportLeftPx: 400 });

    expect(
      zoomPresentationTimelineViewportAtPointer(
        {
          currentPixelsPerSecond: 100,
          currentViewportLeftPx: 0,
          requestedPixelsPerSecond: 5,
          pointerX: 250,
          durationMs: 20_000,
          viewportWidthPx: 500,
        },
        BOUNDS,
      ),
    ).toEqual({ pixelsPerSecond: 10, viewportLeftPx: 0 });
  });
});

function createController(semanticSelection: FakeSemanticSelection) {
  return new PresentationTimelineController({
    semanticSelection,
    initialViewport: { durationMs: 10_000, viewportWidthPx: 500 },
    zoomBounds: BOUNDS,
  });
}

class FakeSemanticSelection {
  readonly selectCalls: Array<{ id: EmbeddedNodeId; options: SemanticNavigationOptions }> = [];
  readonly #listeners = new Set<() => void>();
  nextResult: SemanticNavigationResult | null = null;
  #selectedId: EmbeddedNodeId | null;

  constructor(selectedId: EmbeddedNodeId | null) {
    this.#selectedId = selectedId;
  }

  getSnapshot = () => ({ selectedId: this.#selectedId });

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  async select(
    itemId: EmbeddedNodeId,
    options: SemanticNavigationOptions,
  ): Promise<SemanticNavigationResult> {
    this.selectCalls.push({ id: itemId, options });
    const result = this.nextResult ?? ({ kind: "reached", id: itemId } as const);
    this.nextResult = null;
    if (result.kind === "reached") this.replace(result.id);
    return result;
  }

  replace(selectedId: EmbeddedNodeId | null): void {
    this.#selectedId = selectedId;
    for (const listener of this.#listeners) listener();
  }
}

function nodeId(value: string): EmbeddedNodeId {
  return value.padEnd(12, "0").slice(0, 12) as EmbeddedNodeId;
}

function dataId(value: string): EmbeddedDataId {
  return value.padEnd(12, "0").slice(0, 12) as EmbeddedDataId;
}
