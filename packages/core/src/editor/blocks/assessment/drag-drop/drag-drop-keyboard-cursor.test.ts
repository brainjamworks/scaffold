import { describe, expect, it } from "vite-plus/test";

import {
  createIdleDragDropKeyboardCursor,
  transitionDragDropKeyboardCursor,
  type DragDropKeyboardCursorState,
} from "@/editor/assessment/drag-drop/drag-drop-keyboard-cursor";

const markerId = "marker000001" as never;

function start(point: { x: number; y: number } | null = null): DragDropKeyboardCursorState {
  return transitionDragDropKeyboardCursor(createIdleDragDropKeyboardCursor(), {
    type: "start",
    markerId,
    originalPoint: point,
  }).state;
}

describe("transitionDragDropKeyboardCursor", () => {
  it("starts an unplaced marker at the image centre and a reposition at its existing point", () => {
    expect(start()).toEqual({
      kind: "positioning",
      markerId,
      originalPoint: null,
      point: { x: 50, y: 50 },
      step: "normal",
    });
    expect(start({ x: 12.5, y: 87.5 })).toEqual({
      kind: "positioning",
      markerId,
      originalPoint: { x: 12.5, y: 87.5 },
      point: { x: 12.5, y: 87.5 },
      step: "normal",
    });
  });

  it.each([
    ["normal", "right", { x: 55, y: 50 }],
    ["fine", "up", { x: 50, y: 49 }],
    ["coarse", "left", { x: 40, y: 50 }],
    ["coarse", "down", { x: 50, y: 60 }],
  ] as const)("moves with the %s step toward %s", (step, direction, expectedPoint) => {
    expect(
      transitionDragDropKeyboardCursor(start(), { type: "move", direction, step }).state,
    ).toMatchObject({ kind: "positioning", point: expectedPoint, step });
  });

  it.each([
    ["left", { x: 0, y: 50 }],
    ["right", { x: 100, y: 50 }],
    ["up", { x: 50, y: 0 }],
    ["down", { x: 50, y: 100 }],
  ] as const)("clamps repeated %s movement to the image edge", (direction, point) => {
    let state = start();
    for (let index = 0; index < 20; index += 1) {
      state = transitionDragDropKeyboardCursor(state, {
        type: "move",
        direction,
        step: "coarse",
      }).state;
    }
    expect(state).toMatchObject({ point });
  });

  it("reaches every corner without leaving normalized bounds", () => {
    let state = start({ x: 0, y: 0 });
    for (const direction of ["right", "down", "left", "up"] as const) {
      for (let index = 0; index < 10; index += 1) {
        state = transitionDragDropKeyboardCursor(state, {
          type: "move",
          direction,
          step: "coarse",
        }).state;
      }
      expect(state).toMatchObject({
        point:
          direction === "right"
            ? { x: 100, y: 0 }
            : direction === "down"
              ? { x: 100, y: 100 }
              : direction === "left"
                ? { x: 0, y: 100 }
                : { x: 0, y: 0 },
      });
    }
  });

  it("emits exactly one canonical point only when positioning commits", () => {
    const moved = transitionDragDropKeyboardCursor(start(), {
      type: "move",
      direction: "right",
      step: "fine",
    });
    expect(moved.terminal).toBeNull();

    expect(transitionDragDropKeyboardCursor(moved.state, { type: "commit" })).toEqual({
      state: { kind: "idle" },
      terminal: { kind: "commit", markerId, point: { x: 51, y: 50 } },
    });
  });

  it("cancels without emitting a point and retains the original point until cancellation", () => {
    const moved = transitionDragDropKeyboardCursor(start({ x: 25, y: 75 }), {
      type: "move",
      direction: "up",
      step: "normal",
    });
    expect(moved.state).toMatchObject({ originalPoint: { x: 25, y: 75 } });
    expect(transitionDragDropKeyboardCursor(moved.state, { type: "cancel" })).toEqual({
      state: { kind: "idle" },
      terminal: { kind: "cancel", markerId },
    });
  });

  it("keeps invalid points and impossible state events observable", () => {
    const idle = createIdleDragDropKeyboardCursor();
    expect(() =>
      transitionDragDropKeyboardCursor(idle, { type: "move", direction: "left", step: "normal" }),
    ).toThrow("Cannot move an idle Drag and Drop keyboard cursor");
    expect(() => transitionDragDropKeyboardCursor(idle, { type: "commit" })).toThrow(
      "Cannot commit an idle Drag and Drop keyboard cursor",
    );
    expect(() =>
      transitionDragDropKeyboardCursor(idle, {
        type: "start",
        markerId,
        originalPoint: { x: Number.NaN, y: 20 },
      }),
    ).toThrow("Expected a finite normalized keyboard cursor point");
    expect(() =>
      transitionDragDropKeyboardCursor(start(), {
        type: "start",
        markerId,
        originalPoint: null,
      }),
    ).toThrow("Cannot start a Drag and Drop keyboard cursor while positioning");
  });
});
