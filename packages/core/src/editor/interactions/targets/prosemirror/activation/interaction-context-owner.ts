import type { EditorView } from "@tiptap/pm/view";

import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import { isPlainPrimaryMouseDown } from "@/editor/interactions/dom/activation-dom-policy";
import {
  AuthoringFrameKind,
  closestAuthoringFrameElement,
  readAuthoringFrameDescriptor,
} from "@/editor/interactions/dom/authoring-frame";

import type { InteractionTargetRef } from "../../model/interaction-owner-state";
import {
  projectInteractionOwnerTargetRefFromAuthoringFrame,
  projectSectionParentLayoutOwnerTargetRef,
} from "../projection/dom-target-ref-projection";

/**
 * Resolves the live DOM-derived context owner for a mousedown. Reads only
 * the clicked ancestry and the live document — never ProseMirror selection —
 * and never decides event handling; the activation dispatcher owns that.
 */
export function resolveInteractionContextOwnerFromMouseDown(
  view: EditorView,
  event: MouseEvent,
  blockDefinitions: BlockDefinitionLookup,
): InteractionTargetRef | null {
  if (!isPlainPrimaryMouseDown(event)) return null;

  const target = event.target;
  if (!(target instanceof Element) || !view.dom.contains(target)) return null;

  const frameElement = closestAuthoringFrameElement(target);
  const descriptor = frameElement ? readAuthoringFrameDescriptor(frameElement) : null;
  if (!descriptor) return null;

  // Section passive context maps to the parent layout; section-specific
  // menu/settings stay explicit menu/settings owner behavior.
  if (descriptor.frameKind === AuthoringFrameKind.Section) {
    return projectSectionParentLayoutOwnerTargetRef(view.state, descriptor);
  }

  return projectInteractionOwnerTargetRefFromAuthoringFrame(
    view.state,
    descriptor,
    blockDefinitions,
  );
}
