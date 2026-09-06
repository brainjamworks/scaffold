import { AUTHORING_FRAME_WRAPPER_ATTR } from "@/editor/interactions/dom/authoring-chrome";
import {
  AuthoringFrameKind,
  resolveAuthoringFrameElement,
  type AuthoringFrameLocator,
} from "@/editor/interactions/dom/authoring-frame";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";

import type { MovementNodeContext } from "../model/movement-policy";
import type { MovementTargetAxis } from "../model/movement-target";

export const CONTAINED_MOVEMENT_TARGET_ATTR = "data-contained-movement-target";
export const CONTAINED_MOVEMENT_HANDLE_ATTR = "data-contained-movement-handle";
export const MOVEMENT_TARGET_AXIS_ATTR = "data-movement-target-axis";

export interface MovementTargetPresentation {
  readonly axis: MovementTargetAxis;
  readonly element: Element;
}

export interface MovementTargetPresentationOwner {
  readonly axis: MovementTargetAxis;
  readonly resolveElement: (ownerElement: HTMLElement) => Element | null;
}

const movementTargetPresentationOwners = new WeakMap<
  HTMLElement,
  MovementTargetPresentationOwner
>();

const SURFACE_ANCHOR_SELECTOR = "[data-surface]";
const RESIZABLE_BLOCK_FRAME_SELECTOR = `[${AUTHORING_FRAME_WRAPPER_ATTR}]`;

const STRUCTURAL_FRAME_KIND_BY_NODE_NAME: Readonly<Record<string, AuthoringFrameKind>> = {
  cell: AuthoringFrameKind.Cell,
  grid: AuthoringFrameKind.Grid,
  layout: AuthoringFrameKind.Layout,
  region: AuthoringFrameKind.Region,
  section: AuthoringFrameKind.Section,
};

export function containedMovementTargetAttributes(
  axis: MovementTargetAxis = "vertical",
): Record<typeof CONTAINED_MOVEMENT_TARGET_ATTR | typeof MOVEMENT_TARGET_AXIS_ATTR, string> {
  return {
    [CONTAINED_MOVEMENT_TARGET_ATTR]: "",
    [MOVEMENT_TARGET_AXIS_ATTR]: axis,
  };
}

export function registerMovementTargetPresentationOwner(
  ownerElement: HTMLElement,
  owner: MovementTargetPresentationOwner,
): () => void {
  movementTargetPresentationOwners.set(ownerElement, owner);
  return () => {
    if (movementTargetPresentationOwners.get(ownerElement) === owner) {
      movementTargetPresentationOwners.delete(ownerElement);
    }
  };
}

export function resolveStructureMovementTargetPresentation(
  dom: Element,
  context: MovementNodeContext | null | undefined,
  blockDefinitions: BlockDefinitionLookup,
): MovementTargetPresentation | null {
  if (!context) return null;
  if (context.nodeType.name === "surface") {
    const element = dom.matches(SURFACE_ANCHOR_SELECTOR)
      ? dom
      : dom.querySelector(SURFACE_ANCHOR_SELECTOR);
    return element ? { axis: readMovementTargetAxis(element), element } : null;
  }

  const locator = movementFrameLocator(context, blockDefinitions);
  const anchor = resolveAuthoringFrameElement(dom, locator);
  if (!anchor) return null;

  if (locator?.frameKind === AuthoringFrameKind.Block) {
    const element = anchor.closest(RESIZABLE_BLOCK_FRAME_SELECTOR) ?? anchor;
    return { axis: readMovementTargetAxis(element), element };
  }

  const HTMLElementConstructor = anchor.ownerDocument.defaultView?.HTMLElement;
  if (HTMLElementConstructor && anchor instanceof HTMLElementConstructor) {
    const owner = movementTargetPresentationOwners.get(anchor);
    if (owner) {
      const element = owner.resolveElement(anchor);
      if (element?.ownerDocument === anchor.ownerDocument) {
        return { axis: owner.axis, element };
      }
    }
  }

  return { axis: readMovementTargetAxis(anchor), element: anchor };
}

export function resolveContainedMovementTargetPresentation(
  dom: Element,
): MovementTargetPresentation | null {
  const selector = `[${CONTAINED_MOVEMENT_TARGET_ATTR}]`;
  const element = dom.matches(selector) ? dom : dom.querySelector(selector);
  return element ? { axis: readMovementTargetAxis(element), element } : null;
}

function readMovementTargetAxis(element: Element): MovementTargetAxis {
  return element.getAttribute(MOVEMENT_TARGET_AXIS_ATTR) === "horizontal"
    ? "horizontal"
    : "vertical";
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
