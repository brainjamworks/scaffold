import {
  AlignBottomIcon as AlignBottom,
  AlignCenterVerticalIcon as AlignCenterVertical,
  AlignTopIcon as AlignTop,
  TextAlignCenterIcon as TextAlignCenter,
  TextAlignLeftIcon as TextAlignLeft,
  TextAlignRightIcon as TextAlignRight,
} from "@phosphor-icons/react";

import { MenuControls } from "@/editor/shell/bubbles/interaction/menu-controls/MenuControls";
import type { MenuControlDescriptor } from "@/editor/shell/bubbles/interaction/menu-controls/types";
import type { AlignmentTargetSnapshot } from "@/editor/interactions/alignment/alignment-target";
import type { HorizontalAlignment, VerticalContentPosition } from "@/schemas/course-document";

export interface AlignmentControlsProps {
  snapshot: AlignmentTargetSnapshot;
  onHorizontalChange?: (value: HorizontalAlignment) => boolean | void;
  onVerticalChange?: (value: VerticalContentPosition) => boolean | void;
}

const HORIZONTAL_OPTIONS = [
  { value: "left", label: "Left", icon: TextAlignLeft },
  { value: "center", label: "Center", icon: TextAlignCenter },
  { value: "right", label: "Right", icon: TextAlignRight },
] as const;

const VERTICAL_OPTIONS = [
  { value: "top", label: "Top", icon: AlignTop },
  { value: "middle", label: "Middle", icon: AlignCenterVertical },
  { value: "bottom", label: "Bottom", icon: AlignBottom },
] as const;

export function AlignmentControls({
  snapshot,
  onHorizontalChange,
  onVerticalChange,
}: AlignmentControlsProps) {
  const controls: MenuControlDescriptor[] = [];
  const value: Record<string, unknown> = {};

  if (snapshot.horizontal.kind !== "unavailable") {
    controls.push({
      kind: "select",
      name: "horizontal",
      label: axisLabel("Horizontal alignment", snapshot.horizontal),
      presentation: "segmented",
      options: HORIZONTAL_OPTIONS,
    });
    if (snapshot.horizontal.kind === "value") value["horizontal"] = snapshot.horizontal.value;
  }

  if (snapshot.vertical.kind !== "unavailable") {
    controls.push({
      kind: "select",
      name: "vertical",
      label: axisLabel("Vertical alignment", snapshot.vertical),
      presentation: "segmented",
      options: VERTICAL_OPTIONS,
    });
    if (snapshot.vertical.kind === "value") value["vertical"] = snapshot.vertical.value;
  }

  return (
    <MenuControls
      controls={controls}
      value={value}
      onValueChange={(name, next) => {
        if (name === "horizontal" && isHorizontalAlignment(next)) {
          return onHorizontalChange?.(next);
        }
        if (name === "vertical" && isVerticalContentPosition(next)) {
          return onVerticalChange?.(next);
        }
        return false;
      }}
    />
  );
}

function axisLabel(
  base: string,
  state: AlignmentTargetSnapshot["horizontal"] | AlignmentTargetSnapshot["vertical"],
): string {
  if (state.kind !== "indeterminate") return base;
  return state.reason === "mixed" ? `${base} (mixed)` : `${base} (outside available options)`;
}

function isHorizontalAlignment(value: unknown): value is HorizontalAlignment {
  return value === "left" || value === "center" || value === "right";
}

function isVerticalContentPosition(value: unknown): value is VerticalContentPosition {
  return value === "top" || value === "middle" || value === "bottom";
}
