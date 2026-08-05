import { AUTHORING_FRAME_WRAPPER_ATTR } from "@/editor/interactions/dom/authoring-chrome";
import {
  AuthoringFrameKind,
  resolveAuthoringFrameElement,
  type AuthoringFrameLocator,
} from "@/editor/interactions/dom/authoring-frame";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";

import type { MovementNodeContext } from "../model/movement-policy";

export const CONTAINED_MOVEMENT_TARGET_ATTR = "data-contained-movement-target";
export const CONTAINED_MOVEMENT_HANDLE_ATTR = "data-contained-movement-handle";

const SURFACE_ANCHOR_SELECTOR = "[data-surface]";
const RESIZABLE_BLOCK_FRAME_SELECTOR = `[${AUTHORING_FRAME_WRAPPER_ATTR}]`;

const STRUCTURAL_FRAME_KIND_BY_NODE_NAME: Readonly<Record<string, AuthoringFrameKind>> = {
  cell: AuthoringFrameKind.Cell,
  grid: AuthoringFrameKind.Grid,
  layout: AuthoringFrameKind.Layout,
  region: AuthoringFrameKind.Region,
  section: AuthoringFrameKind.Section,
};

export function resolveMovementAnchorElement(
  dom: Element,
  context: MovementNodeContext | null | undefined,
  blockDefinitions: BlockDefinitionLookup,
): Element | null {
  if (!context) return null;

  if (context.nodeType.name === "surface") {
    if (dom.matches(SURFACE_ANCHOR_SELECTOR)) return dom;
    return dom.querySelector(SURFACE_ANCHOR_SELECTOR);
  }

  const locator = movementFrameLocator(context, blockDefinitions);
  const anchor = resolveAuthoringFrameElement(dom, locator);
  if (!anchor) return null;

  if (locator?.frameKind === AuthoringFrameKind.Block) {
    return anchor.closest(RESIZABLE_BLOCK_FRAME_SELECTOR) ?? anchor;
  }

  return anchor;
}

function movementFrameLocator(
  context: MovementNodeContext,
  blockDefinitions: BlockDefinitionLookup,
): AuthoringFrameLocator | null {
  const id = readStableStringId(context.node.attrs["id"]);
  if (!id) return null;

  const structuralKind = STRUCTURAL_FRAME_KIND_BY_NODE_NAME[context.nodeType.name];
  if (structuralKind) return { frameKind: structuralKind, id };

  if (!blockDefinitions.getByNodeType(context.nodeType.name)) return null;

  return { frameKind: AuthoringFrameKind.Block, id };
}

function readStableStringId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
