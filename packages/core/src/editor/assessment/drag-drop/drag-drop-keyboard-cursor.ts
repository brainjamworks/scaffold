import type { EmbeddedDataId } from "@scaffold/contracts";

import type { SpatialImagePoint } from "@/editor/blocks/assessment/shared/spatial";

export type DragDropKeyboardCursorStep = "normal" | "fine" | "coarse";
export type DragDropKeyboardCursorDirection = "up" | "down" | "left" | "right";

export type DragDropKeyboardCursorState =
  | { readonly kind: "idle" }
  | {
      readonly kind: "positioning";
      readonly markerId: EmbeddedDataId;
      readonly originalPoint: SpatialImagePoint | null;
      readonly point: SpatialImagePoint;
      readonly step: DragDropKeyboardCursorStep;
    };

export type DragDropKeyboardCursorEvent =
  | {
      readonly type: "start";
      readonly markerId: EmbeddedDataId;
      readonly originalPoint: SpatialImagePoint | null;
    }
  | {
      readonly type: "move";
      readonly direction: DragDropKeyboardCursorDirection;
      readonly step: DragDropKeyboardCursorStep;
    }
  | { readonly type: "commit" }
  | { readonly type: "cancel" };

export type DragDropKeyboardCursorTerminal =
  | {
      readonly kind: "commit";
      readonly markerId: EmbeddedDataId;
      readonly point: SpatialImagePoint;
    }
  | { readonly kind: "cancel"; readonly markerId: EmbeddedDataId };

export interface DragDropKeyboardCursorTransition {
  readonly state: DragDropKeyboardCursorState;
  readonly terminal: DragDropKeyboardCursorTerminal | null;
}

const STEP_PERCENT: Readonly<Record<DragDropKeyboardCursorStep, number>> = {
  normal: 5,
  fine: 1,
  coarse: 10,
};

export function createIdleDragDropKeyboardCursor(): DragDropKeyboardCursorState {
  return { kind: "idle" };
}

export function transitionDragDropKeyboardCursor(
  state: DragDropKeyboardCursorState,
  event: DragDropKeyboardCursorEvent,
): DragDropKeyboardCursorTransition {
  if (event.type === "start") {
    if (state.kind !== "idle") {
      throw new Error("Cannot start a Drag and Drop keyboard cursor while positioning.");
    }
    if (event.originalPoint) assertNormalizedPoint(event.originalPoint);
    const originalPoint = event.originalPoint ? { ...event.originalPoint } : null;
    return {
      state: {
        kind: "positioning",
        markerId: event.markerId,
        originalPoint,
        point: originalPoint ? { ...originalPoint } : { x: 50, y: 50 },
        step: "normal",
      },
      terminal: null,
    };
  }

  if (state.kind !== "positioning") {
    throw new Error(`Cannot ${event.type} an idle Drag and Drop keyboard cursor.`);
  }

  if (event.type === "move") {
    const distance = STEP_PERCENT[event.step];
    const movement = {
      down: { x: 0, y: distance },
      left: { x: -distance, y: 0 },
      right: { x: distance, y: 0 },
      up: { x: 0, y: -distance },
    }[event.direction];
    return {
      state: {
        ...state,
        point: {
          x: clampPercent(state.point.x + movement.x),
          y: clampPercent(state.point.y + movement.y),
        },
        step: event.step,
      },
      terminal: null,
    };
  }

  if (event.type === "commit") {
    return {
      state: createIdleDragDropKeyboardCursor(),
      terminal: { kind: "commit", markerId: state.markerId, point: { ...state.point } },
    };
  }

  return {
    state: createIdleDragDropKeyboardCursor(),
    terminal: { kind: "cancel", markerId: state.markerId },
  };
}

function assertNormalizedPoint(point: SpatialImagePoint): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error("Expected a finite normalized keyboard cursor point.");
  }
  if (point.x < 0 || point.x > 100 || point.y < 0 || point.y > 100) {
    throw new Error("Expected a normalized keyboard cursor point within the image bounds.");
  }
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}
