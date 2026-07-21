import type { EditorView } from "@tiptap/pm/view";

import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import type { InteractionTargetRef } from "../../model/interaction-owner-state";
import {
  InteractionOwnerCommandKind,
  type InteractionOwnerCommandMeta,
  type TargetedInteractionOwnerCommandMeta,
} from "../state/interaction-owner-command-model";
import {
  resolveInteractionOwnerTargetRef,
  setInteractionOwnerCommandMeta,
} from "../state/interaction-owner-plugin-state";
import type { InteractionCommands } from "../../facade/interaction-store";

/**
 * Facade command ports for a live editor view. Every port crosses the
 * ProseMirror transaction boundary with interaction command meta; none of them
 * mutates the facade snapshot directly.
 */
export function createInteractionOwnerCommandPorts(
  view: EditorView,
  blockDefinitions: BlockDefinitionLookup,
): InteractionCommands {
  const dispatch = (meta: InteractionOwnerCommandMeta): boolean => {
    view.dispatch(setInteractionOwnerCommandMeta(view.state.tr, meta));
    return true;
  };

  const dispatchTargeted = (
    kind: TargetedInteractionOwnerCommandMeta["kind"],
    target: InteractionTargetRef,
  ): boolean => {
    const ref = resolveInteractionOwnerTargetRef(target, view.state.doc, blockDefinitions);
    if (!ref) return false;
    return dispatch({ kind, target: ref });
  };

  return {
    activateStructuralTarget: (target) =>
      dispatchTargeted(InteractionOwnerCommandKind.ActivateStructuralTarget, target),
    beginGesture: (target) => dispatchTargeted(InteractionOwnerCommandKind.BeginGesture, target),
    dismissInteraction: () => dispatch({ kind: InteractionOwnerCommandKind.DismissInteraction }),
    endGesture: () => dispatch({ kind: InteractionOwnerCommandKind.EndGesture }),
    enterEditableContent: () =>
      dispatch({ kind: InteractionOwnerCommandKind.EnterEditableContent }),
    openMenu: (target) => dispatchTargeted(InteractionOwnerCommandKind.OpenMenu, target),
    openSettings: (target) => dispatchTargeted(InteractionOwnerCommandKind.OpenSettings, target),
    selectObjectTarget: (target) =>
      dispatchTargeted(InteractionOwnerCommandKind.SelectObjectTarget, target),
    toggleMenu: (target) => dispatchTargeted(InteractionOwnerCommandKind.ToggleMenu, target),
  };
}
