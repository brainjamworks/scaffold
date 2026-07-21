import type { EditorState } from "@tiptap/pm/state";

import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import { resolveCourseSelectionProjection } from "@/editor/selection/course-selection-projection";

import {
  createInteractionEngineInput,
  createInteractionTargetPolicy,
  InteractionEmbeddedChildSelection,
  InteractionTargetKind,
  createInteractionTargetRef,
  sameInteractionTarget,
  type InteractionActivationIntent,
  type InteractionEngineInput,
  type InteractionTargetPolicy,
  type InteractionTargetRef,
} from "../../model/interaction-owner-state";
import {
  projectInteractionContextOwnerPoliciesForTarget,
  projectInteractionContextOwnerPolicies,
  projectInteractionContextOwnersForTarget,
  projectInteractionContextOwners,
} from "./context-owner-projection";
import {
  projectExplicitInteractionOwners,
  type ExplicitInteractionOwnerProjectionOptions,
} from "./explicit-owner-projection";
import { projectInteractionSelectionInput } from "./selection-input-projection";
import { resolveBlockChromeTargetDescriptor } from "./block-chrome-target-projection";
import { resolveStructuralChromeTargetDescriptor } from "./structural-chrome-target-projection";
import { projectBlockTargetRef } from "./target-ref-projection";
import { projectBlockTargetPolicy } from "./target-policy-projection";

export interface ProjectInteractionEngineInputOptions extends ExplicitInteractionOwnerProjectionOptions {
  activationIntent?: InteractionActivationIntent | null;
  authoringChromeSessionActive?: boolean;
  blockDefinitions: BlockDefinitionLookup;
  contextOwner?: InteractionTargetRef | null;
}

export function projectInteractionEngineInput(
  state: EditorState,
  options: ProjectInteractionEngineInputOptions,
): InteractionEngineInput {
  const selectionProjection = resolveCourseSelectionProjection(
    state.selection,
    options.blockDefinitions,
  );
  const explicitOwners = projectExplicitInteractionOwners(options);
  const contextOwner = resolveLiveContextOwnerRef(
    state,
    options.contextOwner,
    options.blockDefinitions,
  );
  const contextOwners =
    projectInteractionContextOwnersForTarget(state, contextOwner) ??
    projectInteractionContextOwners(state.selection);
  const contextOwnerPolicies =
    projectInteractionContextOwnerPoliciesForTarget(state, contextOwner) ??
    projectInteractionContextOwnerPolicies(state.selection);
  const targetPolicies = createTargetPolicySet([
    ...blockPoliciesForSelection(selectionProjection),
    ...blockPoliciesForOwnerRef(state, contextOwner, options.blockDefinitions),
    ...contextOwnerPolicies,
    ...fallbackPoliciesForOwnerRefs(
      { target: explicitOwners.explicitOwner },
      { target: explicitOwners.gestureOwner },
      { target: explicitOwners.menuOwner },
      { supportsSettings: true, target: explicitOwners.settingsOwner },
      { target: contextOwner },
      { target: options.activationIntent?.target },
    ),
  ]);

  return createInteractionEngineInput({
    activationIntent: options.activationIntent ?? null,
    authoringChromeSessionActive: options.authoringChromeSessionActive ?? true,
    contextOwner,
    contextOwners,
    explicitOwner: explicitOwners.explicitOwner,
    gestureOwner: explicitOwners.gestureOwner,
    menuOwner: explicitOwners.menuOwner,
    selection: projectInteractionSelectionInput(state.selection, options.blockDefinitions),
    selectionOwner: selectionProjection.selectionOwnerBlock
      ? projectBlockTargetRef(selectionProjection.selectionOwnerBlock)
      : null,
    settingsOwner: explicitOwners.settingsOwner,
    targetPolicies,
  });
}

function blockPoliciesForOwnerRef(
  state: EditorState,
  target: InteractionTargetRef | null,
  blockDefinitions: BlockDefinitionLookup,
): InteractionTargetPolicy[] {
  const descriptor = resolveBlockChromeTargetDescriptor(state, target, blockDefinitions);
  if (!descriptor) return [];

  return [
    projectBlockTargetPolicy({
      definition: descriptor.definition,
      node: descriptor.node,
      nodeType: descriptor.nodeType,
      pos: descriptor.pos,
    }),
  ];
}

