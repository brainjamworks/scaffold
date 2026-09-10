import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";

import {
  isLayerFillOccupantNode,
  resolveLayerTargetAtPosition,
} from "@/document/model/layers/layer-editing-policy";
import type { LayoutRegistry } from "@/editor/arrangements/layout/model/layout-registry";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import type { BoundedPlacement } from "@/editor/frame/model/bounded-placement";

export type BoundedContainerType = "cell" | "region" | "section";

export function isFillOccupantNode(
  node: ProseMirrorNode,
  blockDefinitions: BlockDefinitionLookup,
  layoutDefinitions: LayoutRegistry,
): boolean {
  return isLayerFillOccupantNode(node, blockDefinitions, layoutDefinitions);
}

export function resolveActiveBoundedPlacement(input: {
  blockDefinitions: BlockDefinitionLookup;
  capability: BoundedPlacement | undefined;
  doc: ProseMirrorNode;
  layoutDefinitions: LayoutRegistry;
  pos: number | null | undefined;
}): BoundedPlacement | undefined {
  const pos = input.pos;
  if (!input.capability || typeof pos !== "number" || !Number.isInteger(pos)) {
    return undefined;
  }
  if (pos < 0 || pos > input.doc.content.size) return undefined;

  const resolved = input.doc.resolve(pos);
  const child = input.doc.nodeAt(pos);
  return child &&
    isActiveBoundedParentForChild(
      resolved,
      resolved.depth,
      input.blockDefinitions,
      input.layoutDefinitions,
      child,
    )
    ? input.capability
    : undefined;
}

export function resolveActiveBoundedPlacementForNodeView(input: {
  blockDefinitions: BlockDefinitionLookup;
  capability: BoundedPlacement | undefined;
  doc: ProseMirrorNode;
  getPos: (() => number | undefined) | boolean | undefined;
  layoutDefinitions: LayoutRegistry;
}): BoundedPlacement | undefined {
  if (typeof input.getPos !== "function") return undefined;

  let pos: number | undefined;
  try {
    pos = input.getPos();
  } catch {
    return undefined;
  }
  return resolveActiveBoundedPlacement({
    blockDefinitions: input.blockDefinitions,
    capability: input.capability,
    doc: input.doc,
    layoutDefinitions: input.layoutDefinitions,
    pos,
  });
}

export function mayHaveBoundedContainerParentForNodeView(input: {
  doc: ProseMirrorNode;
  getPos: (() => number | undefined) | boolean | undefined;
}): boolean {
  if (typeof input.getPos !== "function") return false;

  try {
    const pos = input.getPos();
    if (typeof pos !== "number" || !Number.isInteger(pos) || !input.doc.nodeAt(pos)) {
      return false;
    }

    const parentType = input.doc.resolve(pos).parent.type.name;
    return parentType !== "doc" && parentType !== "courseDocument" && parentType !== "surface";
  } catch {
    return false;
  }
}

export function allowsBoundedContainerRootInsertionAtPosition(input: {
  blockDefinitions: BlockDefinitionLookup;
  doc: ProseMirrorNode;
  layoutDefinitions: LayoutRegistry;
  pos: number | null | undefined;
}): boolean {
  const container = resolveActiveBoundedContainer(
    input.doc,
    input.pos,
    input.blockDefinitions,
    input.layoutDefinitions,
  );
  if (!container) return true;
  return !hasDirectFillOccupant(
    container.composition,
    input.blockDefinitions,
    input.layoutDefinitions,
  );
}

export function isActiveBoundedContainerAtPosition(input: {
  blockDefinitions: BlockDefinitionLookup;
  containerType: BoundedContainerType;
  doc: ProseMirrorNode;
  layoutDefinitions: LayoutRegistry;
  pos: number | null | undefined;
}): boolean {
  const container = resolveActiveBoundedContainer(
    input.doc,
    input.pos,
    input.blockDefinitions,
    input.layoutDefinitions,
  );
  return container?.owner.type.name === input.containerType;
}

interface ActiveBoundedContainer {
  readonly owner: ProseMirrorNode;
  readonly composition: ProseMirrorNode;
}

function resolveActiveBoundedContainer(
  doc: ProseMirrorNode,
  pos: number | null | undefined,
  blockDefinitions: BlockDefinitionLookup,
  layoutDefinitions: LayoutRegistry,
): ActiveBoundedContainer | null {
  if (typeof pos !== "number" || !Number.isInteger(pos)) return null;
  if (pos < 0 || pos > doc.content.size) return null;

  const node = doc.nodeAt(pos);
  if (
    node &&
    isActiveBoundedContainerNodeAtPosition(doc, node, pos, blockDefinitions, layoutDefinitions)
  ) {
    return { owner: node, composition: node };
  }

  const layerTarget = resolveLayerTargetAtPosition({ doc, pos, layoutDefinitions });
  if (layerTarget) {
    const owner = layerTarget.ownerSlot.logicalOwner;
    return isActiveBoundedContainerNodeAtPosition(
      doc,
      owner.node,
      owner.pos,
      blockDefinitions,
      layoutDefinitions,
    )
      ? { owner: owner.node, composition: layerTarget.layer }
      : null;
  }

  return null;
}

