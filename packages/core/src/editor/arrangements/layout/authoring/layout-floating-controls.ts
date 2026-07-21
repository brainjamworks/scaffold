import { DotsThreeVerticalIcon as DotsThreeVertical } from "@phosphor-icons/react";
import type { EditorState } from "@tiptap/pm/state";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import type {
  FloatingControl,
  FloatingTargetState,
} from "@/editor/shell/authoring/floating/floating-control";
import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";
import { publishInteractionOwnerSnapshot } from "@/editor/interactions/targets/prosemirror/facade/interaction-owner-snapshot-publisher";
import {
  resolveStructuralChromeTargetDescriptor,
  type LayoutChromeTargetDescriptor,
} from "@/editor/interactions/targets/prosemirror/projection/structural-chrome-target-projection";
import { structuralMenuAnchorId } from "@/editor/interactions/interaction-bubble/structural-bubble-anchor";

const FLOATING_TRIGGER_CLASS = "sc-floating-control-trigger";

export function createLayoutFloatingAuthoringControls(blockDefinitions: BlockDefinitionLookup) {
  const layoutMenuFloatingControl: FloatingControl = {
    alignment: "end-before-point",
    className: `${FLOATING_TRIGGER_CLASS} sc-floating-layout-menu-trigger`,
    dataAttributes: {
      "data-layout-menu-trigger": "",
    },
    icon: DotsThreeVertical,
    label: "Layout options",
    open: ({ commands, state }) => {
      if (state.target.kind !== InteractionTargetKind.Layout) return false;
      return commands.toggleMenu(state.target);
    },
    inlineOffset: -12,
    placement: "top-right",
    resolveState: (editor) => {
      const descriptor = resolveActiveLayoutDescriptor(editor.state, blockDefinitions);
      if (!descriptor?.id) return null;

      const anchorId = structuralMenuAnchorId(InteractionTargetKind.Layout, descriptor.id);
      return createFloatingTargetState({
        anchorId,
        key: ["layout-menu", descriptor.pos, descriptor.id, anchorId ?? ""].join(":"),
        pos: descriptor.pos,
        target: descriptor.target,
      });
    },
  };

  return [layoutMenuFloatingControl] as const;
}

export const LAYOUT_FLOATING_AUTHORING_CONTROLS =
  createLayoutFloatingAuthoringControls(builtInBlockRegistry);

function resolveActiveLayoutDescriptor(
  state: EditorState,
  blockDefinitions: BlockDefinitionLookup,
): LayoutChromeTargetDescriptor | null {
  const owners = publishInteractionOwnerSnapshot(state, null, {
    blockDefinitions,
  }).owners;
  const ownerRef = owners.menuOwner.target ?? owners.explicitOwner.target;

  if (ownerRef?.kind === InteractionTargetKind.Layout) {
    return resolveLayoutDescriptorFromRef(state, ownerRef);
  }
  if (ownerRef?.kind === InteractionTargetKind.Section) {
    const section = resolveStructuralChromeTargetDescriptor(state, ownerRef);
    return section?.kind === InteractionTargetKind.Section
      ? resolveLayoutDescriptorAt(state, section.layoutPos)
      : null;
  }
  if (ownerRef) return null;

  // Passive layout context: the floating trigger follows the caret's
  // containing layout unless a block owns the selection.
  if (owners.selectionOwner.target) return null;

  const contextLayout = owners.contextOwners.layout;
  return contextLayout ? resolveLayoutDescriptorFromRef(state, contextLayout) : null;
}

function resolveLayoutDescriptorAt(
  state: EditorState,
  layoutPos: number,
): LayoutChromeTargetDescriptor | null {
  return resolveLayoutDescriptorFromRef(state, {
    kind: InteractionTargetKind.Layout,
    pos: layoutPos,
  });
}

function resolveLayoutDescriptorFromRef(
  state: EditorState,
  ref: Parameters<typeof resolveStructuralChromeTargetDescriptor>[1],
): LayoutChromeTargetDescriptor | null {
  const descriptor = resolveStructuralChromeTargetDescriptor(state, ref);
  return descriptor?.kind === InteractionTargetKind.Layout ? descriptor : null;
}

function createFloatingTargetState(state: FloatingTargetState): FloatingTargetState {
  return state;
}
