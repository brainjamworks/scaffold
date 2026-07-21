import { describe, expect, it } from "vite-plus/test";

import {
  InteractionChromeSlotReason,
  InteractionOwnerSource,
  InteractionSelectionMode,
  InteractionTargetKind,
  createInteractionEngineInput,
  createInteractionOwnerSnapshot,
  createInteractionTargetPolicy,
  createInteractionTargetRef,
} from "../model/interaction-owner-state";
import { resolveInteractionChromeSlots } from "./chrome-slot-policy";

describe("resolveInteractionChromeSlots", () => {
  it("shows regular block editing chrome from target policy", () => {
    const blockTarget = createInteractionTargetRef({
      id: "block-a",
      kind: InteractionTargetKind.Block,
      pos: 4,
    });
    const input = createInteractionEngineInput({
      selection: {
        mode: InteractionSelectionMode.TextCaret,
      },
      selectionOwner: blockTarget,
      targetPolicies: [
        createInteractionTargetPolicy({
          supportsBlockBubble: true,
          supportsMovement: true,
          supportsResize: true,
          target: blockTarget,
        }),
      ],
    });
    const owners = createInteractionOwnerSnapshot({
      selectionOwner: blockTarget,
    }).owners;

    const slots = resolveInteractionChromeSlots(input, owners);

    expect(slots.blockBubble).toEqual({
      reason: InteractionChromeSlotReason.Allowed,
      target: blockTarget,
      visible: true,
    });
    expect(slots.resizeHandles).toEqual({
      reason: InteractionChromeSlotReason.Allowed,
      target: blockTarget,
      visible: true,
    });
    expect(slots.movementHandle).toEqual({
      reason: InteractionChromeSlotReason.Allowed,
      target: blockTarget,
      visible: true,
    });
  });

  it("suppresses child block chrome without opening menus while structural explicit owner is active", () => {
    const cellTarget = createInteractionTargetRef({
      id: "cell-a",
      kind: InteractionTargetKind.Cell,
      pos: 3,
    });
    const blockTarget = createInteractionTargetRef({
      id: "block-a",
      kind: InteractionTargetKind.Block,
      pos: 4,
    });
    const input = createInteractionEngineInput({
      explicitOwner: cellTarget,
      selection: {
        mode: InteractionSelectionMode.TextCaret,
      },
      selectionOwner: blockTarget,
      targetPolicies: [
        createInteractionTargetPolicy({
          isStructuralContainer: true,
          supportsArrangementMenu: true,
          supportsOutline: true,
          target: cellTarget,
        }),
        createInteractionTargetPolicy({
          supportsBlockBubble: true,
          supportsMovement: true,
          supportsResize: true,
          target: blockTarget,
        }),
      ],
    });
    const owners = createInteractionOwnerSnapshot({
      explicitOwner: cellTarget,
      selectionOwner: blockTarget,
    }).owners;

    const slots = resolveInteractionChromeSlots(input, owners);

    expect(slots.blockBubble).toEqual({
      reason: InteractionChromeSlotReason.SuppressedByExplicitOwner,
      target: null,
      visible: false,
    });
    expect(slots.resizeHandles).toEqual({
      reason: InteractionChromeSlotReason.SuppressedByExplicitOwner,
      target: null,
      visible: false,
    });
    expect(slots.movementHandle).toEqual({
      reason: InteractionChromeSlotReason.SuppressedByExplicitOwner,
      target: null,
      visible: false,
    });
    expect(slots.arrangementMenu).toEqual({
      reason: InteractionChromeSlotReason.MissingTarget,
      target: null,
      visible: false,
    });
    expect(slots.outline).toEqual({
      reason: InteractionChromeSlotReason.Allowed,
      target: cellTarget,
      visible: true,
    });
  });

  it("keeps slots unavailable when the target policy is missing", () => {
    const blockTarget = createInteractionTargetRef({
      id: "block-a",
      kind: InteractionTargetKind.Block,
      pos: 4,
    });
    const input = createInteractionEngineInput({
      selectionOwner: blockTarget,
      targetPolicies: [],
    });
    const owners = createInteractionOwnerSnapshot({
      selectionOwner: blockTarget,
    }).owners;

    const slots = resolveInteractionChromeSlots(input, owners);

    expect(slots.blockBubble).toEqual({
      reason: InteractionChromeSlotReason.Unavailable,
      target: blockTarget,
      visible: false,
    });
    expect(slots.resizeHandles).toEqual({
      reason: InteractionChromeSlotReason.Unavailable,
      target: blockTarget,
      visible: false,
    });
    expect(slots.movementHandle).toEqual({
      reason: InteractionChromeSlotReason.Unavailable,
      target: blockTarget,
      visible: false,
    });
  });

  it("hides selection-owned block chrome when the authoring session is inactive", () => {
    const blockTarget = createInteractionTargetRef({
      id: "block-a",
      kind: InteractionTargetKind.Block,
      pos: 4,
    });
    const input = createInteractionEngineInput({
      authoringChromeSessionActive: false,
      selection: {
        mode: InteractionSelectionMode.TextCaret,
      },
      selectionOwner: blockTarget,
      targetPolicies: [
        createInteractionTargetPolicy({
          supportsBlockBubble: true,
          supportsMovement: true,
          supportsResize: true,
          target: blockTarget,
        }),
      ],
    });
    const owners = createInteractionOwnerSnapshot({
      selectionOwner: blockTarget,
    }).owners;

    const slots = resolveInteractionChromeSlots(input, owners);

    expect(slots.blockBubble).toEqual({
      reason: InteractionChromeSlotReason.InactiveAuthoringSession,
      target: blockTarget,
      visible: false,
    });
    expect(slots.resizeHandles).toEqual({
      reason: InteractionChromeSlotReason.InactiveAuthoringSession,
      target: blockTarget,
      visible: false,
    });
    expect(slots.movementHandle).toEqual({
      reason: InteractionChromeSlotReason.InactiveAuthoringSession,
      target: blockTarget,
      visible: false,
    });
  });

  it("keeps field and insertion chrome unavailable until projection models their targets", () => {
    const blockTarget = createInteractionTargetRef({
      id: "block-a",
      kind: InteractionTargetKind.Block,
      pos: 4,
    });
    const input = createInteractionEngineInput({
      selectionOwner: blockTarget,
      targetPolicies: [
        createInteractionTargetPolicy({
          supportsFieldControls: true,
          target: blockTarget,
        }),
      ],
    });
    const owners = createInteractionOwnerSnapshot({
      selectionOwner: blockTarget,
    }).owners;

    const slots = resolveInteractionChromeSlots(input, owners);

    expect(slots.fieldControls).toEqual({
      reason: InteractionChromeSlotReason.MissingTarget,
      target: null,
      visible: false,
    });
    expect(slots.insertionRow).toEqual({
      reason: InteractionChromeSlotReason.MissingTarget,
      target: null,
      visible: false,
    });
  });

  it("publishes the structural movement handle for a layout explicit owner", () => {
    const layoutTarget = createInteractionTargetRef({
      id: "layout-a",
      kind: InteractionTargetKind.Layout,
      pos: 2,
    });
    const blockTarget = createInteractionTargetRef({
      id: "block-a",
      kind: InteractionTargetKind.Block,
      pos: 6,
    });
    const input = createInteractionEngineInput({
      explicitOwner: layoutTarget,
      selection: {
        mode: InteractionSelectionMode.TextCaret,
      },
      selectionOwner: blockTarget,
      targetPolicies: [
        createInteractionTargetPolicy({
          isStructuralContainer: true,
          supportsArrangementMenu: true,
          supportsMovement: true,
          supportsOutline: true,
          target: layoutTarget,
        }),
        createInteractionTargetPolicy({
          supportsBlockBubble: true,
          supportsMovement: true,
          supportsResize: true,
          target: blockTarget,
        }),
      ],
    });
    const owners = createInteractionOwnerSnapshot({
      explicitOwner: layoutTarget,
      selectionOwner: blockTarget,
    }).owners;

    const slots = resolveInteractionChromeSlots(input, owners);

    expect(slots.movementHandle).toEqual({
      reason: InteractionChromeSlotReason.Allowed,
      target: layoutTarget,
      visible: true,
    });
    expect(slots.blockBubble).toEqual({
      reason: InteractionChromeSlotReason.SuppressedByExplicitOwner,
      target: null,
      visible: false,
    });
    expect(slots.resizeHandles).toEqual({
      reason: InteractionChromeSlotReason.SuppressedByExplicitOwner,
      target: null,
      visible: false,
    });
    expect(slots.arrangementMenu).toEqual({
      reason: InteractionChromeSlotReason.MissingTarget,
      target: null,
      visible: false,
    });
  });

  it("keeps the structural movement handle published while its gesture is active", () => {
    const layoutTarget = createInteractionTargetRef({
      id: "layout-a",
      kind: InteractionTargetKind.Layout,
      pos: 2,
    });
    const input = createInteractionEngineInput({
      gestureOwner: layoutTarget,
      targetPolicies: [
        createInteractionTargetPolicy({
          isStructuralContainer: true,
          supportsArrangementMenu: true,
          supportsMovement: true,
          target: layoutTarget,
        }),
      ],
    });
    const owners = createInteractionOwnerSnapshot({
      gestureOwner: layoutTarget,
    }).owners;

    const slots = resolveInteractionChromeSlots(input, owners);

    expect(slots.movementHandle).toEqual({
      reason: InteractionChromeSlotReason.Allowed,
      target: layoutTarget,
      visible: true,
    });
  });

  it("hides the structural movement handle when the authoring session is inactive", () => {
    const layoutTarget = createInteractionTargetRef({
      id: "layout-a",
      kind: InteractionTargetKind.Layout,
      pos: 2,
    });
    const input = createInteractionEngineInput({
      authoringChromeSessionActive: false,
      explicitOwner: layoutTarget,
      targetPolicies: [
        createInteractionTargetPolicy({
          isStructuralContainer: true,
          supportsMovement: true,
          target: layoutTarget,
        }),
      ],
    });
    const owners = createInteractionOwnerSnapshot({
      explicitOwner: layoutTarget,
    }).owners;

    const slots = resolveInteractionChromeSlots(input, owners);

    expect(slots.movementHandle).toEqual({
      reason: InteractionChromeSlotReason.InactiveAuthoringSession,
      target: layoutTarget,
      visible: false,
    });
  });

  it("keeps block movement selection-owned when the explicit owner is a non-movement structural container", () => {
    const cellTarget = createInteractionTargetRef({
      id: "cell-a",
      kind: InteractionTargetKind.Cell,
      pos: 3,
    });
    const blockTarget = createInteractionTargetRef({
      id: "block-a",
      kind: InteractionTargetKind.Block,
      pos: 4,
    });
    const input = createInteractionEngineInput({
      explicitOwner: cellTarget,
      selectionOwner: blockTarget,
      targetPolicies: [
        createInteractionTargetPolicy({
          isStructuralContainer: true,
          supportsArrangementMenu: true,
          target: cellTarget,
        }),
        createInteractionTargetPolicy({
          supportsMovement: true,
          target: blockTarget,
        }),
      ],
    });
    const owners = createInteractionOwnerSnapshot({
      explicitOwner: cellTarget,
      selectionOwner: blockTarget,
    }).owners;

    const slots = resolveInteractionChromeSlots(input, owners);

    expect(slots.movementHandle).toEqual({
      reason: InteractionChromeSlotReason.SuppressedByExplicitOwner,
      target: null,
      visible: false,
    });
  });

  it("keeps the section outline unavailable while a section explicit owner is active", () => {
    const sectionTarget = createInteractionTargetRef({
      id: "section-a",
      kind: InteractionTargetKind.Section,
      pos: 5,
    });
    const input = createInteractionEngineInput({
      explicitOwner: sectionTarget,
      targetPolicies: [
        createInteractionTargetPolicy({
          isStructuralContainer: true,
          supportsArrangementMenu: true,
          supportsMovement: true,
          supportsOutline: false,
          supportsResize: false,
          target: sectionTarget,
        }),
      ],
    });
    const owners = createInteractionOwnerSnapshot({
      explicitOwner: sectionTarget,
    }).owners;

    const slots = resolveInteractionChromeSlots(input, owners);

    expect(slots.outline).toEqual({
      reason: InteractionChromeSlotReason.Unavailable,
      target: sectionTarget,
      visible: false,
    });
    expect(slots.resizeHandles).toEqual({
      reason: InteractionChromeSlotReason.MissingTarget,
      target: null,
      visible: false,
    });
    expect(slots.arrangementMenu).toEqual({
      reason: InteractionChromeSlotReason.MissingTarget,
      target: null,
      visible: false,
    });
    expect(slots.movementHandle).toEqual({
      reason: InteractionChromeSlotReason.Allowed,
      target: sectionTarget,
      visible: true,
    });
  });

  it("drives block chrome from a live block context owner over stale selection", () => {
    const contextBlock = createInteractionTargetRef({
      id: "block-a",
      kind: InteractionTargetKind.Block,
      pos: 4,
    });
    const staleSelectionBlock = createInteractionTargetRef({
      id: "block-b",
      kind: InteractionTargetKind.Block,
      pos: 9,
    });
    const input = createInteractionEngineInput({
      contextOwner: contextBlock,
      selection: {
        mode: InteractionSelectionMode.TextCaret,
      },
      selectionOwner: staleSelectionBlock,
      targetPolicies: [
        createInteractionTargetPolicy({
          supportsBlockBubble: true,
          supportsMovement: true,
          supportsResize: true,
          target: contextBlock,
        }),
        createInteractionTargetPolicy({
          supportsBlockBubble: true,
          supportsMovement: true,
          supportsResize: true,
          target: staleSelectionBlock,
        }),
      ],
    });
    const owners = createInteractionOwnerSnapshot({
      contextOwner: contextBlock,
      selectionOwner: staleSelectionBlock,
    }).owners;

    const slots = resolveInteractionChromeSlots(input, owners);

    expect(slots.blockBubble).toEqual({
      reason: InteractionChromeSlotReason.Allowed,
      target: contextBlock,
      visible: true,
    });
    expect(slots.resizeHandles).toEqual({
      reason: InteractionChromeSlotReason.Allowed,
      target: contextBlock,
      visible: true,
    });
    expect(slots.movementHandle).toEqual({
      reason: InteractionChromeSlotReason.Allowed,
      target: contextBlock,
      visible: true,
    });
  });

  it("hides context-owned block chrome when the authoring session is inactive", () => {
    const contextBlock = createInteractionTargetRef({
      id: "block-a",
      kind: InteractionTargetKind.Block,
      pos: 4,
    });
    const input = createInteractionEngineInput({
      authoringChromeSessionActive: false,
      contextOwner: contextBlock,
      targetPolicies: [
        createInteractionTargetPolicy({
          supportsBlockBubble: true,
          supportsMovement: true,
          supportsResize: true,
          target: contextBlock,
        }),
      ],
    });
    const owners = createInteractionOwnerSnapshot({
      contextOwner: contextBlock,
    }).owners;

    const slots = resolveInteractionChromeSlots(input, owners);

    expect(slots.blockBubble).toEqual({
      reason: InteractionChromeSlotReason.InactiveAuthoringSession,
      target: contextBlock,
      visible: false,
    });
    expect(slots.resizeHandles).toEqual({
      reason: InteractionChromeSlotReason.InactiveAuthoringSession,
      target: contextBlock,
      visible: false,
    });
    expect(slots.movementHandle).toEqual({
      reason: InteractionChromeSlotReason.InactiveAuthoringSession,
      target: contextBlock,
      visible: false,
    });
  });

  it("drives outline and movement from a structural context owner without opening menus", () => {
    const layoutTarget = createInteractionTargetRef({
      id: "layout-a",
      kind: InteractionTargetKind.Layout,
      pos: 2,
    });
    const staleSelectionBlock = createInteractionTargetRef({
      id: "block-b",
      kind: InteractionTargetKind.Block,
      pos: 9,
    });
    const input = createInteractionEngineInput({
      contextOwner: layoutTarget,
      selection: {
        mode: InteractionSelectionMode.TextCaret,
      },
      selectionOwner: staleSelectionBlock,
      targetPolicies: [
        createInteractionTargetPolicy({
          isStructuralContainer: true,
          supportsArrangementMenu: true,
          supportsMovement: true,
          supportsOutline: true,
          target: layoutTarget,
        }),
        createInteractionTargetPolicy({
          supportsBlockBubble: true,
          supportsMovement: true,
          supportsResize: true,
          target: staleSelectionBlock,
        }),
      ],
    });
    const owners = createInteractionOwnerSnapshot({
      contextOwner: layoutTarget,
      selectionOwner: staleSelectionBlock,
    }).owners;

    const slots = resolveInteractionChromeSlots(input, owners);

    expect(slots.outline).toEqual({
      reason: InteractionChromeSlotReason.Allowed,
      target: layoutTarget,
      visible: true,
    });
    expect(slots.movementHandle).toEqual({
      reason: InteractionChromeSlotReason.Allowed,
      target: layoutTarget,
      visible: true,
    });
    expect(slots.arrangementMenu).toEqual({
      reason: InteractionChromeSlotReason.MissingTarget,
      target: null,
      visible: false,
    });
    expect(slots.blockBubble).toEqual({
      reason: InteractionChromeSlotReason.SuppressedByExplicitOwner,
      target: null,
      visible: false,
    });
    expect(slots.resizeHandles).toEqual({
      reason: InteractionChromeSlotReason.SuppressedByExplicitOwner,
      target: null,
      visible: false,
    });
  });

  it("hides a structural outline when the authoring session is inactive", () => {
    const layoutTarget = createInteractionTargetRef({
      id: "layout-a",
      kind: InteractionTargetKind.Layout,
      pos: 2,
    });
    const input = createInteractionEngineInput({
      authoringChromeSessionActive: false,
      contextOwner: layoutTarget,
      targetPolicies: [
        createInteractionTargetPolicy({
          isStructuralContainer: true,
          supportsOutline: true,
          target: layoutTarget,
        }),
      ],
    });
    const owners = createInteractionOwnerSnapshot({
      contextOwner: layoutTarget,
    }).owners;

    expect(resolveInteractionChromeSlots(input, owners).outline).toEqual({
      reason: InteractionChromeSlotReason.InactiveAuthoringSession,
      target: layoutTarget,
      visible: false,
    });
  });

  it("keeps gesture, menu, and explicit structural movement above context movement", () => {
    const menuLayout = createInteractionTargetRef({
      id: "layout-a",
      kind: InteractionTargetKind.Layout,
      pos: 2,
    });
    const contextGrid = createInteractionTargetRef({
      id: "grid-a",
      kind: InteractionTargetKind.Grid,
      pos: 6,
    });
    const input = createInteractionEngineInput({
      contextOwner: contextGrid,
      menuOwner: menuLayout,
      targetPolicies: [
        createInteractionTargetPolicy({
          isStructuralContainer: true,
          supportsArrangementMenu: true,
          supportsMovement: true,
          target: menuLayout,
        }),
        createInteractionTargetPolicy({
          isStructuralContainer: true,
          supportsMovement: true,
          target: contextGrid,
        }),
      ],
    });
    const owners = createInteractionOwnerSnapshot({
      contextOwner: contextGrid,
      menuOwner: menuLayout,
    }).owners;

    const slots = resolveInteractionChromeSlots(input, owners);

    expect(slots.movementHandle).toEqual({
      reason: InteractionChromeSlotReason.Allowed,
      target: menuLayout,
      visible: true,
    });
  });

  it("keeps the arrangement menu closed for selection and context owners alone", () => {
    const layoutTarget = createInteractionTargetRef({
      id: "layout-a",
      kind: InteractionTargetKind.Layout,
      pos: 2,
    });
    const input = createInteractionEngineInput({
      contextOwners: { layout: layoutTarget },
      selectionOwner: layoutTarget,
      targetPolicies: [
        createInteractionTargetPolicy({
          isStructuralContainer: true,
          supportsArrangementMenu: true,
          supportsOutline: true,
          target: layoutTarget,
        }),
      ],
    });
    const owners = createInteractionOwnerSnapshot({
      contextOwners: { layout: layoutTarget },
      selectionOwner: layoutTarget,
    }).owners;

    const slots = resolveInteractionChromeSlots(input, owners);

    expect(slots.arrangementMenu).toEqual({
      reason: InteractionChromeSlotReason.MissingTarget,
      target: null,
      visible: false,
    });
    expect(slots.outline).toEqual({
      reason: InteractionChromeSlotReason.Allowed,
      target: layoutTarget,
      visible: true,
    });
  });

  it("opens the arrangement menu only from a menu owner", () => {
    const layoutTarget = createInteractionTargetRef({
      id: "layout-a",
      kind: InteractionTargetKind.Layout,
      pos: 2,
    });
    const input = createInteractionEngineInput({
      menuOwner: layoutTarget,
      targetPolicies: [
        createInteractionTargetPolicy({
          isStructuralContainer: true,
          supportsArrangementMenu: true,
          target: layoutTarget,
        }),
      ],
    });
    const owners = createInteractionOwnerSnapshot({
      menuOwner: layoutTarget,
    }).owners;

    const slots = resolveInteractionChromeSlots(input, owners);

    expect(slots.arrangementMenu).toEqual({
      reason: InteractionChromeSlotReason.Allowed,
      target: layoutTarget,
      visible: true,
    });
  });

  it("returns missing target when no owner can drive a slot", () => {
    const input = createInteractionEngineInput();
    const owners = createInteractionOwnerSnapshot().owners;

    const slots = resolveInteractionChromeSlots(input, owners);

    expect(slots.blockBubble).toEqual({
      reason: InteractionChromeSlotReason.MissingTarget,
      target: null,
      visible: false,
    });
    expect(owners.effectiveOwner).toEqual({
      source: InteractionOwnerSource.None,
      target: null,
    });
  });
});
