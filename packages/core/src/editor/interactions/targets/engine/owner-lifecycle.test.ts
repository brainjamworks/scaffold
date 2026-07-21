import { describe, expect, it } from "vite-plus/test";

import {
  InteractionActivationIntentKind,
  InteractionTargetKind,
  createInteractionActivationIntent,
  createInteractionEngineInput,
  createInteractionTargetRef,
} from "../model/interaction-owner-state";
import { applyInteractionOwnerLifecycle } from "./owner-lifecycle";

describe("applyInteractionOwnerLifecycle", () => {
  const structuralTarget = createInteractionTargetRef({
    id: "cell-a",
    kind: InteractionTargetKind.Cell,
    pos: 3,
  });
  const blockTarget = createInteractionTargetRef({
    id: "block-a",
    kind: InteractionTargetKind.Block,
    pos: 4,
  });
  const menuTarget = createInteractionTargetRef({
    id: "layout-a",
    kind: InteractionTargetKind.Layout,
    pos: 5,
  });
  const settingsTarget = createInteractionTargetRef({
    id: "section-a",
    kind: InteractionTargetKind.Section,
    pos: 6,
  });
  const gestureTarget = createInteractionTargetRef({
    id: "grid-a",
    kind: InteractionTargetKind.Grid,
    pos: 7,
  });

  it("clears explicit owner for authored editable content activation", () => {
    const input = createInteractionEngineInput({
      activationIntent: createInteractionActivationIntent({
        kind: InteractionActivationIntentKind.AuthoredEditableContent,
      }),
      explicitOwner: structuralTarget,
      selectionOwner: blockTarget,
    });

    expect(applyInteractionOwnerLifecycle(input)).toMatchObject({
      explicitOwner: null,
      selectionOwner: blockTarget,
    });
  });

  it("sets explicit owner for blank structural space activation with a target", () => {
    const input = createInteractionEngineInput({
      activationIntent: createInteractionActivationIntent({
        kind: InteractionActivationIntentKind.BlankStructuralSpace,
        target: structuralTarget,
      }),
      selectionOwner: blockTarget,
    });

    expect(applyInteractionOwnerLifecycle(input)).toMatchObject({
      explicitOwner: structuralTarget,
      selectionOwner: blockTarget,
    });
  });

  it("sets explicit owner for explicit chrome activation with a target", () => {
    const input = createInteractionEngineInput({
      activationIntent: createInteractionActivationIntent({
        kind: InteractionActivationIntentKind.ExplicitChrome,
        target: structuralTarget,
      }),
    });

    expect(applyInteractionOwnerLifecycle(input).explicitOwner).toBe(structuralTarget);
  });

  it("does not set object shell activation as explicit structural ownership", () => {
    const input = createInteractionEngineInput({
      activationIntent: createInteractionActivationIntent({
        kind: InteractionActivationIntentKind.ObjectShell,
        target: blockTarget,
      }),
      explicitOwner: structuralTarget,
      selectionOwner: blockTarget,
    });

    expect(applyInteractionOwnerLifecycle(input)).toMatchObject({
      explicitOwner: null,
      selectionOwner: blockTarget,
    });
  });

  it("clears ephemeral owners for outside editor activation", () => {
    const input = createInteractionEngineInput({
      activationIntent: createInteractionActivationIntent({
        kind: InteractionActivationIntentKind.OutsideEditor,
      }),
      explicitOwner: structuralTarget,
      gestureOwner: gestureTarget,
      menuOwner: menuTarget,
      selectionOwner: blockTarget,
      settingsOwner: settingsTarget,
    });

    expect(applyInteractionOwnerLifecycle(input)).toMatchObject({
      explicitOwner: null,
      gestureOwner: null,
      menuOwner: null,
      selectionOwner: blockTarget,
      settingsOwner: null,
    });
  });

  it("leaves owner refs unchanged for ignored interactive activation", () => {
    const input = createInteractionEngineInput({
      activationIntent: createInteractionActivationIntent({
        kind: InteractionActivationIntentKind.IgnoredInteractive,
        target: blockTarget,
      }),
      explicitOwner: structuralTarget,
      gestureOwner: gestureTarget,
      menuOwner: menuTarget,
      selectionOwner: blockTarget,
      settingsOwner: settingsTarget,
    });

    expect(applyInteractionOwnerLifecycle(input)).toEqual(input);
  });

  it("does not mutate the original input object", () => {
    const input = createInteractionEngineInput({
      activationIntent: createInteractionActivationIntent({
        kind: InteractionActivationIntentKind.AuthoredEditableContent,
      }),
      explicitOwner: structuralTarget,
    });

    const nextInput = applyInteractionOwnerLifecycle(input);

    expect(nextInput).not.toBe(input);
    expect(input.explicitOwner).toBe(structuralTarget);
    expect(nextInput.explicitOwner).toBeNull();
  });
});
