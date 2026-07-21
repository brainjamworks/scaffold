import { describe, expect, it } from "vite-plus/test";

import {
  EMPTY_INTERACTION_CONTEXT_OWNERS,
  InteractionOwnerSource,
  InteractionTargetKind,
  createEmptyInteractionOwnerSnapshot,
  createInteractionOwner,
  createInteractionTargetRef,
  resolveEffectiveInteractionOwner,
  sameInteractionTarget,
} from "./interaction-owner-state";

describe("interaction owner state factories", () => {
  it("allocates independent empty owner and context objects", () => {
    const first = createEmptyInteractionOwnerSnapshot();
    const second = createEmptyInteractionOwnerSnapshot();

    expect(first.owners.contextOwner).not.toBe(second.owners.contextOwner);
    expect(first.owners.contextOwners).not.toBe(second.owners.contextOwners);
    expect(first.owners.effectiveOwner).not.toBe(second.owners.effectiveOwner);
    expect(first.owners.explicitOwner).not.toBe(second.owners.explicitOwner);
    expect(first.owners.gestureOwner).not.toBe(second.owners.gestureOwner);
    expect(first.owners.menuOwner).not.toBe(second.owners.menuOwner);
    expect(first.owners.selectionOwner).not.toBe(second.owners.selectionOwner);
    expect(first.owners.settingsOwner).not.toBe(second.owners.settingsOwner);
  });

  it("resolves a live context owner above selection owners", () => {
    const contextTarget = createInteractionTargetRef({
      id: "block-a",
      kind: InteractionTargetKind.Block,
      pos: 4,
    });
    const selectionTarget = createInteractionTargetRef({
      id: "block-b",
      kind: InteractionTargetKind.Block,
      pos: 9,
    });
    const surfaceTarget = createInteractionTargetRef({
      id: "surface-a",
      kind: InteractionTargetKind.Surface,
      pos: 1,
    });

    expect(
      resolveEffectiveInteractionOwner({
        contextOwner: createInteractionOwner(InteractionOwnerSource.Context, contextTarget),
        contextOwners: {
          ...EMPTY_INTERACTION_CONTEXT_OWNERS,
          surface: surfaceTarget,
        },
        explicitOwner: createInteractionOwner(InteractionOwnerSource.Explicit, null),
        gestureOwner: createInteractionOwner(InteractionOwnerSource.Gesture, null),
        menuOwner: createInteractionOwner(InteractionOwnerSource.Menu, null),
        selectionOwner: createInteractionOwner(InteractionOwnerSource.Selection, selectionTarget),
        settingsOwner: createInteractionOwner(InteractionOwnerSource.Settings, null),
      }),
    ).toEqual({
      source: InteractionOwnerSource.Context,
      target: contextTarget,
    });
  });

  it("resolves explicit owners above the live context owner", () => {
    const contextTarget = createInteractionTargetRef({
      id: "block-a",
      kind: InteractionTargetKind.Block,
      pos: 4,
    });
    const explicitTarget = createInteractionTargetRef({
      id: "cell-a",
      kind: InteractionTargetKind.Cell,
      pos: 3,
    });

    expect(
      resolveEffectiveInteractionOwner({
        contextOwner: createInteractionOwner(InteractionOwnerSource.Context, contextTarget),
        contextOwners: { ...EMPTY_INTERACTION_CONTEXT_OWNERS },
        explicitOwner: createInteractionOwner(InteractionOwnerSource.Explicit, explicitTarget),
        gestureOwner: createInteractionOwner(InteractionOwnerSource.Gesture, null),
        menuOwner: createInteractionOwner(InteractionOwnerSource.Menu, null),
        selectionOwner: createInteractionOwner(InteractionOwnerSource.Selection, null),
        settingsOwner: createInteractionOwner(InteractionOwnerSource.Settings, null),
      }),
    ).toEqual({
      source: InteractionOwnerSource.Explicit,
      target: explicitTarget,
    });
  });

  it("requires a stable target identity before refs can match", () => {
    expect(
      sameInteractionTarget(
        createInteractionTargetRef({ kind: InteractionTargetKind.Block }),
        createInteractionTargetRef({ kind: InteractionTargetKind.Block }),
      ),
    ).toBe(false);
    expect(
      sameInteractionTarget(
        createInteractionTargetRef({
          kind: InteractionTargetKind.Block,
          pos: 4,
        }),
        createInteractionTargetRef({
          kind: InteractionTargetKind.Block,
          pos: 4,
        }),
      ),
    ).toBe(true);
    expect(
      sameInteractionTarget(
        createInteractionTargetRef({
          id: "block-a",
          kind: InteractionTargetKind.Block,
        }),
        createInteractionTargetRef({
          id: "block-a",
          kind: InteractionTargetKind.Block,
        }),
      ),
    ).toBe(true);
  });
});
