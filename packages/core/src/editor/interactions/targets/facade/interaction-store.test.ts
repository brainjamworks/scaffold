import { describe, expect, it, vi } from "vite-plus/test";

import {
  InteractionActivationIntentKind,
  InteractionChromeSlotReason,
  InteractionEmbeddedChildSelection,
  InteractionOwnerSource,
  InteractionSelectionMode,
  InteractionTargetKind,
  createInteractionActivationIntent,
  createInteractionChromeSlot,
  createInteractionEngineInput,
  createInteractionOwnerSnapshot,
  createInteractionTargetPolicy,
  createInteractionTargetRef,
} from "../model/interaction-owner-state";
import { createInteractionStore } from "./interaction-store";

describe("targets interaction facade", () => {
  it("starts with the final app-facing empty snapshot shape", () => {
    const store = createInteractionStore();
    const { snapshot } = store.getState();

    expect(snapshot.selection).toEqual({
      mode: InteractionSelectionMode.OtherSelection,
      objectSelectedTarget: null,
      range: {
        empty: true,
        from: 0,
        to: 0,
      },
    });
    expect("owner" in snapshot.selection).toBe(false);
    expect(snapshot.owners.effectiveOwner).toEqual({
      source: InteractionOwnerSource.None,
      target: null,
    });
    expect(snapshot.chromeSlots.blockBubble).toEqual({
      reason: InteractionChromeSlotReason.MissingTarget,
      target: null,
      visible: false,
    });
  });

  it("resolves effective owner priority without reading current targets", () => {
    const contextTarget = createInteractionTargetRef({
      id: "surface-a",
      kind: InteractionTargetKind.Surface,
      pos: 1,
    });
    const selectionTarget = createInteractionTargetRef({
      id: "block-a",
      kind: InteractionTargetKind.Block,
      pos: 4,
    });
    const explicitTarget = createInteractionTargetRef({
      id: "cell-a",
      kind: InteractionTargetKind.Cell,
      pos: 3,
    });
    const menuTarget = createInteractionTargetRef({
      id: "layout-a",
      kind: InteractionTargetKind.Layout,
      pos: 2,
    });
    const settingsTarget = createInteractionTargetRef({
      id: "section-a",
      kind: InteractionTargetKind.Section,
      pos: 8,
    });

    expect(
      createInteractionOwnerSnapshot({
        contextOwners: { surface: contextTarget },
        explicitOwner: explicitTarget,
        menuOwner: menuTarget,
        selectionOwner: selectionTarget,
        settingsOwner: settingsTarget,
      }).owners.effectiveOwner,
    ).toEqual({
      source: InteractionOwnerSource.Settings,
      target: settingsTarget,
    });

    expect(
      createInteractionOwnerSnapshot({
        contextOwners: { surface: contextTarget },
        explicitOwner: explicitTarget,
        selectionOwner: selectionTarget,
      }).owners.effectiveOwner,
    ).toEqual({
      source: InteractionOwnerSource.Explicit,
      target: explicitTarget,
    });
  });

  it("can represent structural owner suppressing child chrome", () => {
    const structuralTarget = createInteractionTargetRef({
      id: "cell-a",
      kind: InteractionTargetKind.Cell,
      pos: 3,
    });
    const childTarget = createInteractionTargetRef({
      id: "block-a",
      kind: InteractionTargetKind.Block,
      pos: 4,
    });

    const snapshot = createInteractionOwnerSnapshot({
      chromeSlots: {
        blockBubble: createInteractionChromeSlot({
          reason: InteractionChromeSlotReason.SuppressedByExplicitOwner,
        }),
        outline: createInteractionChromeSlot({
          reason: InteractionChromeSlotReason.Allowed,
          target: structuralTarget,
          visible: true,
        }),
        resizeHandles: createInteractionChromeSlot({
          reason: InteractionChromeSlotReason.SuppressedByExplicitOwner,
        }),
      },
      explicitOwner: structuralTarget,
      selection: {
        mode: InteractionSelectionMode.TextCaret,
        objectSelectedTarget: null,
      },
      selectionOwner: childTarget,
    });

    expect(snapshot.owners.effectiveOwner).toEqual({
      source: InteractionOwnerSource.Explicit,
      target: structuralTarget,
    });
    expect(snapshot.owners.selectionOwner).toEqual({
      source: InteractionOwnerSource.Selection,
      target: childTarget,
    });
    expect(snapshot.chromeSlots.blockBubble.visible).toBe(false);
    expect(snapshot.chromeSlots.resizeHandles.visible).toBe(false);
    expect(snapshot.chromeSlots.outline).toMatchObject({
      target: structuralTarget,
      visible: true,
    });
  });

  it("publishes snapshots without deriving authority inside the facade store", () => {
    const store = createInteractionStore();
    const blockTarget = createInteractionTargetRef({
      id: "block-a",
      kind: InteractionTargetKind.Block,
      pos: 4,
    });
    const snapshot = createInteractionOwnerSnapshot({
      selection: {
        mode: InteractionSelectionMode.TextCaret,
      },
      selectionOwner: blockTarget,
    });

    store.getState().publishSnapshot(snapshot);

    expect(store.getState().snapshot).toBe(snapshot);
  });

  it("represents engine input separately from published snapshots", () => {
    const target = createInteractionTargetRef({
      id: "quiz-a",
      kind: InteractionTargetKind.Block,
      pos: 8,
    });
    const activationIntent = createInteractionActivationIntent({
      kind: InteractionActivationIntentKind.ObjectShell,
      target,
    });
    const policy = createInteractionTargetPolicy({
      embeddedChildSelection: InteractionEmbeddedChildSelection.DelegateToParent,
      keyboardObjectActions: true,
      objectSelectable: true,
      supportsBlockBubble: true,
      supportsMovement: true,
      supportsResize: true,
      target,
    });

    const input = createInteractionEngineInput({
      activationIntent,
      selection: {
        mode: InteractionSelectionMode.NodeSelection,
        objectSelectedTarget: target,
        range: {
          empty: false,
          from: 8,
          to: 9,
        },
      },
      selectionOwner: target,
      targetPolicies: [policy],
    });

    expect(input.activationIntent).toBe(activationIntent);
    expect(input.selection).toEqual({
      mode: InteractionSelectionMode.NodeSelection,
      objectSelectedTarget: target,
      range: {
        empty: false,
        from: 8,
        to: 9,
      },
    });
    expect(input.targetPolicies).toEqual([policy]);
  });

  it("exposes intent command ports without making the facade the source of truth", () => {
    const target = createInteractionTargetRef({
      id: "layout-a",
      kind: InteractionTargetKind.Layout,
      pos: 2,
    });
    const activateStructuralTarget = vi.fn(() => true);
    const enterEditableContent = vi.fn(() => true);
    const toggleMenu = vi.fn(() => true);
    const store = createInteractionStore({
      commandPorts: {
        activateStructuralTarget,
        enterEditableContent,
        toggleMenu,
      },
    });

    expect(store.getState().commands.activateStructuralTarget(target)).toBe(true);
    expect(store.getState().commands.enterEditableContent()).toBe(true);
    expect(store.getState().commands.toggleMenu(target)).toBe(true);
    expect(activateStructuralTarget).toHaveBeenCalledWith(target);
    expect(enterEditableContent).toHaveBeenCalledWith();
    expect(toggleMenu).toHaveBeenCalledWith(target);

    store.getState().replaceCommandPorts({});

    expect(store.getState().commands.activateStructuralTarget(target)).toBe(false);
    expect(store.getState().commands.enterEditableContent()).toBe(false);
    expect(store.getState().commands.toggleMenu(target)).toBe(false);
  });
});
