import type { EditorView } from "@tiptap/pm/view";

import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import {
  AUTHORING_CHROME_ATTR,
  AuthoringChromeKind,
} from "@/editor/interactions/dom/authoring-chrome";
import {
  isAuthoredEditableTarget,
  isAuthoringChromeTarget,
  isIgnoredInteractiveTarget,
  isPlainPrimaryMouseDown,
} from "@/editor/interactions/dom/activation-dom-policy";
import {
  AuthoringFrameKind,
  closestAuthoringFrameElement,
  readAuthoringFrameDescriptor,
  type AuthoringFrameDescriptor,
} from "@/editor/interactions/dom/authoring-frame";

import type { InteractionTargetRef } from "../../model/interaction-owner-state";
import {
  projectInteractionOwnerTargetRefFromAuthoringFrame,
  projectInteractionTargetRefFromAuthoringFrame,
} from "../projection/dom-target-ref-projection";

export const InteractionDomActivationIntentKind = {
  AuthoredEditableContent: "authored-editable-content",
  BlankStructuralSpace: "blank-structural-space",
  ExplicitChrome: "explicit-chrome",
  IgnoredInteractive: "ignored-interactive",
  ObjectShell: "object-shell",
  OutsideEditor: "outside-editor",
} as const;

export type InteractionDomActivationIntentKind =
  (typeof InteractionDomActivationIntentKind)[keyof typeof InteractionDomActivationIntentKind];

export interface TargetedInteractionDomActivationIntent {
  kind:
    | typeof InteractionDomActivationIntentKind.BlankStructuralSpace
    | typeof InteractionDomActivationIntentKind.ExplicitChrome
    | typeof InteractionDomActivationIntentKind.ObjectShell;
  target: InteractionTargetRef;
}

export interface UntargetedInteractionDomActivationIntent {
  kind:
    | typeof InteractionDomActivationIntentKind.AuthoredEditableContent
    | typeof InteractionDomActivationIntentKind.IgnoredInteractive
    | typeof InteractionDomActivationIntentKind.OutsideEditor;
}

export type InteractionDomActivationIntent =
  | TargetedInteractionDomActivationIntent
  | UntargetedInteractionDomActivationIntent;

const IGNORED_INTERACTIVE_INTENT: InteractionDomActivationIntent = {
  kind: InteractionDomActivationIntentKind.IgnoredInteractive,
};

const OUTSIDE_EDITOR_INTENT: InteractionDomActivationIntent = {
  kind: InteractionDomActivationIntentKind.OutsideEditor,
};

const AUTHORED_EDITABLE_CONTENT_INTENT: InteractionDomActivationIntent = {
  kind: InteractionDomActivationIntentKind.AuthoredEditableContent,
};

export function resolveInteractionActivationIntentFromMouseDown(
  view: EditorView,
  event: MouseEvent,
  blockDefinitions: BlockDefinitionLookup,
): InteractionDomActivationIntent {
  if (!isPlainPrimaryMouseDown(event)) return IGNORED_INTERACTIVE_INTENT;

  const target = event.target;
  if (!(target instanceof Element) || !view.dom.contains(target)) {
    return OUTSIDE_EDITOR_INTENT;
  }

  if (isAuthoringChromeTarget(target)) {
    if (readClosestAuthoringChromeKind(target) === AuthoringChromeKind.Trigger) {
      return IGNORED_INTERACTIVE_INTENT;
    }
    const ownerTarget = projectOwnerTargetRef(view, target, blockDefinitions);
    return ownerTarget
      ? {
          kind: InteractionDomActivationIntentKind.ExplicitChrome,
          target: ownerTarget,
        }
      : IGNORED_INTERACTIVE_INTENT;
  }

  if (isIgnoredInteractiveTarget(target)) return IGNORED_INTERACTIVE_INTENT;

  if (isAuthoredEditableTarget(target, view.dom)) {
    return AUTHORED_EDITABLE_CONTENT_INTENT;
  }

  const frameElement = closestAuthoringFrameElement(target);
  if (!frameElement) return OUTSIDE_EDITOR_INTENT;

  const descriptor = readAuthoringFrameDescriptor(frameElement);
  if (!descriptor) return IGNORED_INTERACTIVE_INTENT;

  if (descriptor.frameKind === AuthoringFrameKind.Block) {
    const rawTarget = projectInteractionTargetRefFromAuthoringFrame(
      view.state,
      descriptor,
      blockDefinitions,
    );
    return rawTarget
      ? {
          kind: InteractionDomActivationIntentKind.ObjectShell,
          target: rawTarget,
        }
      : IGNORED_INTERACTIVE_INTENT;
  }

  const structuralTarget = projectInteractionOwnerTargetRefFromAuthoringFrame(
    view.state,
    descriptor,
    blockDefinitions,
  );
  return structuralTarget
    ? {
        kind: InteractionDomActivationIntentKind.BlankStructuralSpace,
        target: structuralTarget,
      }
    : IGNORED_INTERACTIVE_INTENT;
}

function projectOwnerTargetRef(
  view: EditorView,
  target: Element,
  blockDefinitions: BlockDefinitionLookup,
): InteractionTargetRef | null {
  const descriptor = readClosestAuthoringFrameDescriptor(target);
  if (!descriptor) return null;
  return projectInteractionOwnerTargetRefFromAuthoringFrame(
    view.state,
    descriptor,
    blockDefinitions,
  );
}

function readClosestAuthoringFrameDescriptor(target: Element): AuthoringFrameDescriptor | null {
  const frameElement = closestAuthoringFrameElement(target);
  return frameElement ? readAuthoringFrameDescriptor(frameElement) : null;
}

function readClosestAuthoringChromeKind(target: Element): string | null {
  return target.closest(`[${AUTHORING_CHROME_ATTR}]`)?.getAttribute(AUTHORING_CHROME_ATTR) ?? null;
}
