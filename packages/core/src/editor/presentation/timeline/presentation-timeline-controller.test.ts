import type { EmbeddedDataId, EmbeddedNodeId, TimelineActionV1 } from "@scaffold/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  PresentationTimelineController,
  fitPresentationTimelineViewport,
  zoomPresentationTimelineViewportAtPointer,
} from "./presentation-timeline-controller";
import type { PresentationTimelineProjection } from "./presentation-timeline-projection";

const SURFACE_A = nodeId("surface-a");
const SURFACE_B = nodeId("surface-b");
const TARGET_A = nodeId("target-a");
const TARGET_B = nodeId("target-b");
const ACTION_A = dataId("action-a");
const BOUNDS = { minPixelsPerSecond: 10, maxPixelsPerSecond: 200 } as const;

describe("PresentationTimelineController", () => {
  it("selects current projection targets and actions synchronously and locally", () => {
    const controller = createController();

    expect(controller.selectTarget(TARGET_B)).toEqual({
      kind: "target-selected",
      targetId: TARGET_B,
    });
    expect(controller.selectAction(ACTION_A, TARGET_A)).toEqual({
      kind: "action-selected",
      actionId: ACTION_A,
      targetId: TARGET_A,
    });
    expect(controller.getSnapshot()).toMatchObject({
      selectedTargetId: TARGET_A,
      selectedActionId: ACTION_A,
    });
  });

  it("returns reason-specific refusals with requested IDs and retains selection", () => {
    const controller = createController();
    controller.selectAction(ACTION_A, TARGET_A);
    const before = controller.getSnapshot();
    const missingTarget = nodeId("missing");
    const missingAction = dataId("missing");

    expect(controller.selectTarget(missingTarget)).toEqual({
      kind: "target-not-found",
      surfaceId: SURFACE_A,
      requestedTargetId: missingTarget,
    });
    expect(controller.selectAction(missingAction, TARGET_A)).toEqual({
      kind: "action-not-found",
      surfaceId: SURFACE_A,
      requestedActionId: missingAction,
      requestedTargetId: TARGET_A,
    });
    expect(controller.selectAction(ACTION_A, TARGET_B)).toEqual({
      kind: "action-target-mismatch",
      surfaceId: SURFACE_A,
      requestedActionId: ACTION_A,
      requestedTargetId: TARGET_B,
      actualTargetId: TARGET_A,
    });
    expect(controller.getSnapshot()).toBe(before);
  });

  it("preserves surviving selection and viewport while reconciling content", () => {
    const controller = createController();
    controller.selectAction(ACTION_A, TARGET_A);
    controller.setPlayheadDraft(9_000, 10_000);
    controller.zoomAtPointer({
      requestedPixelsPerSecond: 100,
      pointerX: 125,
      durationMs: 10_000,
      viewportWidthPx: 500,
    });
    const before = controller.getSnapshot();

    controller.reconcileContent(projection(SURFACE_A, 10_000));

    expect(controller.getSnapshot()).toBe(before);
  });

  it("clears only a removed action and its gesture draft while keeping its target", () => {
    const controller = createController();
    controller.selectAction(ACTION_A, TARGET_A);
    controller.setEditDraft({ kind: "move-action", actionId: ACTION_A, atMs: 750 });

    controller.reconcileContent(projection(SURFACE_A, 10_000, { actionA: false }));

    expect(controller.getSnapshot()).toMatchObject({
      selectedTargetId: TARGET_A,
      selectedActionId: null,
      editDraft: null,
    });
  });

  it("clears invalid target state and clamps playhead and manual viewport", () => {
    const controller = createController();
    controller.selectAction(ACTION_A, TARGET_A);
    controller.setPlayheadDraft(9_000, 10_000);
    controller.zoomAtPointer({
      requestedPixelsPerSecond: 200,
      pointerX: 250,
      durationMs: 10_000,
      viewportWidthPx: 500,
    });
    controller.setViewportLeft(1_500, { durationMs: 10_000, viewportWidthPx: 500 });

    controller.reconcileContent(projection(SURFACE_A, 2_000, { actionA: false, targetA: false }));

    expect(controller.getSnapshot()).toMatchObject({
      selectedTargetId: null,
      selectedActionId: null,
      editDraft: null,
      playheadDraftMs: 2_000,
      zoomMode: "manual",
      pixelsPerSecond: 200,
      viewportLeftPx: 0,
    });
  });

  it("resets surface-specific state only for an actual Surface change", () => {
    const controller = createController();
    controller.selectAction(ACTION_A, TARGET_A);
    controller.setEditDraft({ kind: "move-action", actionId: ACTION_A, atMs: 750 });
    controller.setPlayheadDraft(4_000, 10_000);
    controller.zoomAtPointer({
      requestedPixelsPerSecond: 100,
      pointerX: 125,
      durationMs: 10_000,
      viewportWidthPx: 500,
    });
    const before = controller.getSnapshot();

    controller.setSurface(projection(SURFACE_A, 10_000));
    expect(controller.getSnapshot()).toBe(before);

    controller.setSurface(projection(SURFACE_B, 20_000));
    expect(controller.getSnapshot()).toMatchObject({
      selectedTargetId: SURFACE_B,
      selectedActionId: null,
      editDraft: null,
      playheadDraftMs: 0,
      zoomMode: "fit",
      pixelsPerSecond: 25,
      viewportLeftPx: 0,
    });
  });

  it("stores one immutable transient move or resize draft and never persists it", () => {
    const controller = createController();
    controller.selectAction(ACTION_A, TARGET_A);
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
    controller.clearEditDraft();
    expect(controller.getSnapshot().editDraft).toBeNull();
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("keeps viewport state local with deterministic Fit and pointer-centred bounded zoom", () => {
    const controller = createController();

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
    controller.setViewportLeft(10_000, { durationMs: 10_000, viewportWidthPx: 500 });
    expect(controller.getSnapshot().viewportLeftPx).toBe(500);
    controller.fit({ durationMs: 100_000, viewportWidthPx: 500 });
    expect(controller.getSnapshot()).toMatchObject({
      zoomMode: "fit",
      pixelsPerSecond: 10,
      viewportLeftPx: 0,
    });
  });
});

describe("presentation Timeline viewport math", () => {
  it("clamps Fit at both zoom bounds and supports zero duration", () => {
    expect(
      fitPresentationTimelineViewport({ durationMs: 100_000, viewportWidthPx: 500 }, BOUNDS),
    ).toEqual({ pixelsPerSecond: 10, viewportLeftPx: 0 });
    expect(
      fitPresentationTimelineViewport({ durationMs: 100, viewportWidthPx: 500 }, BOUNDS),
    ).toEqual({ pixelsPerSecond: 200, viewportLeftPx: 0 });
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
  });
});

function createController() {
  return new PresentationTimelineController({
    initialProjection: projection(SURFACE_A, 10_000),
    initialSelectedTargetId: TARGET_A,
    initialViewport: { durationMs: 10_000, viewportWidthPx: 500 },
    zoomBounds: BOUNDS,
  });
}

function projection(
  surfaceId: EmbeddedNodeId,
  durationMs: number,
  options: { readonly targetA?: boolean; readonly actionA?: boolean } = {},
): PresentationTimelineProjection {
  const targetA = options.targetA ?? true;
  const actionA = options.actionA ?? true;
  const action = animateAction();
  return {
    surfaceId,
    configurationState: "present",
    durationMs,
    narration: null,
    transition: null,
    orderedActionIds: actionA ? [ACTION_A] : [],
    diagnostics: [],
    rows: [
      row(surfaceId, null, []),
      ...(targetA ? [row(TARGET_A, surfaceId, actionA ? [action] : [])] : []),
      row(TARGET_B, surfaceId, []),
    ],
  };
}

function row(
  targetId: EmbeddedNodeId,
  parentTargetId: EmbeddedNodeId | null,
  actions: readonly TimelineActionV1[],
): PresentationTimelineProjection["rows"][number] {
  return {
    targetId,
    parentTargetId,
    depth: parentTargetId ? 1 : 0,
    semanticKind: parentTargetId ? "block" : "surface",
    label: targetId,
    summary: null,
    capabilities: {
      visualActionIds: [],
      reconstructableCommandTypes: [],
      disabledReason: null,
    },
    actions,
  };
}

function animateAction(): TimelineActionV1 {
  return {
    kind: "animate",
    id: ACTION_A,
    targetId: TARGET_A,
    isEnabled: true,
    atMs: 1_000,
    visual: {
      kind: "reveal",
      transition: {
        kind: "fade",
        durationMs: 500,
        easing: { kind: "preset", preset: "linear" },
      },
    },
  };
}

function nodeId(value: string): EmbeddedNodeId {
  return value.padEnd(12, "0").slice(0, 12) as EmbeddedNodeId;
}

function dataId(value: string): EmbeddedDataId {
  return value.padEnd(12, "0").slice(0, 12) as EmbeddedDataId;
}