function isActiveBoundedContainerNodeAtPosition(
  doc: ProseMirrorNode,
  node: ProseMirrorNode,
  pos: number,
  blockDefinitions: BlockDefinitionLookup,
  layoutDefinitions: LayoutRegistry,
): boolean {
  if (node.type.name === "region") return true;
  if (node.type.name === "cell") {
    return isActiveBoundedCellAtPosition(doc, pos, blockDefinitions, layoutDefinitions);
  }
  if (node.type.name === "section") {
    return isActiveBoundedSectionAtPosition(doc, pos, blockDefinitions, layoutDefinitions);
  }
  return false;
}

function isActiveBoundedCellAtPosition(
  doc: ProseMirrorNode,
  pos: number,
  blockDefinitions: BlockDefinitionLookup,
  layoutDefinitions: LayoutRegistry,
): boolean {
  try {
    const resolved = doc.resolve(pos);
    const gridDepth = resolved.depth;
    return (
      gridDepth >= 0 &&
      resolved.node(gridDepth).type.name === "grid" &&
      isActiveFillOccupantAtDepth(resolved, gridDepth, blockDefinitions, layoutDefinitions)
    );
  } catch {
    return false;
  }
}

function isActiveBoundedSectionAtPosition(
  doc: ProseMirrorNode,
  pos: number,
  blockDefinitions: BlockDefinitionLookup,
  layoutDefinitions: LayoutRegistry,
): boolean {
  try {
    const resolved = doc.resolve(pos);
    const layoutDepth = resolved.depth;
    const layout = resolved.node(layoutDepth);
    return (
      layout.type.name === "layout" &&
      layoutHandsOffBoundedPlacementToSections(layout, layoutDefinitions) &&
      isActiveFillOccupantAtDepth(resolved, layoutDepth, blockDefinitions, layoutDefinitions)
    );
  } catch {
    return false;
  }
}

function isActiveBoundedParentForChild(
  resolved: ResolvedPos,
  parentDepth: number,
  blockDefinitions: BlockDefinitionLookup,
  layoutDefinitions: LayoutRegistry,
  child?: ProseMirrorNode,
): boolean {
  if (parentDepth < 0) return false;

  const parent = resolved.node(parentDepth);
  if (parent.type.name === "layer") {
    const layerPos = resolved.before(parentDepth);
    const target = resolveLayerTargetAtPosition({
      doc: resolved.doc,
      pos: layerPos,
      layoutDefinitions,
    });
    if (!target) {
      throw new Error(`Layer at position ${layerPos} has no declared logical owner.`);
    }
    return isActiveBoundedContainerNodeAtPosition(
      resolved.doc,
      target.ownerSlot.logicalOwner.node,
      target.ownerSlot.logicalOwner.pos,
      blockDefinitions,
      layoutDefinitions,
    );
  }
  if (parent.type.name === "region") return true;

  if (parent.type.name === "cell") {
    const gridDepth = parentDepth - 1;
    return (
      gridDepth >= 0 &&
      resolved.node(gridDepth).type.name === "grid" &&
      isActiveFillOccupantAtDepth(resolved, gridDepth, blockDefinitions, layoutDefinitions)
    );
  }

  if (parent.type.name === "section") {
    const layoutDepth = parentDepth - 1;
    return (
      layoutDepth >= 0 &&
      resolved.node(layoutDepth).type.name === "layout" &&
      layoutHandsOffBoundedPlacementToSections(resolved.node(layoutDepth), layoutDefinitions) &&
      isActiveFillOccupantAtDepth(resolved, layoutDepth, blockDefinitions, layoutDefinitions)
    );
  }

  const stagedHost = blockDefinitions.getByNodeType(parent.type.name)?.stagedBoundedHost;
  if (stagedHost && child?.type.isInGroup(stagedHost.childGroup)) {
    return isActiveFillOccupantAtDepth(resolved, parentDepth, blockDefinitions, layoutDefinitions);
  }

  return false;
}

function layoutHandsOffBoundedPlacementToSections(
  layout: ProseMirrorNode,
  layoutDefinitions: LayoutRegistry,
): boolean {
  const definition = layoutDefinitions.getForNode(layout);
  return (
    definition?.boundedPlacement === "fill" &&
    definition.boundedSectionBehavior !== "terminal-scroll"
  );
}

function isActiveFillOccupantAtDepth(
  resolved: ResolvedPos,
  nodeDepth: number,
  blockDefinitions: BlockDefinitionLookup,
  layoutDefinitions: LayoutRegistry,
): boolean {
  if (nodeDepth <= 0) return false;
  return (
    isFillOccupantNode(resolved.node(nodeDepth), blockDefinitions, layoutDefinitions) &&
    isActiveBoundedParentForChild(
      resolved,
      nodeDepth - 1,
      blockDefinitions,
      layoutDefinitions,
      resolved.node(nodeDepth),
    )
  );
}

function hasDirectFillOccupant(
  node: ProseMirrorNode,
  blockDefinitions: BlockDefinitionLookup,
  layoutDefinitions: LayoutRegistry,
): boolean {
  let hasFillOccupant = false;

  node.forEach((child) => {
    if (hasFillOccupant) return;
    hasFillOccupant = isFillOccupantNode(child, blockDefinitions, layoutDefinitions);
  });

  return hasFillOccupant;
}
