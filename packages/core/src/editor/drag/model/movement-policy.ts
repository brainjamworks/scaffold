import type { Schema, Node as ProseMirrorNode, NodeType } from "@tiptap/pm/model";

import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";

export type MovementAncestor = {
  index: number;
  node: ProseMirrorNode;
  nodeType: NodeType;
  parent: ProseMirrorNode;
  pos: number;
};

export type MovementNodeContext = {
  ancestors: MovementAncestor[];
  index: number;
  node: ProseMirrorNode;
  nodeType: NodeType;
  parent: ProseMirrorNode | null;
  parentPos: number | null;
  parentType: NodeType | null;
  pos: number;
};

export type StructureMovementPolicy = {
  sourceTypes: ReadonlySet<NodeType>;
  targetTypes: ReadonlySet<NodeType>;
};

const STRUCTURE_MOVEMENT_SOURCE_NODE_NAMES = ["layout", "section"] as const;
const STRUCTURE_MOVEMENT_TARGET_NODE_NAMES = [
  "surface",
  "grid",
  "layout",
  "cell",
  "region",
  "section",
] as const;
const STRUCTURE_MOVEMENT_REJECTED_SOURCE_NODE_NAMES = ["grid", "cell"] as const;
const CONTAINED_MOVEMENT_NODE_NAMES = new Set([
  "selectable_choice",
  "sequencing_item",
  "matching_pair",
  "categorise_bin",
  "categorise_item",
  "timeline_item",
]);

export function createStructureMovementPolicy(
  schema: Schema,
  blockDefinitions: BlockDefinitionLookup,
): StructureMovementPolicy {
  const sourceTypes = new Set<NodeType>();
  const targetTypes = new Set<NodeType>();

  for (const nodeType of Object.values(schema.nodes)) {
    if (blockDefinitions.getByNodeType(nodeType.name)) {
      sourceTypes.add(nodeType);
      targetTypes.add(nodeType);
    }
  }

  for (const nodeName of STRUCTURE_MOVEMENT_SOURCE_NODE_NAMES) {
    const nodeType = schema.nodes[nodeName];
    if (nodeType) sourceTypes.add(nodeType);
  }

  for (const nodeName of STRUCTURE_MOVEMENT_TARGET_NODE_NAMES) {
    const nodeType = schema.nodes[nodeName];
    if (nodeType) targetTypes.add(nodeType);
  }

  for (const nodeName of STRUCTURE_MOVEMENT_REJECTED_SOURCE_NODE_NAMES) {
    const nodeType = schema.nodes[nodeName];
    if (nodeType) sourceTypes.delete(nodeType);
  }

  return { sourceTypes, targetTypes };
}

export function canStartStructureMovement(
  policy: StructureMovementPolicy,
  context: MovementNodeContext | null | undefined,
): boolean {
  return Boolean(context && policy.sourceTypes.has(context.nodeType));
}

export function canTargetStructureMovement(
  policy: StructureMovementPolicy,
  context: MovementNodeContext | null | undefined,
): boolean {
  return Boolean(context && policy.targetTypes.has(context.nodeType));
}

export function canStartContainedMovement(
  context: MovementNodeContext | null | undefined,
): boolean {
  return Boolean(context && CONTAINED_MOVEMENT_NODE_NAMES.has(context.nodeType.name));
}

export function canTargetContainedMovement(
  source: MovementNodeContext,
  target: MovementNodeContext | null | undefined,
): boolean {
  if (!target || !canStartContainedMovement(target)) return false;
  if (source.pos === target.pos) return false;
  if (source.nodeType !== target.nodeType) return false;
  if (source.parent !== target.parent) return false;
  if (source.parentPos !== target.parentPos) return false;
  return true;
}

export function resolveContainedMovementSourceContext(
  doc: ProseMirrorNode,
  pos: number,
): MovementNodeContext | null {
  const context = resolveMovementNodeContext(doc, pos);
  return canStartContainedMovement(context) ? context : null;
}

export function canApplyStructureMovementBoundary(
  doc: ProseMirrorNode,
  sourcePos: number,
  targetPos: number,
): boolean {
  const sourceNode = doc.nodeAt(sourcePos);
  if (!sourceNode || sourceNode.type.name !== "section") return true;

  const sourceOwner = findOwningLayout(doc, sourcePos);
  const targetOwner = findTargetLayoutOwner(doc, targetPos);
  return Boolean(sourceOwner && targetOwner && sourceOwner.pos === targetOwner.pos);
}

export function resolveMovementNodeContext(
  doc: ProseMirrorNode,
  pos: number,
): MovementNodeContext | null {
  const node = doc.nodeAt(pos);
  if (!node) return null;

  const resolved = doc.resolve(pos);
  const ancestors: MovementAncestor[] = [];

  for (let depth = 1; depth <= resolved.depth; depth += 1) {
    const ancestorNode = resolved.node(depth);
    ancestors.push({
      index: resolved.index(depth - 1),
      node: ancestorNode,
      nodeType: ancestorNode.type,
      parent: resolved.node(depth - 1),
      pos: resolved.before(depth),
    });
  }

  return {
    ancestors,
    index: resolved.index(),
    node,
    nodeType: node.type,
    parent: resolved.depth > 0 ? resolved.parent : null,
    parentPos: resolved.depth > 0 ? resolved.before(resolved.depth) : null,
    parentType: resolved.depth > 0 ? resolved.parent.type : null,
    pos,
  };
}

export function resolveMovementTargetAtPos(
  policy: StructureMovementPolicy,
  doc: ProseMirrorNode,
  pos: number,
): MovementNodeContext | null {
  const directContext = resolveMovementNodeContext(doc, pos);
  if (canTargetStructureMovement(policy, directContext)) {
    return directContext;
  }

  const resolved = doc.resolve(pos);
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    const node = resolved.node(depth);
    const context = resolveMovementNodeContext(doc, resolved.before(depth));
    if (context && policy.targetTypes.has(node.type)) return context;
  }

  return null;
}

function findTargetLayoutOwner(
  doc: ProseMirrorNode,
  targetPos: number,
): { node: ProseMirrorNode; pos: number } | null {
  const targetNode = doc.nodeAt(targetPos);
  if (!targetNode) return null;

  if (targetNode.type.name === "layout") {
    return { node: targetNode, pos: targetPos };
  }

  if (targetNode.type.name === "section") {
    return findOwningLayout(doc, targetPos);
  }

  return null;
}

function findOwningLayout(
  doc: ProseMirrorNode,
  sectionPos: number,
): { node: ProseMirrorNode; pos: number } | null {
  try {
    const resolved = doc.resolve(sectionPos);
    if (resolved.parent.type.name !== "layout") return null;

    return {
      node: resolved.parent,
      pos: resolved.before(resolved.depth),
    };
  } catch {
    return null;
  }
}

export function containsPosition(
  parentPos: number,
  parentNode: ProseMirrorNode,
  pos: number,
): boolean {
  return pos > parentPos && pos < parentPos + parentNode.nodeSize;
}
