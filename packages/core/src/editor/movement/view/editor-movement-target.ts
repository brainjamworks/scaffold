import type { Editor } from "@tiptap/core";

import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import { AUTHORING_FRAME_WRAPPER_ATTR } from "@/editor/interactions/dom/authoring-chrome";
import {
  AUTHORING_FRAME_ATTR,
  AuthoringFrameKind,
  resolveAuthoringFrameElement,
} from "@/editor/interactions/dom/authoring-frame";
import type { InteractionTargetRef } from "@/editor/interactions/targets/model/interaction-owner-state";
import {
  resolveBlockChromeTargetDescriptor,
  type BlockChromeTargetDescriptor,
} from "@/editor/interactions/targets/prosemirror/projection/block-chrome-target-projection";

import {
  canStartStructureMovement,
  createStructureMovementPolicy,
  resolveMovementNodeContext,
  type MovementNodeContext,
} from "../model/movement-policy";

export interface V2EditorMovementTarget {
  context: MovementNodeContext;
  element: Element;
  rect: DOMRect;
  targetRef: InteractionTargetRef;
}

export function resolveV2MovementTargetFromDescriptor(
  editor: Editor,
  descriptor: BlockChromeTargetDescriptor,
  blockDefinitions: BlockDefinitionLookup,
): V2EditorMovementTarget | null {
  const policy = createStructureMovementPolicy(editor.schema, blockDefinitions);
  const context = resolveMovementNodeContext(editor.state.doc, descriptor.pos);
  if (!context || !canStartStructureMovement(policy, context)) return null;

  const dom = editor.view.nodeDOM(descriptor.pos);
  if (!(dom instanceof Element)) return null;

  const element = resolveBlockMovementAnchorElement(dom, descriptor);
  if (!element) return null;

  return {
    context,
    element,
    rect: element.getBoundingClientRect(),
    targetRef: descriptor.target,
  };
}

export function resolveV2MovementTargetFromRef(
  editor: Editor,
  targetRef: InteractionTargetRef | null | undefined,
  blockDefinitions: BlockDefinitionLookup,
): V2EditorMovementTarget | null {
  const descriptor = resolveBlockChromeTargetDescriptor(editor.state, targetRef, blockDefinitions);
  if (!descriptor) return null;

  return resolveV2MovementTargetFromDescriptor(editor, descriptor, blockDefinitions);
}

function resolveBlockMovementAnchorElement(
  dom: Element,
  descriptor: BlockChromeTargetDescriptor,
): Element | null {
  const frame = descriptor.blockId
    ? resolveAuthoringFrameElement(dom, {
        frameKind: AuthoringFrameKind.Block,
        id: descriptor.blockId,
      })
    : resolveAnonymousBlockFrameElement(dom);
  if (!frame) return null;

  return frame.closest(`[${AUTHORING_FRAME_WRAPPER_ATTR}]`) ?? frame;
}

function resolveAnonymousBlockFrameElement(dom: Element): Element | null {
  const selector = `[${AUTHORING_FRAME_ATTR}="${AuthoringFrameKind.Block}"]`;
  if (dom.matches(selector)) return dom;
  return dom.querySelector(selector);
}
