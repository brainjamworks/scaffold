import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";
import type { StructuralInteractionTargetKind } from "@/editor/interactions/targets/prosemirror/projection/target-ref-projection";
import type {
  StructuralFloatingGeometry,
  StructuralFloatingTriggerSize,
} from "@/editor/interactions/floating/structural-floating-geometry";

const DEFAULT_VERTICAL_TRIGGER_SIZE: StructuralFloatingTriggerSize = {
  height: 36,
  width: 20,
};

const DEFAULT_HORIZONTAL_TRIGGER_SIZE: StructuralFloatingTriggerSize = {
  height: 20,
  width: 36,
};

const STRUCTURAL_INTERACTION_BUBBLE_GEOMETRY_BY_KIND: Readonly<
  Partial<Record<StructuralInteractionTargetKind, StructuralFloatingGeometry>>
> = {
  [InteractionTargetKind.Cell]: {
    alignment: "centered-on-point",
    placement: "top-center",
  },
  [InteractionTargetKind.Grid]: {
    alignment: "centered-on-point",
    placement: "middle-left",
  },
  [InteractionTargetKind.Layout]: {
    alignment: "end-before-point",
    inlineOffset: -12,
    placement: "top-right",
  },
  [InteractionTargetKind.Region]: {
    placement: "top-right",
  },
  [InteractionTargetKind.Surface]: {
    placement: "top-right",
  },
};

export function resolveStructuralInteractionBubbleGeometry(
  kind: StructuralInteractionTargetKind,
): StructuralFloatingGeometry | null {
  return STRUCTURAL_INTERACTION_BUBBLE_GEOMETRY_BY_KIND[kind] ?? null;
}

export function defaultStructuralInteractionBubbleTriggerSize(
  geometry: StructuralFloatingGeometry,
): StructuralFloatingTriggerSize {
  if (geometry.placement === "top-center" || geometry.alignment === "end-before-point") {
    return DEFAULT_HORIZONTAL_TRIGGER_SIZE;
  }

  return DEFAULT_VERTICAL_TRIGGER_SIZE;
}
