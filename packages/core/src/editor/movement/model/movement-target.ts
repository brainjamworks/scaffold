import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type { MovementNodeContext } from "./movement-policy";

export type MovementTargetAxis = "horizontal" | "vertical";

export type MovementTargetRect = {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};

export abstract class MovementTarget {
  protected constructor(
    readonly context: MovementNodeContext,
    readonly rect: MovementTargetRect,
    readonly axis: MovementTargetAxis = "vertical",
  ) {}

  get node(): ProseMirrorNode {
    return this.context.node;
  }

  get nodeType() {
    return this.context.nodeType;
  }

  get pos(): number {
    return this.context.pos;
  }
}

export class BlockMovementTarget extends MovementTarget {
  constructor(
    context: MovementNodeContext,
    rect: MovementTargetRect,
    axis: MovementTargetAxis = "vertical",
  ) {
    super(context, rect, axis);
  }
}

export class SurfaceMovementTarget extends MovementTarget {
  constructor(
    context: MovementNodeContext,
    rect: MovementTargetRect,
    axis: MovementTargetAxis = "vertical",
  ) {
    super(context, rect, axis);
  }
}

export class GridMovementTarget extends MovementTarget {
  constructor(
    context: MovementNodeContext,
    rect: MovementTargetRect,
    axis: MovementTargetAxis = "vertical",
  ) {
    super(context, rect, axis);
  }
}

export class CellMovementTarget extends MovementTarget {
  constructor(
    context: MovementNodeContext,
    rect: MovementTargetRect,
    axis: MovementTargetAxis = "vertical",
  ) {
    super(context, rect, axis);
  }
}

export class LayoutMovementTarget extends MovementTarget {
  constructor(
    context: MovementNodeContext,
    rect: MovementTargetRect,
    axis: MovementTargetAxis = "vertical",
  ) {
    super(context, rect, axis);
  }
}

export class SectionMovementTarget extends MovementTarget {
  constructor(
    context: MovementNodeContext,
    rect: MovementTargetRect,
    axis: MovementTargetAxis = "vertical",
  ) {
    super(context, rect, axis);
  }
}

export class RegionMovementTarget extends MovementTarget {
  constructor(
    context: MovementNodeContext,
    rect: MovementTargetRect,
    axis: MovementTargetAxis = "vertical",
  ) {
    super(context, rect, axis);
  }
}

export class ContainedMovementTarget extends MovementTarget {
  constructor(
    context: MovementNodeContext,
    rect: MovementTargetRect,
    axis: MovementTargetAxis = "vertical",
  ) {
    super(context, rect, axis);
  }
}

export type AnyMovementTarget =
  | BlockMovementTarget
  | SurfaceMovementTarget
  | GridMovementTarget
  | CellMovementTarget
  | LayoutMovementTarget
  | SectionMovementTarget
  | RegionMovementTarget
  | ContainedMovementTarget;

export function movementTargetAxis(target: AnyMovementTarget): MovementTargetAxis {
  return target.axis;
}

export function createMovementTarget(
  context: MovementNodeContext,
  rect: MovementTargetRect,
  axis: MovementTargetAxis = "vertical",
): AnyMovementTarget {
  const nodeName = context.nodeType.name;

  if (nodeName === "surface") return new SurfaceMovementTarget(context, rect, axis);
  if (nodeName === "grid") return new GridMovementTarget(context, rect, axis);
  if (nodeName === "cell") return new CellMovementTarget(context, rect, axis);
  if (nodeName === "layout") return new LayoutMovementTarget(context, rect, axis);
  if (nodeName === "section") return new SectionMovementTarget(context, rect, axis);
  if (nodeName === "region") return new RegionMovementTarget(context, rect, axis);

  return new BlockMovementTarget(context, rect, axis);
}
