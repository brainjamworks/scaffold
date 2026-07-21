import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";

import { builtInLayoutRegistry } from "@/editor/arrangements/layout/model/built-in-layout-definitions";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import type { BoundedPlacement } from "@/editor/frame/model/bounded-placement";

export type BoundedContainerType = "cell" | "region" | "section";

export type BoundedContainerStructureViolationCode = "fill_occupant_requires_exclusive_container";

export interface BoundedContainerStructureViolation {
  code: BoundedContainerStructureViolationCode;
  containerType: BoundedContainerType;
  fillOccupantType: string;
}

export interface BoundedContainerStructureValidationResult {
  ok: boolean;
  violations: BoundedContainerStructureViolation[];
}

export function isFillOccupantNode(
  node: ProseMirrorNode,
  blockDefinitions: BlockDefinitionLookup,
): boolean {
  if (node.type.name === "grid") return true;

  if (node.type.name === "layout") {
    return builtInLayoutRegistry.getForNode(node)?.boundedPlacement === "fill";
  }

  return blockDefinitions.getByNodeType(node.type.name)?.boundedPlacement === "fill";
}

export function resolveActiveBoundedPlacement(input: {
  blockDefinitions: BlockDefinitionLookup;
  capability: BoundedPlacement | undefined;
  doc: ProseMirrorNode;
  pos: number | null | undefined;
}): BoundedPlacement | undefined {
  const pos = input.pos;
  if (!input.capability || typeof pos !== "number" || !Number.isInteger(pos)) {
    return undefined;
  }

  try {
    const resolved = input.doc.resolve(pos);
    const child = input.doc.nodeAt(pos);
    return child &&
      isActiveBoundedParentForChild(resolved, resolved.depth, input.blockDefinitions, child)
      ? input.capability
      : undefined;
  } catch {
    return undefined;
  }
}

export function resolveActiveBoundedPlacementForNodeView(input: {
  blockDefinitions: BlockDefinitionLookup;
  capability: BoundedPlacement | undefined;
  doc: ProseMirrorNode;
  getPos: (() => number | undefined) | boolean | undefined;
}): BoundedPlacement | undefined {
  if (typeof input.getPos !== "function") return undefined;

  try {
    return resolveActiveBoundedPlacement({
      blockDefinitions: input.blockDefinitions,
      capability: input.capability,
      doc: input.doc,
      pos: input.getPos(),
    });
  } catch {
    return undefined;
  }
}

export function allowsBoundedContainerRootInsertionAtPosition(input: {
  blockDefinitions: BlockDefinitionLookup;
  doc: ProseMirrorNode;
  pos: number | null | undefined;
}): boolean {
  const container = resolveActiveBoundedContainer(input.doc, input.pos, input.blockDefinitions);
  if (!container) return true;
  return !hasDirectFillOccupant(container.node, input.blockDefinitions);
}

export function isActiveBoundedContainerAtPosition(input: {
  blockDefinitions: BlockDefinitionLookup;
  containerType: BoundedContainerType;
  doc: ProseMirrorNode;
  pos: number | null | undefined;
}): boolean {
  const container = resolveActiveBoundedContainer(input.doc, input.pos, input.blockDefinitions);
  return container?.node.type.name === input.containerType;
}

export function validateBoundedContainerStructure(
  doc: ProseMirrorNode,
  blockDefinitions: BlockDefinitionLookup,
): BoundedContainerStructureValidationResult {
  const violations: BoundedContainerStructureViolation[] = [];

  doc.descendants((node, pos) => {
    if (!isActiveBoundedContainerNodeAtPosition(doc, node, pos, blockDefinitions)) return true;
    violations.push(...validateActiveBoundedContainerNode(node, blockDefinitions).violations);
    return true;
  });

  return { ok: violations.length === 0, violations };
}

function validateActiveBoundedContainerNode(
  node: ProseMirrorNode,
  blockDefinitions: BlockDefinitionLookup,
): BoundedContainerStructureValidationResult {
  const fillOccupants = directFillOccupants(node, blockDefinitions);
  if (fillOccupants.length === 0 || node.childCount === 1) {
    return { ok: true, violations: [] };
  }

  return {
    ok: false,
    violations: fillOccupants.map((fillOccupant) => ({
      code: "fill_occupant_requires_exclusive_container",
      containerType: node.type.name as BoundedContainerType,
      fillOccupantType: fillOccupant.type.name,
    })),
  };
}

function resolveActiveBoundedContainer(
  doc: ProseMirrorNode,
  pos: number | null | undefined,
  blockDefinitions: BlockDefinitionLookup,
): { node: ProseMirrorNode; pos: number } | null {
  if (typeof pos !== "number" || !Number.isInteger(pos)) return null;

  try {
    const node = doc.nodeAt(pos);
    if (!node || !isActiveBoundedContainerNodeAtPosition(doc, node, pos, blockDefinitions)) {
      return null;
    }
    return { node, pos };
  } catch {
    return null;
  }
}

