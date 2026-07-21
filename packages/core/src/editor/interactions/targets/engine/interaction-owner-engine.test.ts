import { describe, expect, it } from "vite-plus/test";

import {
  InteractionActivationIntentKind,
  InteractionChromeSlotReason,
  InteractionOwnerSource,
  InteractionSelectionMode,
  InteractionTargetKind,
  createInteractionActivationIntent,
  createEmptyInteractionOwnerSnapshot,
  createInteractionEngineInput,
  createInteractionTargetPolicy,
  createInteractionTargetRef,
} from "../model/interaction-owner-state";
import { isInteractionTargetValid } from "./interaction-invariants";
import { resolveInteractionOwnerSnapshot } from "./interaction-owner-engine";

describe("resolveInteractionOwnerSnapshot", () => {
  it("resolves empty engine input to the empty owner snapshot shape", () => {
    expect(resolveInteractionOwnerSnapshot(createInteractionEngineInput())).toEqual(
      createEmptyInteractionOwnerSnapshot(),
    );
  });

  it("copies ProseMirror-only selection facts into the snapshot", () => {
    const objectSelectedTarget = createInteractionTargetRef({
      id: "block-a",
      kind: InteractionTargetKind.Block,
      pos: 7,
    });

    const snapshot = resolveInteractionOwnerSnapshot(
      createInteractionEngineInput({
        selection: {
          mode: InteractionSelectionMode.NodeSelection,
          objectSelectedTarget,
          range: {
            empty: false,
            from: 7,
            to: 8,
          },
        },
        targetPolicies: [
          createInteractionTargetPolicy({
            keyboardObjectActions: true,
            objectSelectable: true,
            target: objectSelectedTarget,
          }),
        ],
      }),
    );

    expect(snapshot.selection).toEqual({
      mode: InteractionSelectionMode.NodeSelection,
      objectSelectedTarget,
      range: {
        empty: false,
        from: 7,
        to: 8,
      },
    });
    expect("owner" in snapshot.selection).toBe(false);
  });

  it("resolves owner priority through the engine", () => {
    const contextOwner = createInteractionTargetRef({
      id: "surface-a",
      kind: InteractionTargetKind.Surface,
      pos: 1,
    });
    const selectionOwner = createInteractionTargetRef({
      id: "block-a",
      kind: InteractionTargetKind.Block,
      pos: 4,
    });
    const explicitOwner = createInteractionTargetRef({
      id: "cell-a",
      kind: InteractionTargetKind.Cell,
      pos: 3,
    });
    const menuOwner = createInteractionTargetRef({
      id: "layout-a",
      kind: InteractionTargetKind.Layout,
      pos: 2,
    });
    const settingsOwner = createInteractionTargetRef({
      id: "section-a",
      kind: InteractionTargetKind.Section,
      pos: 8,
    });
    const gestureOwner = createInteractionTargetRef({
      id: "grid-a",
      kind: InteractionTargetKind.Grid,
      pos: 5,
    });

    const withoutGesture = resolveInteractionOwnerSnapshot(
      createInteractionEngineInput({
        contextOwners: { surface: contextOwner },
        explicitOwner,
        menuOwner,
        selectionOwner,
        settingsOwner,
        targetPolicies: [
          createInteractionTargetPolicy({ target: contextOwner }),
          createInteractionTargetPolicy({ target: selectionOwner }),
          createInteractionTargetPolicy({ target: explicitOwner }),
          createInteractionTargetPolicy({ target: menuOwner }),
          createInteractionTargetPolicy({ target: settingsOwner }),
          createInteractionTargetPolicy({ target: gestureOwner }),
        ],
      }),
    );
    const withGesture = resolveInteractionOwnerSnapshot(
      createInteractionEngineInput({
        contextOwners: { surface: contextOwner },
        explicitOwner,
        gestureOwner,
        menuOwner,
        selectionOwner,
        settingsOwner,
        targetPolicies: [
          createInteractionTargetPolicy({ target: contextOwner }),
          createInteractionTargetPolicy({ target: selectionOwner }),
          createInteractionTargetPolicy({ target: explicitOwner }),
          createInteractionTargetPolicy({ target: menuOwner }),
          createInteractionTargetPolicy({ target: settingsOwner }),
          createInteractionTargetPolicy({ target: gestureOwner }),
        ],
      }),
    );

    expect(withoutGesture.owners.effectiveOwner).toEqual({
      source: InteractionOwnerSource.Settings,
      target: settingsOwner,
    });
    expect(withGesture.owners.effectiveOwner).toEqual({
      source: InteractionOwnerSource.Gesture,
      target: gestureOwner,
    });
  });

  it("resolves a live context owner above stale selection owners", () => {
    const contextOwner = createInteractionTargetRef({
      id: "block-a",
      kind: InteractionTargetKind.Block,
      pos: 4,
    });
    const selectionOwner = createInteractionTargetRef({
      id: "block-b",
      kind: InteractionTargetKind.Block,
      pos: 9,
    });
    const surfaceContext = createInteractionTargetRef({
      id: "surface-a",
      kind: InteractionTargetKind.Surface,
      pos: 1,
    });

    const snapshot = resolveInteractionOwnerSnapshot(
      createInteractionEngineInput({
        contextOwner,
        contextOwners: { surface: surfaceContext },
        selectionOwner,
        targetPolicies: [
          createInteractionTargetPolicy({ target: contextOwner }),
          createInteractionTargetPolicy({ target: selectionOwner }),
          createInteractionTargetPolicy({ target: surfaceContext }),
        ],
      }),
    );

    expect(snapshot.owners.contextOwner).toEqual({
      source: InteractionOwnerSource.Context,
      target: contextOwner,
    });
    expect(snapshot.owners.effectiveOwner).toEqual({
      source: InteractionOwnerSource.Context,
      target: contextOwner,
    });
    expect(snapshot.owners.selectionOwner).toEqual({
      source: InteractionOwnerSource.Selection,
      target: selectionOwner,
    });
  });

  it("keeps explicit, menu, settings, and gesture owners above the live context owner", () => {
    const contextOwner = createInteractionTargetRef({
      id: "block-a",
      kind: InteractionTargetKind.Block,
      pos: 4,
    });
    const explicitOwner = createInteractionTargetRef({
      id: "cell-a",
      kind: InteractionTargetKind.Cell,
      pos: 3,
    });

    const snapshot = resolveInteractionOwnerSnapshot(
      createInteractionEngineInput({
        contextOwner,
        explicitOwner,
        targetPolicies: [
          createInteractionTargetPolicy({ target: contextOwner }),
          createInteractionTargetPolicy({ target: explicitOwner }),
        ],
      }),
    );

    expect(snapshot.owners.effectiveOwner).toEqual({
      source: InteractionOwnerSource.Explicit,
      target: explicitOwner,
    });
    expect(snapshot.owners.contextOwner).toEqual({
      source: InteractionOwnerSource.Context,
      target: contextOwner,
    });
  });

  it("drops a live context owner without a valid target policy", () => {
    const contextOwner = createInteractionTargetRef({
      id: "block-a",
      kind: InteractionTargetKind.Block,
      pos: 4,
    });
    const selectionOwner = createInteractionTargetRef({
      id: "block-b",
      kind: InteractionTargetKind.Block,
      pos: 9,
    });

    const snapshot = resolveInteractionOwnerSnapshot(
      createInteractionEngineInput({
        contextOwner,
        selectionOwner,
        targetPolicies: [createInteractionTargetPolicy({ target: selectionOwner })],
      }),
    );

    expect(snapshot.owners.contextOwner).toEqual({
      source: InteractionOwnerSource.None,
      target: null,
    });
    expect(snapshot.owners.effectiveOwner).toEqual({
      source: InteractionOwnerSource.Selection,
      target: selectionOwner,
    });
  });

  it("applies activation lifecycle before resolving the effective owner", () => {
    const explicitOwner = createInteractionTargetRef({
      id: "cell-a",
      kind: InteractionTargetKind.Cell,
      pos: 3,
    });
    const selectionOwner = createInteractionTargetRef({
      id: "block-a",
      kind: InteractionTargetKind.Block,
      pos: 4,
    });

    const snapshot = resolveInteractionOwnerSnapshot(
      createInteractionEngineInput({
        activationIntent: createInteractionActivationIntent({
          kind: InteractionActivationIntentKind.AuthoredEditableContent,
        }),
        explicitOwner,
        selectionOwner,
        targetPolicies: [createInteractionTargetPolicy({ target: selectionOwner })],
      }),
    );

    expect(snapshot.owners.explicitOwner).toEqual({
      source: InteractionOwnerSource.None,
      target: null,
    });
    expect(snapshot.owners.effectiveOwner).toEqual({
      source: InteractionOwnerSource.Selection,
      target: selectionOwner,
    });
  });

  it("drops owners that do not have a valid target policy", () => {
    const selectionOwner = createInteractionTargetRef({
      id: "block-a",
      kind: InteractionTargetKind.Block,
      pos: 4,
    });

    const snapshot = resolveInteractionOwnerSnapshot(
      createInteractionEngineInput({
        selectionOwner,
        targetPolicies: [],
      }),
    );

    expect(snapshot.owners.selectionOwner).toEqual({
      source: InteractionOwnerSource.None,
      target: null,
    });
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

  it("does not publish keyboard object target semantics for structural policy denial", () => {
    const structuralTarget = createInteractionTargetRef({
      id: "cell-a",
      kind: InteractionTargetKind.Cell,
      pos: 3,
    });

    const snapshot = resolveInteractionOwnerSnapshot(
      createInteractionEngineInput({
        selection: {
          mode: InteractionSelectionMode.NodeSelection,
          objectSelectedTarget: structuralTarget,
        },
        selectionOwner: structuralTarget,
        targetPolicies: [
          createInteractionTargetPolicy({
            isStructuralContainer: true,
            keyboardObjectActions: false,
            target: structuralTarget,
          }),
        ],
      }),
    );

    expect(snapshot.selection).toEqual({
      mode: InteractionSelectionMode.NodeSelection,
      objectSelectedTarget: null,
      range: {
        empty: true,
        from: 0,
        to: 0,
      },
    });
    expect(snapshot.owners.selectionOwner).toEqual({
      source: InteractionOwnerSource.None,
      target: null,
    });
  });

  it("does not publish object selection when the target policy is not object-selectable", () => {
    const blockTarget = createInteractionTargetRef({
      id: "block-a",
      kind: InteractionTargetKind.Block,
      pos: 4,
    });

    const snapshot = resolveInteractionOwnerSnapshot(
      createInteractionEngineInput({
        selection: {
          mode: InteractionSelectionMode.NodeSelection,
          objectSelectedTarget: blockTarget,
        },
        selectionOwner: blockTarget,
        targetPolicies: [
          createInteractionTargetPolicy({
            keyboardObjectActions: true,
            objectSelectable: false,
            target: blockTarget,
          }),
        ],
      }),
    );

    expect(snapshot.selection.objectSelectedTarget).toBe(null);
    expect(snapshot.owners.selectionOwner).toEqual({
      source: InteractionOwnerSource.None,
      target: null,
    });
  });

  it("does not match target policies through identityless same-kind refs", () => {
    const blockTarget = createInteractionTargetRef({
      kind: InteractionTargetKind.Block,
    });

    const snapshot = resolveInteractionOwnerSnapshot(
      createInteractionEngineInput({
        selectionOwner: blockTarget,
        targetPolicies: [
          createInteractionTargetPolicy({
            supportsBlockBubble: true,
            target: blockTarget,
          }),
        ],
      }),
    );

    expect(snapshot.owners.selectionOwner).toEqual({
      source: InteractionOwnerSource.None,
      target: null,
    });
    expect(snapshot.chromeSlots.blockBubble).toEqual({
      reason: InteractionChromeSlotReason.MissingTarget,
      target: null,
      visible: false,
    });
  });

  it("exposes a pure target-validity hook point for later document existence checks", () => {
    const blockTarget = createInteractionTargetRef({
      id: "block-a",
      kind: InteractionTargetKind.Block,
      pos: 4,
    });
    const input = createInteractionEngineInput({
      targetPolicies: [
        createInteractionTargetPolicy({
          target: blockTarget,
        }),
      ],
    });

    expect(isInteractionTargetValid(input, null)).toBe(false);
    expect(isInteractionTargetValid(input, blockTarget)).toBe(true);
    expect(
      isInteractionTargetValid(
        input,
        createInteractionTargetRef({
          id: "block-b",
          kind: InteractionTargetKind.Block,
          pos: 8,
        }),
      ),
    ).toBe(false);
  });
});
