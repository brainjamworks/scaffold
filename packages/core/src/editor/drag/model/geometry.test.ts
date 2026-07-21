import { describe, expect, it } from "vite-plus/test";

import { deriveMovementIntentFromGeometry } from "./geometry";
import {
  AddCellAfterTarget,
  AddCellAtGridEnd,
  CreateGridBeforeBlock,
  InsertAfterTarget,
  InsertBeforeTarget,
  InsertInsideTarget,
} from "./movement-intents";
import type { MovementNodeContext } from "./movement-policy";
import {
  BlockMovementTarget,
  CellMovementTarget,
  GridMovementTarget,
  RegionMovementTarget,
  SectionMovementTarget,
  type AnyMovementTarget,
  type MovementTargetRect,
} from "./movement-target";

const targetRect: MovementTargetRect = {
  bottom: 180,
  height: 120,
  left: 100,
  right: 500,
  top: 60,
  width: 400,
};

describe("deriveMovementIntentFromGeometry", () => {
  it("resolves the middle of a block target to before or after by midpoint", () => {
    const target = targetAt(BlockMovementTarget, 12);

    expect(
      deriveMovementIntentFromGeometry({
        point: { x: 300, y: 110 },
        target,
      }),
    ).toBeInstanceOf(InsertBeforeTarget);

    expect(
      deriveMovementIntentFromGeometry({
        point: { x: 300, y: 130 },
        target,
      }),
    ).toBeInstanceOf(InsertAfterTarget);
  });

  it("keeps structural container interiors as inside targets", () => {
    const target = targetAt(SectionMovementTarget, 12);
    const intent = deriveMovementIntentFromGeometry({
      point: { x: 300, y: 120 },
      target,
    });

    expect(intent).toBeInstanceOf(InsertInsideTarget);
    expect(intent?.target.pos).toBe(12);
  });

  it("keeps region geometry inside-only at every edge", () => {
    const target = targetAt(RegionMovementTarget, 18);

    for (const point of [
      { x: 100, y: 60 },
      { x: 500, y: 120 },
      { x: 300, y: 180 },
    ]) {
      const intent = deriveMovementIntentFromGeometry({ point, target });
      expect(intent).toBeInstanceOf(InsertInsideTarget);
      expect(intent?.target.pos).toBe(18);
    }
  });

  it("treats side-edge block targets as grid creation intents", () => {
    const target = targetAt(BlockMovementTarget, 12);
    const intent = deriveMovementIntentFromGeometry({
      point: { x: 105, y: 120 },
      target,
    });

    expect(intent).toBeInstanceOf(CreateGridBeforeBlock);
    expect(intent?.target.pos).toBe(12);
  });

  it("treats cell side edges as add-cell intents and cell bodies as inside targets", () => {
    const target = targetAt(CellMovementTarget, 24);

    expect(
      deriveMovementIntentFromGeometry({
        point: { x: 495, y: 120 },
        target,
      }),
    ).toBeInstanceOf(AddCellAfterTarget);

    expect(
      deriveMovementIntentFromGeometry({
        point: { x: 300, y: 120 },
        target,
      }),
    ).toBeInstanceOf(InsertInsideTarget);
  });

  it("treats grid edges as grid-boundary cell insertion intents", () => {
    const target = targetAt(GridMovementTarget, 30);
    const intent = deriveMovementIntentFromGeometry({
      point: { x: 495, y: 120 },
      target,
    });

    expect(intent).toBeInstanceOf(AddCellAtGridEnd);
    expect(intent?.target.pos).toBe(30);
  });

  it("keeps movement context identity on derived movement intents", () => {
    const target = targetAt(GridMovementTarget, 30);
    const intent = deriveMovementIntentFromGeometry({
      point: { x: 495, y: 120 },
      target,
    });

    expect(intent).toBeInstanceOf(AddCellAtGridEnd);
    expect(intent?.target).toBe(target);
    expect(intent?.target.context).toBe(target.context);
  });
});

type TargetConstructor = new (
  context: MovementNodeContext,
  rect: MovementTargetRect,
) => AnyMovementTarget;

function targetAt(Target: TargetConstructor, pos: number): AnyMovementTarget {
  return new Target(
    {
      ancestors: [],
      index: 0,
      node: {} as MovementNodeContext["node"],
      nodeType: { name: "test" } as MovementNodeContext["nodeType"],
      parent: null,
      parentPos: null,
      parentType: null,
      pos,
    },
    targetRect,
  );
}
