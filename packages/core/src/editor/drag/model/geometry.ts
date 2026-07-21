import {
  AddCellAfterTarget,
  AddCellAtGridEnd,
  AddCellAtGridStart,
  AddCellBeforeTarget,
  CreateGridAfterBlock,
  CreateGridBeforeBlock,
  InsertAfterTarget,
  InsertBeforeTarget,
  InsertInsideTarget,
  type AnyMovementIntent,
} from "./movement-intents";
import {
  BlockMovementTarget,
  CellMovementTarget,
  GridMovementTarget,
  RegionMovementTarget,
  SurfaceMovementTarget,
  type AnyMovementTarget,
} from "./movement-target";

export type DropPoint = {
  x: number;
  y: number;
};

export type MovementGeometryInput = {
  point: DropPoint;
  target: AnyMovementTarget;
};

const EDGE_ZONE_MAX_PX = 48;

export function deriveMovementIntentFromGeometry({
  point,
  target,
}: MovementGeometryInput): AnyMovementIntent | null {
  if (target instanceof BlockMovementTarget) {
    return deriveBlockMovementIntent(point, target);
  }

  if (target instanceof CellMovementTarget) {
    return deriveCellMovementIntent(point, target);
  }

  if (target instanceof GridMovementTarget) {
    return deriveGridMovementIntent(point, target);
  }

  if (target instanceof SurfaceMovementTarget || target instanceof RegionMovementTarget) {
    return new InsertInsideTarget(target);
  }

  return deriveContainerMovementIntent(point, target);
}

function deriveBlockMovementIntent(
  point: DropPoint,
  target: BlockMovementTarget,
): AnyMovementIntent {
  if (isLeftEdge(point, target)) return new CreateGridBeforeBlock(target);
  if (isRightEdge(point, target)) return new CreateGridAfterBlock(target);

  return isBeforeMidpoint(point, target)
    ? new InsertBeforeTarget(target)
    : new InsertAfterTarget(target);
}

function deriveCellMovementIntent(point: DropPoint, target: CellMovementTarget): AnyMovementIntent {
  if (isLeftEdge(point, target)) return new AddCellBeforeTarget(target);
  if (isRightEdge(point, target)) return new AddCellAfterTarget(target);

  return new InsertInsideTarget(target);
}

function deriveGridMovementIntent(point: DropPoint, target: GridMovementTarget): AnyMovementIntent {
  if (isLeftEdge(point, target)) return new AddCellAtGridStart(target);
  if (isRightEdge(point, target)) return new AddCellAtGridEnd(target);

  return deriveContainerMovementIntent(point, target);
}

function deriveContainerMovementIntent(
  point: DropPoint,
  target: AnyMovementTarget,
): AnyMovementIntent {
  const height = Math.max(target.rect.height, 1);
  const topThird = target.rect.top + height / 3;
  const bottomThird = target.rect.bottom - height / 3;

  if (point.y <= topThird) return new InsertBeforeTarget(target);
  if (point.y >= bottomThird) return new InsertAfterTarget(target);

  return new InsertInsideTarget(target);
}

function isBeforeMidpoint(point: DropPoint, target: AnyMovementTarget): boolean {
  return point.y < target.rect.top + Math.max(target.rect.height, 1) / 2;
}

function isLeftEdge(point: DropPoint, target: AnyMovementTarget): boolean {
  return point.x <= target.rect.left + edgeZone(target);
}

function isRightEdge(point: DropPoint, target: AnyMovementTarget): boolean {
  return point.x >= target.rect.right - edgeZone(target);
}

function edgeZone(target: AnyMovementTarget): number {
  return Math.min(EDGE_ZONE_MAX_PX, Math.max(target.rect.width, 1) / 4);
}
