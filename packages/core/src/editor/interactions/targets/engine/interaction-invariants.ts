import {
  type InteractionContextOwners,
  type InteractionEngineInput,
  type InteractionTargetPolicy,
  type InteractionTargetRef,
  sameInteractionTarget,
} from "../model/interaction-owner-state";

export function applyInteractionEngineInvariants(
  input: InteractionEngineInput,
): InteractionEngineInput {
  const objectSelectedTarget = normalizeObjectSelectedTarget(input);

  return {
    ...input,
    contextOwner: normalizeOwnerTarget(input, input.contextOwner),
    contextOwners: normalizeContextOwners(input),
    explicitOwner: normalizeOwnerTarget(input, input.explicitOwner),
    gestureOwner: normalizeOwnerTarget(input, input.gestureOwner),
    menuOwner: normalizeOwnerTarget(input, input.menuOwner),
    selection: {
      ...input.selection,
      objectSelectedTarget,
    },
    selectionOwner: normalizeSelectionOwner(input),
    settingsOwner: normalizeOwnerTarget(input, input.settingsOwner),
  };
}

export function isInteractionTargetValid(
  input: InteractionEngineInput,
  target: InteractionTargetRef | null,
): boolean {
  return Boolean(target && findTargetPolicy(input, target));
}

function normalizeContextOwners(input: InteractionEngineInput): InteractionContextOwners {
  return {
    cell: normalizeOwnerTarget(input, input.contextOwners.cell),
    grid: normalizeOwnerTarget(input, input.contextOwners.grid),
    layout: normalizeOwnerTarget(input, input.contextOwners.layout),
    region: normalizeOwnerTarget(input, input.contextOwners.region),
    section: normalizeOwnerTarget(input, input.contextOwners.section),
    surface: normalizeOwnerTarget(input, input.contextOwners.surface),
  };
}

function normalizeOwnerTarget(
  input: InteractionEngineInput,
  target: InteractionTargetRef | null,
): InteractionTargetRef | null {
  return isInteractionTargetValid(input, target) ? target : null;
}

function normalizeSelectionOwner(input: InteractionEngineInput): InteractionTargetRef | null {
  const target = normalizeOwnerTarget(input, input.selectionOwner);

  if (!target) {
    return null;
  }

  return input.selection.objectSelectedTarget &&
    sameInteractionTarget(input.selection.objectSelectedTarget, target) &&
    deniesObjectSelection(input, target)
    ? null
    : target;
}

function normalizeObjectSelectedTarget(input: InteractionEngineInput): InteractionTargetRef | null {
  const target = normalizeOwnerTarget(input, input.selection.objectSelectedTarget);

  if (!target) {
    return null;
  }

  return deniesObjectSelection(input, target) ? null : target;
}

function deniesObjectSelection(
  input: InteractionEngineInput,
  target: InteractionTargetRef,
): boolean {
  const policy = findTargetPolicy(input, target);

  return Boolean(
    !policy?.objectSelectable || (policy.isStructuralContainer && !policy.keyboardObjectActions),
  );
}

function findTargetPolicy(
  input: InteractionEngineInput,
  target: InteractionTargetRef,
): InteractionTargetPolicy | null {
  return (
    input.targetPolicies.find((policy) => sameInteractionTarget(policy.target, target)) ?? null
  );
}
