import type {
  AnyMovementTarget,
  BlockMovementTarget,
  CellMovementTarget,
  ContainedMovementTarget,
  GridMovementTarget,
  MovementTarget,
} from "./movement-target";

export abstract class MovementIntent<Target extends MovementTarget = MovementTarget> {
  protected constructor(readonly target: Target) {}
}

export class InsertBeforeTarget extends MovementIntent<AnyMovementTarget> {
  constructor(target: AnyMovementTarget) {
    super(target);
  }
}

export class InsertAfterTarget extends MovementIntent<AnyMovementTarget> {
  constructor(target: AnyMovementTarget) {
    super(target);
  }
}

export class InsertInsideTarget extends MovementIntent<AnyMovementTarget> {
  constructor(target: AnyMovementTarget) {
    super(target);
  }
}

export class CreateGridBeforeBlock extends MovementIntent<BlockMovementTarget> {
  constructor(target: BlockMovementTarget) {
    super(target);
  }
}

export class CreateGridAfterBlock extends MovementIntent<BlockMovementTarget> {
  constructor(target: BlockMovementTarget) {
    super(target);
  }
}

export class AddCellBeforeTarget extends MovementIntent<CellMovementTarget> {
  constructor(target: CellMovementTarget) {
    super(target);
  }
}

export class AddCellAfterTarget extends MovementIntent<CellMovementTarget> {
  constructor(target: CellMovementTarget) {
    super(target);
  }
}

export class AddCellAtGridStart extends MovementIntent<GridMovementTarget> {
  constructor(target: GridMovementTarget) {
    super(target);
  }
}

export class AddCellAtGridEnd extends MovementIntent<GridMovementTarget> {
  constructor(target: GridMovementTarget) {
    super(target);
  }
}

export class MoveContainedBeforeTarget extends MovementIntent<ContainedMovementTarget> {
  constructor(target: ContainedMovementTarget) {
    super(target);
  }
}

export class MoveContainedAfterTarget extends MovementIntent<ContainedMovementTarget> {
  constructor(target: ContainedMovementTarget) {
    super(target);
  }
}

export type AnyMovementIntent =
  | InsertBeforeTarget
  | InsertAfterTarget
  | InsertInsideTarget
  | CreateGridBeforeBlock
  | CreateGridAfterBlock
  | AddCellBeforeTarget
  | AddCellAfterTarget
  | AddCellAtGridStart
  | AddCellAtGridEnd
  | MoveContainedBeforeTarget
  | MoveContainedAfterTarget;

export type SideMovementIntent =
  | CreateGridBeforeBlock
  | CreateGridAfterBlock
  | AddCellBeforeTarget
  | AddCellAfterTarget
  | AddCellAtGridStart
  | AddCellAtGridEnd;

export function isSideMovementIntent(intent: AnyMovementIntent): intent is SideMovementIntent {
  return (
    intent instanceof CreateGridBeforeBlock ||
    intent instanceof CreateGridAfterBlock ||
    intent instanceof AddCellBeforeTarget ||
    intent instanceof AddCellAfterTarget ||
    intent instanceof AddCellAtGridStart ||
    intent instanceof AddCellAtGridEnd
  );
}