function isActiveBoundedContainerNodeAtPosition(
  doc: ProseMirrorNode,
  node: ProseMirrorNode,
  pos: number,
  blockDefinitions: BlockDefinitionLookup,
): boolean {
  if (node.type.name === "region") return true;
  if (node.type.name === "cell") {
    return isActiveBoundedCellAtPosition(doc, pos, blockDefinitions);
  }
  if (node.type.name === "section") {
    return isActiveBoundedSectionAtPosition(doc, pos, blockDefinitions);
  }
  return false;
}

function isActiveBoundedCellAtPosition(
  doc: ProseMirrorNode,
  pos: number,
  blockDefinitions: BlockDefinitionLookup,
): boolean {
  try {
    const resolved = doc.resolve(pos);
    const gridDepth = resolved.depth;
    return (
      gridDepth >= 0 &&
      resolved.node(gridDepth).type.name === "grid" &&
      isActiveFillOccupantAtDepth(resolved, gridDepth, blockDefinitions)
    );
  } catch {
    return false;
  }
}

function isActiveBoundedSectionAtPosition(
  doc: ProseMirrorNode,
  pos: number,
  blockDefinitions: BlockDefinitionLookup,
): boolean {
  try {
    const resolved = doc.resolve(pos);
    const layoutDepth = resolved.depth;
    const layout = resolved.node(layoutDepth);
    return (
      layout.type.name === "layout" &&
      layoutHandsOffBoundedPlacementToSections(layout) &&
      isActiveFillOccupantAtDepth(resolved, layoutDepth, blockDefinitions)
    );
  } catch {
    return false;
  }
}

function isActiveBoundedParentForChild(
  resolved: ResolvedPos,
  parentDepth: number,
  blockDefinitions: BlockDefinitionLookup,
  child?: ProseMirrorNode,
): boolean {
  if (parentDepth < 0) return false;

  const parent = resolved.node(parentDepth);
  if (parent.type.name === "region") return true;

  if (parent.type.name === "cell") {
    const gridDepth = parentDepth - 1;
    return (
      gridDepth >= 0 &&
      resolved.node(gridDepth).type.name === "grid" &&
      isActiveFillOccupantAtDepth(resolved, gridDepth, blockDefinitions)
    );
  }

  if (parent.type.name === "section") {
    const layoutDepth = parentDepth - 1;
    return (
      layoutDepth >= 0 &&
      resolved.node(layoutDepth).type.name === "layout" &&
      layoutHandsOffBoundedPlacementToSections(resolved.node(layoutDepth)) &&
      isActiveFillOccupantAtDepth(resolved, layoutDepth, blockDefinitions)
    );
  }

  const stagedHost = blockDefinitions.getByNodeType(parent.type.name)?.stagedBoundedHost;
  if (stagedHost && child?.type.isInGroup(stagedHost.childGroup)) {
    return isActiveFillOccupantAtDepth(resolved, parentDepth, blockDefinitions);
  }

  return false;
}

function layoutHandsOffBoundedPlacementToSections(layout: ProseMirrorNode): boolean {
  const definition = builtInLayoutRegistry.getForNode(layout);
  return (
    definition?.boundedPlacement === "fill" &&
    definition.boundedSectionBehavior !== "terminal-scroll"
  );
}

function isActiveFillOccupantAtDepth(
  resolved: ResolvedPos,
  nodeDepth: number,
  blockDefinitions: BlockDefinitionLookup,
): boolean {
  if (nodeDepth <= 0) return false;
  return (
    isFillOccupantNode(resolved.node(nodeDepth), blockDefinitions) &&
    isActiveBoundedParentForChild(
      resolved,
      nodeDepth - 1,
      blockDefinitions,
      resolved.node(nodeDepth),
    )
  );
}

function hasDirectFillOccupant(
  node: ProseMirrorNode,
  blockDefinitions: BlockDefinitionLookup,
): boolean {
  let hasFillOccupant = false;

  node.forEach((child) => {
    if (hasFillOccupant) return;
    hasFillOccupant = isFillOccupantNode(child, blockDefinitions);
  });

  return hasFillOccupant;
}

function directFillOccupants(
  node: ProseMirrorNode,
  blockDefinitions: BlockDefinitionLookup,
): ProseMirrorNode[] {
  const fillOccupants: ProseMirrorNode[] = [];

  node.forEach((child) => {
    if (isFillOccupantNode(child, blockDefinitions)) fillOccupants.push(child);
  });

  return fillOccupants;
}
