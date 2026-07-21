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
  MoveContainedAfterTarget,
  MoveContainedBeforeTarget,
  type AnyMovementIntent,
} from "../model/movement-intents";

import { cn } from "@/lib/cn";
import "./drop-indicator.css";

export interface DropIndicatorProps {
  className?: string;
  intent: AnyMovementIntent | null;
}

export function DropIndicator({ className, intent }: DropIndicatorProps) {
  if (!intent) return null;

  return (
    <div
      aria-hidden
      contentEditable={false}
      data-testid="scaffold-drop-indicator"
      data-scaffold-drop-intent={indicatorLabel(intent)}
      className={cn("sc-drop-indicator", indicatorClass(intent), className)}
    />
  );
}

function indicatorClass(intent: AnyMovementIntent): string {
  if (intent instanceof InsertBeforeTarget) {
    return "sc-drop-indicator--horizontal-before";
  }
  if (intent instanceof InsertAfterTarget) {
    return "sc-drop-indicator--horizontal-after";
  }
  if (intent instanceof MoveContainedBeforeTarget) {
    return "sc-drop-indicator--horizontal-before";
  }
  if (intent instanceof MoveContainedAfterTarget) {
    return "sc-drop-indicator--horizontal-after";
  }
  if (isLeftSideIndicator(intent)) {
    return "sc-drop-indicator--vertical-before";
  }
  if (isRightSideIndicator(intent)) {
    return "sc-drop-indicator--vertical-after";
  }

  return "sc-drop-indicator--inside";
}

function isLeftSideIndicator(intent: AnyMovementIntent): boolean {
  return (
    intent instanceof CreateGridBeforeBlock ||
    intent instanceof AddCellBeforeTarget ||
    intent instanceof AddCellAtGridStart
  );
}

function isRightSideIndicator(intent: AnyMovementIntent): boolean {
  return (
    intent instanceof CreateGridAfterBlock ||
    intent instanceof AddCellAfterTarget ||
    intent instanceof AddCellAtGridEnd
  );
}

function indicatorLabel(intent: AnyMovementIntent): string {
  if (intent instanceof InsertBeforeTarget) return "insert-before";
  if (intent instanceof InsertAfterTarget) return "insert-after";
  if (intent instanceof InsertInsideTarget) return "insert-inside";
  if (intent instanceof MoveContainedBeforeTarget) return "move-contained-before";
  if (intent instanceof MoveContainedAfterTarget) return "move-contained-after";
  if (intent instanceof CreateGridBeforeBlock) return "create-grid-before-block";
  if (intent instanceof CreateGridAfterBlock) return "create-grid-after-block";
  if (intent instanceof AddCellBeforeTarget) return "add-cell-before";
  if (intent instanceof AddCellAfterTarget) return "add-cell-after";
  if (intent instanceof AddCellAtGridStart) return "add-cell-at-grid-start";
  return "add-cell-at-grid-end";
}
