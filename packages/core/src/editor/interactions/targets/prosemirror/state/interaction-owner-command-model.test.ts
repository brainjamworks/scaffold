import { describe, expect, it } from "vite-plus/test";

import {
  InteractionOwnerCommandKind,
  isInteractionOwnerCommandMeta,
} from "./interaction-owner-command-model";

describe("InteractionOwnerCommandKind", () => {
  it("uses exactly the interaction command names", () => {
    expect(Object.values(InteractionOwnerCommandKind).sort()).toEqual([
      "activateContextOwner",
      "activateStructuralTarget",
      "beginGesture",
      "dismissInteraction",
      "endGesture",
      "enterEditableContent",
      "openMenu",
      "openSettings",
      "selectObjectTarget",
      "toggleMenu",
    ]);
  });
});

describe("isInteractionOwnerCommandMeta", () => {
  it("accepts targeted interaction command metas", () => {
    expect(
      isInteractionOwnerCommandMeta({
        kind: InteractionOwnerCommandKind.ActivateStructuralTarget,
        target: { id: "cell-a", kind: "cell" },
      }),
    ).toBe(true);
    expect(
      isInteractionOwnerCommandMeta({
        kind: InteractionOwnerCommandKind.OpenMenu,
        target: { kind: "grid", pos: 4 },
      }),
    ).toBe(true);
    expect(
      isInteractionOwnerCommandMeta({
        kind: InteractionOwnerCommandKind.ToggleMenu,
        target: { kind: "grid", pos: 4 },
      }),
    ).toBe(true);
    expect(
      isInteractionOwnerCommandMeta({
        kind: InteractionOwnerCommandKind.ActivateContextOwner,
        target: { id: "block-a", kind: "block" },
      }),
    ).toBe(true);
  });

  it("accepts enterEditableContent metas that carry a context owner", () => {
    expect(
      isInteractionOwnerCommandMeta({
        contextOwner: { id: "block-a", kind: "block" },
        kind: InteractionOwnerCommandKind.EnterEditableContent,
      }),
    ).toBe(true);
    expect(
      isInteractionOwnerCommandMeta({
        contextOwner: null,
        kind: InteractionOwnerCommandKind.EnterEditableContent,
      }),
    ).toBe(true);
    expect(
      isInteractionOwnerCommandMeta({
        contextOwner: "block-a",
        kind: InteractionOwnerCommandKind.EnterEditableContent,
      }),
    ).toBe(false);
  });

  it("accepts untargeted interaction command metas", () => {
    expect(
      isInteractionOwnerCommandMeta({
        kind: InteractionOwnerCommandKind.DismissInteraction,
      }),
    ).toBe(true);
    expect(
      isInteractionOwnerCommandMeta({
        kind: InteractionOwnerCommandKind.EndGesture,
      }),
    ).toBe(true);
    expect(
      isInteractionOwnerCommandMeta({
        kind: InteractionOwnerCommandKind.EnterEditableContent,
      }),
    ).toBe(true);
  });

  it("rejects old command names and junk values", () => {
    expect(isInteractionOwnerCommandMeta({ type: "set-active-target" })).toBe(false);
    expect(isInteractionOwnerCommandMeta({ kind: "set-active-target" })).toBe(false);
    expect(isInteractionOwnerCommandMeta(null)).toBe(false);
    expect(isInteractionOwnerCommandMeta(undefined)).toBe(false);
    expect(isInteractionOwnerCommandMeta("openMenu")).toBe(false);
  });
});
