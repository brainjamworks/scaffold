import type { EditorState } from "@tiptap/pm/state";

import { getScaffoldCapabilitiesForState } from "@/composition/extensions/scaffold-capabilities-storage";
import type {
  FloatingControl,
  FloatingTargetState,
} from "@/editor/shell/authoring/floating/floating-control";
import {
  InteractionTargetKind,
  type InteractionTargetRef,
} from "@/editor/interactions/targets/model/interaction-owner-state";
import { publishInteractionOwnerSnapshot } from "@/editor/interactions/targets/prosemirror/facade/interaction-owner-snapshot-publisher";
import {
  resolveStructuralChromeTargetDescriptor,
  type StructuralChromeTargetDescriptor,
} from "@/editor/interactions/targets/prosemirror/projection/structural-chrome-target-projection";
import type { StructuralInteractionTargetKind } from "@/editor/interactions/targets/prosemirror/projection/target-ref-projection";
import { structuralMenuAnchorId } from "@/editor/interactions/interaction-bubble/structural-bubble-anchor";

const FLOATING_TRIGGER_CLASS = "sc-floating-control-trigger";

export const surfaceMenuFloatingControl: FloatingControl = {
  className: `${FLOATING_TRIGGER_CLASS} sc-floating-surface-menu-trigger`,
  dataAttributes: {
    "data-no-select": "",
    "data-surface-menu-trigger": "",
  },
  inlineOffset: 4,
  label: "Surface options",
  open: ({ commands, state }) => {
    if (state.target.kind !== InteractionTargetKind.Surface) return false;
    return commands.toggleMenu(state.target);
  },
  resolveState: (editor) => resolveSurfaceOwnerTriggerState(editor.state),
};

export const regionMenuFloatingControl: FloatingControl = {
  className: `${FLOATING_TRIGGER_CLASS} sc-floating-region-menu-trigger`,
  dataAttributes: {
    "data-region-menu-trigger": "",
  },
  inlineOffset: 4,
  label: "Region options",
  open: ({ commands, state }) => {
    if (state.target.kind !== InteractionTargetKind.Region) return false;
    return commands.toggleMenu(state.target);
  },
  resolveState: (editor) =>
    resolveStructuralOwnerTriggerState(editor.state, InteractionTargetKind.Region),
};

export const SURFACE_FLOATING_AUTHORING_CONTROLS = [
  surfaceMenuFloatingControl,
  regionMenuFloatingControl,
] as const;

function resolveSurfaceOwnerTriggerState(state: EditorState): FloatingTargetState | null {
  const blockDefinitions = getScaffoldCapabilitiesForState(state).blocks.registry;
  const owners = publishInteractionOwnerSnapshot(state, null, {
    blockDefinitions,
  }).owners;
  const ownerRef =
    surfaceOwnerRef(owners.menuOwner.target) ??
    surfaceOwnerRef(owners.explicitOwner.target) ??
    owners.contextOwners.surface;
  if (!ownerRef) return null;

  const descriptor = resolveStructuralChromeTargetDescriptor(state, ownerRef);
  return descriptor?.kind === InteractionTargetKind.Surface
    ? createStructuralOwnerTriggerState(descriptor)
    : null;
}

function resolveStructuralOwnerTriggerState(
  state: EditorState,
  kind: StructuralInteractionTargetKind,
): FloatingTargetState | null {
  const descriptor = resolveStructuralOwnerDescriptor(state, kind);
  if (!descriptor) return null;

  return createStructuralOwnerTriggerState(descriptor);
}

function createStructuralOwnerTriggerState(
  descriptor: StructuralChromeTargetDescriptor,
): FloatingTargetState {
  const kind = descriptor.kind;
  const anchorId = structuralMenuAnchorId(kind, descriptor.id);
  return {
    anchorId,
    key: [kind, descriptor.pos, descriptor.id ?? "", anchorId ?? ""].join(":"),
    pos: descriptor.pos,
    target: descriptor.target,
  };
}

function surfaceOwnerRef(ownerRef: InteractionTargetRef | null): InteractionTargetRef | null {
  return ownerRef?.kind === InteractionTargetKind.Surface ? ownerRef : null;
}

function resolveStructuralOwnerDescriptor(
  state: EditorState,
  kind: StructuralInteractionTargetKind,
): StructuralChromeTargetDescriptor | null {
  const blockDefinitions = getScaffoldCapabilitiesForState(state).blocks.registry;
  const owners = publishInteractionOwnerSnapshot(state, null, {
    blockDefinitions,
  }).owners;
  const ownerRef = owners.menuOwner.target ?? owners.explicitOwner.target;
  if (ownerRef?.kind !== kind) return null;

  const descriptor = resolveStructuralChromeTargetDescriptor(state, ownerRef);
  return descriptor?.kind === kind ? descriptor : null;
}
