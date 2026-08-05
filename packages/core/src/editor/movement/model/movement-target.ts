import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type { MovementNodeContext } from "./movement-policy";

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
  constructor(context: MovementNodeContext, rect: MovementTargetRect) {
    super(context, rect);
  }
}

export class SurfaceMovementTarget extends MovementTarget {
  constructor(context: MovementNodeContext, rect: MovementTargetRect) {
    super(context, rect);
  }
}

export class GridMovementTarget extends MovementTarget {
  constructor(context: MovementNodeContext, rect: MovementTargetRect) {
    super(context, rect);
  }
}

export class CellMovementTarget extends MovementTarget {
  constructor(context: MovementNodeContext, rect: MovementTargetRect) {
    super(context, rect);
  }
}

export class LayoutMovementTarget extends MovementTarget {
  constructor(context: MovementNodeContext, rect: MovementTargetRect) {
    super(context, rect);
  }
}

export class SectionMovementTarget extends MovementTarget {
  constructor(context: MovementNodeContext, rect: MovementTargetRect) {
    super(context, rect);
  }
}

export class RegionMovementTarget extends MovementTarget {
  constructor(context: MovementNodeContext, rect: MovementTargetRect) {
    super(context, rect);
  }
}

export class ContainedMovementTarget extends MovementTarget {
  constructor(context: MovementNodeContext, rect: MovementTargetRect) {
    super(context, rect);
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

export function createMovementTarget(
  context: MovementNodeContext,
  rect: MovementTargetRect,
): AnyMovementTarget {
  const nodeName = context.nodeType.name;

  if (nodeName === "surface") return new SurfaceMovementTarget(context, rect);
  if (nodeName === "grid") return new GridMovementTarget(context, rect);
  if (nodeName === "cell") return new CellMovementTarget(context, rect);
  if (nodeName === "layout") return new LayoutMovementTarget(context, rect);
  if (nodeName === "section") return new SectionMovementTarget(context, rect);
  if (nodeName === "region") return new RegionMovementTarget(context, rect);

  return new BlockMovementTarget(context, rect);
}
