import {
  createInteractionTargetRef,
  type InteractionTargetRef,
} from "../../model/interaction-owner-state";

export interface ExplicitInteractionOwnerProjectionOptions {
  explicitOwner?: InteractionTargetRef | null;
  gestureOwner?: InteractionTargetRef | null;
  menuOwner?: InteractionTargetRef | null;
  settingsOwner?: InteractionTargetRef | null;
}

export interface ProjectedExplicitInteractionOwners {
  explicitOwner: InteractionTargetRef | null;
  gestureOwner: InteractionTargetRef | null;
  menuOwner: InteractionTargetRef | null;
  settingsOwner: InteractionTargetRef | null;
}

export function projectExplicitInteractionOwners(
  options: ExplicitInteractionOwnerProjectionOptions = {},
): ProjectedExplicitInteractionOwners {
  return {
    explicitOwner: projectExplicitOwnerRef(options.explicitOwner),
    gestureOwner: projectExplicitOwnerRef(options.gestureOwner),
    menuOwner: projectExplicitOwnerRef(options.menuOwner),
    settingsOwner: projectExplicitOwnerRef(options.settingsOwner),
  };
}

function projectExplicitOwnerRef(
  target: InteractionTargetRef | null | undefined,
): InteractionTargetRef | null {
  if (!target) return null;
  const ref = createInteractionTargetRef(target);
  return hasStableTargetIdentity(ref) ? ref : null;
}

function hasStableTargetIdentity(target: InteractionTargetRef): boolean {
  return Boolean(target.id) || Number.isInteger(target.pos);
}
