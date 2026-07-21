import type { ScaffoldBlockContext } from "@/editor/selection/block-context";

import {
  InteractionEmbeddedChildSelection,
  InteractionTargetKind,
  createInteractionTargetPolicy,
  type InteractionTargetPolicy,
} from "../../model/interaction-owner-state";
import {
  projectBlockTargetRef,
  projectStructuralTargetRef,
  type StructuralTargetRefInput,
} from "./target-ref-projection";

export interface StructuralTargetPolicyInput extends StructuralTargetRefInput {
  supportsSettings?: boolean;
}

export function projectBlockTargetPolicy(
  blockContext: ScaffoldBlockContext,
): InteractionTargetPolicy {
  return createInteractionTargetPolicy({
    embeddedChildSelection:
      blockContext.definition.interaction?.embeddedChildSelection === "delegate-to-parent"
        ? InteractionEmbeddedChildSelection.DelegateToParent
        : InteractionEmbeddedChildSelection.Independent,
    keyboardObjectActions: true,
    objectSelectable: true,
    supportsBlockBubble: true,
    supportsMovement: true,
    supportsOutline: true,
    supportsResize: blockContext.definition.frame?.resizable === true,
    supportsSettings: Boolean(blockContext.definition.settingsSheet),
    target: projectBlockTargetRef(blockContext),
  });
}

export function projectStructuralTargetPolicy(
  input: StructuralTargetPolicyInput,
): InteractionTargetPolicy {
  return createInteractionTargetPolicy({
    isStructuralContainer: true,
    keyboardObjectActions: false,
    objectSelectable: false,
    supportsArrangementMenu: true,
    supportsMovement: supportsStructuralMovement(input.kind),
    supportsOutline: supportsStructuralOutline(input.kind),
    supportsSettings: input.supportsSettings === true,
    target: projectStructuralTargetRef(input),
  });
}

function supportsStructuralMovement(kind: StructuralTargetRefInput["kind"]): boolean {
  return kind === InteractionTargetKind.Layout || kind === InteractionTargetKind.Section;
}

function supportsStructuralOutline(kind: StructuralTargetRefInput["kind"]): boolean {
  return kind !== InteractionTargetKind.Section;
}
