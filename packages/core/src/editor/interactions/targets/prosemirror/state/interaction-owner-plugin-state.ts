import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { PluginKey, type Transaction } from "@tiptap/pm/state";

import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";

import {
  InteractionActivationIntentKind,
  InteractionTargetKind,
  createInteractionActivationIntent,
  createInteractionTargetRef,
  sameInteractionTarget,
  type InteractionActivationIntent,
  type InteractionTargetRef,
} from "../../model/interaction-owner-state";
import {
  InteractionOwnerCommandKind,
  isInteractionOwnerCommandMeta,
  isTargetedInteractionOwnerCommandMeta,
  type InteractionOwnerCommandMeta,
} from "./interaction-owner-command-model";

export interface InteractionOwnerPluginState {
  activationIntent: InteractionActivationIntent | null;
  contextOwner: InteractionTargetRef | null;
  explicitOwner: InteractionTargetRef | null;
  gestureOwner: InteractionTargetRef | null;
  menuOwner: InteractionTargetRef | null;
  settingsOwner: InteractionTargetRef | null;
}

export const EMPTY_INTERACTION_OWNER_PLUGIN_STATE: InteractionOwnerPluginState = {
  activationIntent: null,
  contextOwner: null,
  explicitOwner: null,
  gestureOwner: null,
  menuOwner: null,
  settingsOwner: null,
};

export const interactionOwnerPluginKey = new PluginKey<InteractionOwnerPluginState>(
  "scaffoldInteractionOwner",
);

export function setInteractionOwnerCommandMeta(
  tr: Transaction,
  meta: InteractionOwnerCommandMeta,
): Transaction {
  return tr.setMeta(interactionOwnerPluginKey, meta);
}

export function readInteractionOwnerCommandMeta(
  tr: Transaction,
): InteractionOwnerCommandMeta | null {
  const meta: unknown = tr.getMeta(interactionOwnerPluginKey);
  return isInteractionOwnerCommandMeta(meta) ? meta : null;
}

export function normalizeInteractionOwnerCommandMetaForTransaction(
  meta: InteractionOwnerCommandMeta,
  tr: Transaction,
  blockDefinitions: BlockDefinitionLookup,
): InteractionOwnerCommandMeta | null {
  if (meta.kind === InteractionOwnerCommandKind.EnterEditableContent) {
    if (!meta.contextOwner) return meta;

    const contextOwner = normalizeOwnerRefForTransaction(
      stableOwnerRef(meta.contextOwner),
      tr,
      blockDefinitions,
    );
    return contextOwner ? { ...meta, contextOwner } : { kind: meta.kind };
  }

  if (!isTargetedInteractionOwnerCommandMeta(meta)) return meta;

  const target = normalizeOwnerRefForTransaction(stableOwnerRef(meta.target), tr, blockDefinitions);
  return target ? { ...meta, target } : null;
}

export function resolveInteractionOwnerTargetRef(
  target: InteractionTargetRef,
  doc: ProseMirrorNode,
  blockDefinitions: BlockDefinitionLookup,
): InteractionTargetRef | null {
  const ref = stableOwnerRef(target);
  return ref ? resolveOwnerRefInDocument(ref, doc, blockDefinitions) : null;
}

export function applyInteractionOwnerCommandMeta(
  state: InteractionOwnerPluginState,
  meta: InteractionOwnerCommandMeta,
): InteractionOwnerPluginState {
  switch (meta.kind) {
    case InteractionOwnerCommandKind.ActivateContextOwner: {
      const target = stableOwnerRef(meta.target);
      if (!target) return state;
      return {
        ...state,
        activationIntent: createInteractionActivationIntent({
          kind: InteractionActivationIntentKind.IgnoredInteractive,
          target,
        }),
        contextOwner: target,
        explicitOwner: null,
        menuOwner: null,
      };
    }

    case InteractionOwnerCommandKind.ActivateStructuralTarget: {
      const target = stableOwnerRef(meta.target);
      if (!target) return state;
      return {
        ...state,
        activationIntent: createInteractionActivationIntent({
          kind: InteractionActivationIntentKind.ExplicitChrome,
          target,
        }),
        contextOwner: null,
        explicitOwner: target,
        menuOwner: null,
      };
    }

    case InteractionOwnerCommandKind.EnterEditableContent:
      return {
        ...state,
        activationIntent: createInteractionActivationIntent({
          kind: InteractionActivationIntentKind.AuthoredEditableContent,
        }),
        contextOwner: meta.contextOwner ? stableOwnerRef(meta.contextOwner) : null,
        explicitOwner: null,
        menuOwner: null,
      };

    case InteractionOwnerCommandKind.SelectObjectTarget: {
      const target = stableOwnerRef(meta.target);
      if (!target) return state;
      return {
        ...state,
        activationIntent: createInteractionActivationIntent({
          kind: InteractionActivationIntentKind.ObjectShell,
          target,
        }),
        contextOwner: null,
        explicitOwner: null,
        menuOwner: null,
      };
    }

    case InteractionOwnerCommandKind.BeginGesture: {
      const target = stableOwnerRef(meta.target);
      if (!target) return state;
      return { ...state, gestureOwner: target };
    }

    case InteractionOwnerCommandKind.EndGesture:
      return { ...state, gestureOwner: null };

    case InteractionOwnerCommandKind.OpenMenu: {
      const target = stableOwnerRef(meta.target);
      if (!target) return state;
      return { ...state, menuOwner: target };
    }

    case InteractionOwnerCommandKind.ToggleMenu: {
      const target = stableOwnerRef(meta.target);
      if (!target) return state;
      return {
        ...state,
        menuOwner:
          state.menuOwner && sameInteractionTarget(state.menuOwner, target) ? null : target,
      };
    }

    case InteractionOwnerCommandKind.OpenSettings: {
      const target = stableOwnerRef(meta.target);
      if (!target) return state;
      return { ...state, settingsOwner: target };
    }

    case InteractionOwnerCommandKind.DismissInteraction:
      return EMPTY_INTERACTION_OWNER_PLUGIN_STATE;
  }
}

