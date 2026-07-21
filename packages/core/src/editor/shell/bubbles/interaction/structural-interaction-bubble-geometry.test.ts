import { describe, expect, it } from "vite-plus/test";

import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";

import {
  defaultStructuralInteractionBubbleTriggerSize,
  resolveStructuralInteractionBubbleGeometry,
} from "./structural-interaction-bubble-geometry";

describe("structural interaction bubble geometry", () => {
  it.each([
    [
      InteractionTargetKind.Cell,
      {
        alignment: "centered-on-point",
        placement: "top-center",
      },
    ],
    [
      InteractionTargetKind.Grid,
      {
        alignment: "centered-on-point",
        placement: "middle-left",
      },
    ],
    [
      InteractionTargetKind.Layout,
      {
        alignment: "end-before-point",
        inlineOffset: -12,
        placement: "top-right",
      },
    ],
    [InteractionTargetKind.Region, { placement: "top-right" }],
    [InteractionTargetKind.Section, null],
    [InteractionTargetKind.Surface, { placement: "top-right" }],
  ] as const)("resolves %s target policy", (kind, expected) => {
    expect(resolveStructuralInteractionBubbleGeometry(kind)).toEqual(expected);
  });

  it.each([
    [InteractionTargetKind.Cell, { height: 20, width: 36 }],
    [InteractionTargetKind.Layout, { height: 20, width: 36 }],
    [InteractionTargetKind.Grid, { height: 36, width: 20 }],
    [InteractionTargetKind.Region, { height: 36, width: 20 }],
    [InteractionTargetKind.Surface, { height: 36, width: 20 }],
  ] as const)("uses the existing %s fallback trigger size", (kind, expected) => {
    const geometry = resolveStructuralInteractionBubbleGeometry(kind);
    if (!geometry) throw new Error(`Expected ${kind} geometry.`);

    expect(defaultStructuralInteractionBubbleTriggerSize(geometry)).toEqual(expected);
  });
});