function resolveLiveContextOwnerRef(
  state: EditorState,
  target: InteractionTargetRef | null | undefined,
  blockDefinitions: BlockDefinitionLookup,
): InteractionTargetRef | null {
  if (!target) return null;
  const ref = createInteractionTargetRef(target);
  if (!hasStableTargetIdentity(ref)) return null;

  if (ref.kind === InteractionTargetKind.Block) {
    return resolveBlockChromeTargetDescriptor(state, ref, blockDefinitions)?.target ?? null;
  }

  if (ref.kind === InteractionTargetKind.Field) return null;

  return resolveStructuralChromeTargetDescriptor(state, ref)?.target ?? null;
}

function blockPoliciesForSelection(
  selectionProjection: ReturnType<typeof resolveCourseSelectionProjection>,
): InteractionTargetPolicy[] {
  const policies: InteractionTargetPolicy[] = [];

  if (selectionProjection.objectSelectedBlock) {
    policies.push(projectBlockTargetPolicy(selectionProjection.objectSelectedBlock));
  }
  if (selectionProjection.selectionOwnerBlock) {
    policies.push(projectBlockTargetPolicy(selectionProjection.selectionOwnerBlock));
  }

  return policies;
}

function fallbackPoliciesForOwnerRefs(
  ...items: Array<{
    supportsSettings?: boolean;
    target: InteractionTargetRef | null | undefined;
  }>
): InteractionTargetPolicy[] {
  return items.flatMap((item) => {
    const policy = item.target
      ? fallbackPolicyForRef(item.target, {
          supportsSettings: item.supportsSettings === true,
        })
      : null;
    return policy ? [policy] : [];
  });
}

function fallbackPolicyForRef(
  target: InteractionTargetRef,
  options: { supportsSettings?: boolean } = {},
): InteractionTargetPolicy | null {
  if (!hasStableTargetIdentity(target)) return null;

  if (target.kind === InteractionTargetKind.Block) {
    return createInteractionTargetPolicy({
      keyboardObjectActions: true,
      objectSelectable: true,
      supportsBlockBubble: true,
      supportsMovement: true,
      supportsOutline: true,
      supportsSettings: options.supportsSettings === true,
      target,
    });
  }

  if (target.kind === InteractionTargetKind.Field) {
    return createInteractionTargetPolicy({
      supportsFieldControls: true,
      supportsSettings: options.supportsSettings === true,
      target,
    });
  }

  return createInteractionTargetPolicy({
    embeddedChildSelection: InteractionEmbeddedChildSelection.Independent,
    isStructuralContainer: true,
    keyboardObjectActions: false,
    objectSelectable: false,
    supportsArrangementMenu: true,
    supportsMovement:
      target.kind === InteractionTargetKind.Layout || target.kind === InteractionTargetKind.Section,
    supportsOutline: target.kind !== InteractionTargetKind.Section,
    supportsSettings: options.supportsSettings === true,
    target,
  });
}

function createTargetPolicySet(
  policies: readonly InteractionTargetPolicy[],
): readonly InteractionTargetPolicy[] {
  const out: InteractionTargetPolicy[] = [];

  for (const policy of policies) {
    const index = out.findIndex((existing) =>
      sameInteractionTarget(existing.target, policy.target),
    );
    if (index >= 0) {
      out[index] = mergeInteractionTargetPolicies(out[index]!, policy);
      continue;
    }
    out.push(policy);
  }

  return out;
}

function hasStableTargetIdentity(target: InteractionTargetRef): boolean {
  return Boolean(target.id) || Number.isInteger(target.pos);
}

function mergeInteractionTargetPolicies(
  left: InteractionTargetPolicy,
  right: InteractionTargetPolicy,
): InteractionTargetPolicy {
  return createInteractionTargetPolicy({
    embeddedChildSelection:
      left.embeddedChildSelection === InteractionEmbeddedChildSelection.DelegateToParent ||
      right.embeddedChildSelection === InteractionEmbeddedChildSelection.DelegateToParent
        ? InteractionEmbeddedChildSelection.DelegateToParent
        : InteractionEmbeddedChildSelection.Independent,
    isStructuralContainer: left.isStructuralContainer || right.isStructuralContainer,
    keyboardObjectActions: left.keyboardObjectActions || right.keyboardObjectActions,
    objectSelectable: left.objectSelectable || right.objectSelectable,
    supportsArrangementMenu: left.supportsArrangementMenu || right.supportsArrangementMenu,
    supportsBlockBubble: left.supportsBlockBubble || right.supportsBlockBubble,
    supportsFieldControls: left.supportsFieldControls || right.supportsFieldControls,
    supportsMovement: left.supportsMovement || right.supportsMovement,
    supportsOutline: left.supportsOutline || right.supportsOutline,
    supportsResize: left.supportsResize || right.supportsResize,
    supportsSettings: left.supportsSettings || right.supportsSettings,
    target: createInteractionTargetRef(left.target),
  });
}
