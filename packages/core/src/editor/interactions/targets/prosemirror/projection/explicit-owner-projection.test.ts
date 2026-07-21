import { describe, expect, it } from "vite-plus/test";

import {
  InteractionTargetKind,
  type InteractionTargetRef,
} from "../../model/interaction-owner-state";
import { projectExplicitInteractionOwners } from "./explicit-owner-projection";

const blockOwner: InteractionTargetRef = {
  id: "block-a",
  kind: InteractionTargetKind.Block,
  pos: 4,
};
const gridOwner: InteractionTargetRef = {
  id: "grid-a",
  kind: InteractionTargetKind.Grid,
  pos: 8,
};
const layoutOwner: InteractionTargetRef = {
  id: "layout-a",
  kind: InteractionTargetKind.Layout,
  pos: 12,
};
const gestureOwner: InteractionTargetRef = {
  kind: InteractionTargetKind.Field,
  pos: 18,
};

describe("projectExplicitInteractionOwners", () => {
  it("defaults explicit, menu, settings, and gesture owners to null", () => {
    expect(projectExplicitInteractionOwners()).toEqual({
      explicitOwner: null,
      gestureOwner: null,
      menuOwner: null,
      settingsOwner: null,
    });
  });

  it("projects explicit owner options without exposing old target names", () => {
    const owners = projectExplicitInteractionOwners({
      explicitOwner: blockOwner,
      gestureOwner,
      menuOwner: gridOwner,
      settingsOwner: layoutOwner,
    });

    expect(owners).toEqual({
      explicitOwner: blockOwner,
      gestureOwner,
      menuOwner: gridOwner,
      settingsOwner: layoutOwner,
    });
    expect("activeTarget" in owners).toBe(false);
    expect("targetType" in owners.explicitOwner!).toBe(false);
  });

  it("canonicalizes target refs instead of returning caller-owned objects", () => {
    const owners = projectExplicitInteractionOwners({
      explicitOwner: blockOwner,
    });

    expect(owners.explicitOwner).toEqual(blockOwner);
    expect(owners.explicitOwner).not.toBe(blockOwner);
  });

  it("drops unstable refs that have neither stable id nor position", () => {
    expect(
      projectExplicitInteractionOwners({
        explicitOwner: { kind: InteractionTargetKind.Block },
        menuOwner: { kind: InteractionTargetKind.Grid },
        settingsOwner: { kind: InteractionTargetKind.Layout },
      }),
    ).toEqual({
      explicitOwner: null,
      gestureOwner: null,
      menuOwner: null,
      settingsOwner: null,
    });
  });
});
