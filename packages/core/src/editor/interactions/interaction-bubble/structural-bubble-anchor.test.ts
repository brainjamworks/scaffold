import { describe, expect, it } from "vite-plus/test";

import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";

import { structuralMenuAnchorId } from "./structural-bubble-anchor";

describe("structuralMenuAnchorId", () => {
  it("builds role-prefixed anchor ids from stable structural ids", () => {
    expect(structuralMenuAnchorId(InteractionTargetKind.Grid, "grid-a")).toBe("grid-menu:grid-a");
    expect(structuralMenuAnchorId(InteractionTargetKind.Cell, "cell-a")).toBe("cell-menu:cell-a");
  });

  it("returns null without a stable structural id", () => {
    expect(structuralMenuAnchorId(InteractionTargetKind.Layout, null)).toBeNull();
    expect(structuralMenuAnchorId(InteractionTargetKind.Layout, undefined)).toBeNull();
    expect(structuralMenuAnchorId(InteractionTargetKind.Layout, "")).toBeNull();
  });
});
