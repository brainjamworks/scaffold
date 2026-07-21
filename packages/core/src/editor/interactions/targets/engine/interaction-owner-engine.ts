import {
  createInteractionOwnerSnapshot,
  type InteractionEngineInput,
  type InteractionOwnerSnapshot,
} from "../model/interaction-owner-state";
import { resolveInteractionChromeSlots } from "./chrome-slot-policy";
import { applyInteractionEngineInvariants } from "./interaction-invariants";
import { applyInteractionOwnerLifecycle } from "./owner-lifecycle";

export function resolveInteractionOwnerSnapshot(
  input: InteractionEngineInput,
): InteractionOwnerSnapshot {
  const lifecycleInput = applyInteractionOwnerLifecycle(input);
  const invariantInput = applyInteractionEngineInvariants(lifecycleInput);
  const snapshot = createInteractionOwnerSnapshot({
    contextOwner: invariantInput.contextOwner,
    contextOwners: invariantInput.contextOwners,
    explicitOwner: invariantInput.explicitOwner,
    gestureOwner: invariantInput.gestureOwner,
    menuOwner: invariantInput.menuOwner,
    selection: invariantInput.selection,
    selectionOwner: invariantInput.selectionOwner,
    settingsOwner: invariantInput.settingsOwner,
  });

  return {
    ...snapshot,
    chromeSlots: resolveInteractionChromeSlots(invariantInput, snapshot.owners),
  };
}
