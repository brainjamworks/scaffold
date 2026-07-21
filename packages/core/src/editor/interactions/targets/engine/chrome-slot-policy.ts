import {
  InteractionChromeSlotReason,
  createEmptyInteractionOwnerSnapshot,
  createInteractionChromeSlot,
  type InteractionChromeSlot,
  type InteractionChromeSlots,
  type InteractionEngineInput,
  type InteractionOwnerState,
  type InteractionTargetPolicy,
  type InteractionTargetRef,
  sameInteractionTarget,
} from "../model/interaction-owner-state";

type TargetPolicyCapability =
  | "supportsArrangementMenu"
  | "supportsBlockBubble"
  | "supportsMovement"
  | "supportsOutline"
  | "supportsResize"
  | "supportsSettings";

export function resolveInteractionChromeSlots(
  input: InteractionEngineInput,
  owners: InteractionOwnerState,
): InteractionChromeSlots {
  const emptySlots = createEmptyInteractionOwnerSnapshot().chromeSlots;
  const blockChromeOwnerTarget = resolveBlockChromeOwnerTarget(input, owners);
  const blockChromeSuppressed = isBlockChromeSuppressedByStructuralOwner(
    input,
    owners,
    blockChromeOwnerTarget,
  );

  return {
    ...emptySlots,
    // Menus are click-to-open: structural activation can drive outline,
    // triggers, and movement handles, but the menu bubble requires menuOwner.
    arrangementMenu: resolvePolicySlot(input, owners.menuOwner.target, "supportsArrangementMenu"),
    blockBubble: blockChromeSuppressed
      ? createSuppressedSlot()
      : resolvePolicySlot(input, blockChromeOwnerTarget, "supportsBlockBubble", {
          requiresActiveAuthoringSession: true,
        }),
    // TODO(targets projection): resolve these from explicit field and
    // insertion targets once projection models them separately from selection.
    fieldControls: createInteractionChromeSlot(),
    insertionRow: createInteractionChromeSlot(),
    movementHandle: resolveMovementHandleSlot(
      input,
      owners,
      blockChromeOwnerTarget,
      blockChromeSuppressed,
    ),
    outline: resolvePolicySlot(input, owners.effectiveOwner.target, "supportsOutline", {
      requiresActiveAuthoringSession: true,
    }),
    resizeHandles: blockChromeSuppressed
      ? createSuppressedSlot()
      : resolvePolicySlot(input, blockChromeOwnerTarget, "supportsResize", {
          requiresActiveAuthoringSession: true,
        }),
    settingsSheet: resolvePolicySlot(input, owners.settingsOwner.target, "supportsSettings"),
  };
}

function resolvePolicySlot(
  input: InteractionEngineInput,
  target: InteractionTargetRef | null,
  capability: TargetPolicyCapability,
  options: { requiresActiveAuthoringSession?: boolean } = {},
): InteractionChromeSlot {
  if (!target) {
    return createInteractionChromeSlot();
  }

  const policy = findTargetPolicy(input.targetPolicies, target);

  if (!policy?.[capability]) {
    return createInteractionChromeSlot({
      reason: InteractionChromeSlotReason.Unavailable,
      target,
    });
  }

  if (options.requiresActiveAuthoringSession === true && !input.authoringChromeSessionActive) {
    return createInteractionChromeSlot({
      reason: InteractionChromeSlotReason.InactiveAuthoringSession,
      target,
    });
  }

  return createInteractionChromeSlot({
    reason: InteractionChromeSlotReason.Allowed,
    target,
    visible: true,
  });
}

function resolveMovementHandleSlot(
  input: InteractionEngineInput,
  owners: InteractionOwnerState,
  blockChromeOwnerTarget: InteractionTargetRef | null,
  blockChromeSuppressed: boolean,
): InteractionChromeSlot {
  const structuralSlot = resolveStructuralMovementSlot(input, owners);
  if (structuralSlot) return structuralSlot;

  return blockChromeSuppressed
    ? createSuppressedSlot()
    : resolvePolicySlot(input, blockChromeOwnerTarget, "supportsMovement", {
        requiresActiveAuthoringSession: true,
      });
}

function resolveStructuralMovementSlot(
  input: InteractionEngineInput,
  owners: InteractionOwnerState,
): InteractionChromeSlot | null {
  const candidate =
    owners.gestureOwner.target ?? owners.menuOwner.target ?? owners.explicitOwner.target;
  const candidateSlot = candidate ? resolveStructuralMovementSlotForTarget(input, candidate) : null;
  if (candidateSlot) return candidateSlot;

  return owners.contextOwner.target
    ? resolveStructuralMovementSlotForTarget(input, owners.contextOwner.target)
    : null;
}

function resolveStructuralMovementSlotForTarget(
  input: InteractionEngineInput,
  target: InteractionTargetRef,
): InteractionChromeSlot | null {
  const policy = findTargetPolicy(input.targetPolicies, target);
  if (!policy?.isStructuralContainer || !policy.supportsMovement) {
    return null;
  }

  return resolvePolicySlot(input, target, "supportsMovement", {
    requiresActiveAuthoringSession: true,
  });
}

function createSuppressedSlot(): InteractionChromeSlot {
  return createInteractionChromeSlot({
    reason: InteractionChromeSlotReason.SuppressedByExplicitOwner,
  });
}

function resolveBlockChromeOwnerTarget(
  input: InteractionEngineInput,
  owners: InteractionOwnerState,
): InteractionTargetRef | null {
  const contextTarget = owners.contextOwner.target;
  const contextPolicy = contextTarget
    ? findTargetPolicy(input.targetPolicies, contextTarget)
    : null;

  return contextPolicy && !contextPolicy.isStructuralContainer
    ? contextTarget
    : owners.selectionOwner.target;
}

function isBlockChromeSuppressedByStructuralOwner(
  input: InteractionEngineInput,
  owners: InteractionOwnerState,
  blockChromeOwnerTarget: InteractionTargetRef | null,
): boolean {
  if (!blockChromeOwnerTarget) {
    return false;
  }

  const suppressor =
    structuralPolicyTarget(input, owners.explicitOwner.target) ??
    structuralPolicyTarget(input, owners.contextOwner.target);

  if (!suppressor) {
    return false;
  }

  return !sameInteractionTarget(suppressor, blockChromeOwnerTarget);
}

function structuralPolicyTarget(
  input: InteractionEngineInput,
  target: InteractionTargetRef | null,
): InteractionTargetRef | null {
  return target && findTargetPolicy(input.targetPolicies, target)?.isStructuralContainer
    ? target
    : null;
}

function findTargetPolicy(
  policies: readonly InteractionTargetPolicy[],
  target: InteractionTargetRef,
): InteractionTargetPolicy | null {
  return policies.find((policy) => sameInteractionTarget(policy.target, target)) ?? null;
}