export function normalizeInteractionOwnerPluginState(
  state: InteractionOwnerPluginState,
  tr: Transaction,
  blockDefinitions: BlockDefinitionLookup,
): InteractionOwnerPluginState {
  const activationIntent = state.activationIntent
    ? createInteractionActivationIntent({
        kind: state.activationIntent.kind,
        target: normalizeOwnerRefForTransaction(
          state.activationIntent.target,
          tr,
          blockDefinitions,
        ),
      })
    : null;

  return {
    activationIntent,
    contextOwner: normalizeOwnerRefForTransaction(state.contextOwner, tr, blockDefinitions),
    explicitOwner: normalizeOwnerRefForTransaction(state.explicitOwner, tr, blockDefinitions),
    gestureOwner: normalizeOwnerRefForTransaction(state.gestureOwner, tr, blockDefinitions),
    menuOwner: normalizeOwnerRefForTransaction(state.menuOwner, tr, blockDefinitions),
    settingsOwner: normalizeOwnerRefForTransaction(state.settingsOwner, tr, blockDefinitions),
  };
}

function stableOwnerRef(target: InteractionTargetRef): InteractionTargetRef | null {
  const ref = createInteractionTargetRef(target);
  return ref.id || Number.isInteger(ref.pos) ? ref : null;
}

function normalizeOwnerRefForTransaction(
  ref: InteractionTargetRef | null,
  tr: Transaction,
  blockDefinitions: BlockDefinitionLookup,
): InteractionTargetRef | null {
  if (!ref) return null;

  if (ref.id) {
    return resolveOwnerRefInDocument(ref, tr.doc, blockDefinitions);
  }

  if (!Number.isInteger(ref.pos)) return null;

  const mapped = tr.mapping.mapResult(ref.pos as number);
  if (mapped.deleted) return null;

  const node = tr.doc.nodeAt(mapped.pos);
  if (!node || !nodeMatchesTargetKind(node, ref.kind, blockDefinitions)) return null;

  return createInteractionTargetRef({ kind: ref.kind, pos: mapped.pos });
}

function resolveOwnerRefInDocument(
  ref: InteractionTargetRef,
  doc: ProseMirrorNode,
  blockDefinitions: BlockDefinitionLookup,
): InteractionTargetRef | null {
  if (ref.id) {
    const found = findNodeByStableId(doc, ref.kind, ref.id, blockDefinitions);
    if (!found) return null;
    return createInteractionTargetRef({
      id: ref.id,
      kind: ref.kind,
      pos: found.pos,
    });
  }

  if (!Number.isInteger(ref.pos)) return null;

  const pos = ref.pos as number;
  const node = doc.nodeAt(pos);
  if (!node || !nodeMatchesTargetKind(node, ref.kind, blockDefinitions)) return null;

  return createInteractionTargetRef({ kind: ref.kind, pos });
}

function findNodeByStableId(
  doc: ProseMirrorNode,
  kind: InteractionTargetRef["kind"],
  id: string,
  blockDefinitions: BlockDefinitionLookup,
): { pos: number } | null {
  let found: { pos: number } | null = null;

  doc.descendants((node, pos) => {
    if (found) return false;
    if (node.attrs["id"] === id && nodeMatchesTargetKind(node, kind, blockDefinitions)) {
      found = { pos };
      return false;
    }
    return true;
  });

  return found;
}

function nodeMatchesTargetKind(
  node: ProseMirrorNode,
  kind: InteractionTargetRef["kind"],
  blockDefinitions: BlockDefinitionLookup,
): boolean {
  if (kind === InteractionTargetKind.Block) {
    return Boolean(blockDefinitions.getByNodeType(node.type.name));
  }
  if (kind === InteractionTargetKind.Field) return false;
  return node.type.name === kind;
}
