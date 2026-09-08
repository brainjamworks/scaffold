import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import {
  CELL_NODE_TYPE,
  LAYER_NODE_TYPE,
  REGION_NODE_TYPE,
  SECTION_NODE_TYPE,
} from "@/document/model/nodes/structural-node-types";
import type {
  LayoutSectionCompositionSlot,
  LayoutSectionStructure,
} from "@/editor/arrangements/layout/model/layout-definition";
import type { LayoutRegistry } from "@/editor/arrangements/layout/model/layout-registry";

export type LayerLogicalOwnerType =
  | typeof REGION_NODE_TYPE
  | typeof CELL_NODE_TYPE
  | typeof SECTION_NODE_TYPE;

export interface LayerOwnerIdentity {
  readonly id: EmbeddedNodeId;
  readonly nodeType: LayerLogicalOwnerType;
  readonly pos: number;
  readonly node: ProseMirrorNode;
}

export interface LayerPhysicalSlotIdentity {
  readonly id: EmbeddedNodeId;
  readonly nodeType: string;
  readonly pos: number;
  readonly node: ProseMirrorNode;
}

export interface LayerContentPolicy {
  readonly directGrid: "allowed" | "forbidden";
  readonly fillOccupants: "exclusive";
}

export interface LayerOwnerSlot {
  readonly logicalOwner: LayerOwnerIdentity;
  readonly physicalSlot: LayerPhysicalSlotIdentity;
  readonly orderedLayerIds: readonly EmbeddedNodeId[];
  readonly policy: LayerContentPolicy;
}

export type LayerOwnerSlotResolutionError =
  | {
      readonly reason: "owner-missing";
      readonly requestedOwnerId: EmbeddedNodeId;
    }
  | {
      readonly reason: "unsupported-owner";
      readonly targetId: EmbeddedNodeId;
      readonly actualNodeType: string;
    };

export type LayerOwnerSlotResolution =
  | { readonly status: "ready"; readonly value: LayerOwnerSlot }
  | { readonly status: "error"; readonly error: LayerOwnerSlotResolutionError };

export interface ResolveLayerOwnerSlotInput {
  readonly doc: ProseMirrorNode;
  readonly ownerId: EmbeddedNodeId;
  readonly layoutDefinitions: LayoutRegistry;
  readonly index?: LayerOwnerSlotIndex;
}

export interface LayerOwnerSlotIndexEntry {
  readonly node: ProseMirrorNode;
  readonly pos: number;
}

/** Document-snapshot-local derived lookup used while validating one transaction. */
export interface LayerOwnerSlotIndex {
  readonly doc: ProseMirrorNode;
  readonly nodeById: ReadonlyMap<EmbeddedNodeId, LayerOwnerSlotIndexEntry>;
  readonly duplicateIds: ReadonlySet<EmbeddedNodeId>;
  readonly layerEntries: readonly LayerOwnerSlotIndexEntry[];
}

export function createLayerOwnerSlotIndex(doc: ProseMirrorNode): LayerOwnerSlotIndex {
  const nodeById = new Map<EmbeddedNodeId, LayerOwnerSlotIndexEntry>();
  const duplicateIds = new Set<EmbeddedNodeId>();
  const layerEntries: LayerOwnerSlotIndexEntry[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === LAYER_NODE_TYPE) layerEntries.push(Object.freeze({ node, pos }));
    const id = node.attrs["id"];
    if (typeof id !== "string" || id.length === 0) return true;
    if (nodeById.has(id as EmbeddedNodeId)) {
      duplicateIds.add(id as EmbeddedNodeId);
      return true;
    }
    nodeById.set(id as EmbeddedNodeId, Object.freeze({ node, pos }));
    return true;
  });
  return Object.freeze({
    doc,
    nodeById,
    duplicateIds,
    layerEntries: Object.freeze(layerEntries),
  });
}

export function resolveLayerOwnerSlot({
  doc,
  ownerId,
  layoutDefinitions,
  index = createLayerOwnerSlotIndex(doc),
}: ResolveLayerOwnerSlotInput): LayerOwnerSlotResolution {
  if (index.doc !== doc) {
    throw new Error("Layer owner-slot index belongs to a different document snapshot.");
  }
  if (index.duplicateIds.has(ownerId)) {
    throw new Error(`Duplicate document identity "${ownerId}".`);
  }
  const ownerMatch = index.nodeById.get(ownerId) ?? null;
  if (!ownerMatch) {
    return Object.freeze({
      status: "error",
      error: Object.freeze({ reason: "owner-missing", requestedOwnerId: ownerId }),
    });
  }

  if (!isLayerLogicalOwnerType(ownerMatch.node.type.name)) {
    return Object.freeze({
      status: "error",
      error: Object.freeze({
        reason: "unsupported-owner",
        targetId: ownerId,
        actualNodeType: ownerMatch.node.type.name,
      }),
    });
  }

  const logicalOwner = Object.freeze({
    id: requireStableId(ownerMatch.node, "logical owner"),
    nodeType: ownerMatch.node.type.name,
    pos: ownerMatch.pos,
    node: ownerMatch.node,
  });
  const physicalSlot = resolvePhysicalSlot(doc, logicalOwner, layoutDefinitions);
  const orderedLayerIds: EmbeddedNodeId[] = [];
  const seenLayerIds = new Set<EmbeddedNodeId>();

  physicalSlot.node.forEach((child) => {
    if (child.type.name !== LAYER_NODE_TYPE) {
      throw new Error(
        `Layer composition slot "${physicalSlot.id}" contains unexpected child "${child.type.name}".`,
      );
    }
    const layerId = requireStableId(child, "Layer");
    if (seenLayerIds.has(layerId)) {
      throw new Error(`Duplicate Layer identity "${layerId}" in slot "${physicalSlot.id}".`);
    }
    seenLayerIds.add(layerId);
    orderedLayerIds.push(layerId);
  });
  if (orderedLayerIds.length === 0) {
    throw new Error(`Layer composition slot "${physicalSlot.id}" has no Layers.`);
  }

  return Object.freeze({
    status: "ready",
    value: Object.freeze({
      logicalOwner,
      physicalSlot,
      orderedLayerIds: Object.freeze(orderedLayerIds),
      policy: policyForOwner(logicalOwner.nodeType),
    }),
  });
}

function resolvePhysicalSlot(
  doc: ProseMirrorNode,
  owner: LayerOwnerIdentity,
  layoutDefinitions: LayoutRegistry,
): LayerPhysicalSlotIdentity {
  if (owner.nodeType !== SECTION_NODE_TYPE) {
    return Object.freeze({ ...owner });
  }

  const resolved = doc.resolve(owner.pos);
  const layout = resolved.parent;
  if (layout.type.name !== "layout") {
    throw new Error(`Section "${owner.id}" is not directly owned by a Layout.`);
  }
  const definition = layoutDefinitions.getForNode(layout);
  if (!definition?.section) {
    throw new Error(`Section "${owner.id}" belongs to an unregistered Layout.`);
  }

  assertDeclaredSectionStructure(owner, definition.section.structure);
  return resolveDeclaredPhysicalSlot(owner, definition.section.compositionSlot);
}

function resolveDeclaredPhysicalSlot(
  owner: LayerOwnerIdentity,
  declaration: LayoutSectionCompositionSlot,
): LayerPhysicalSlotIdentity {
  if (declaration.kind === "direct") return Object.freeze({ ...owner });

  const matches: {
    readonly node: ProseMirrorNode;
    readonly index: number;
    readonly pos: number;
  }[] = [];
  let offset = 0;
  owner.node.forEach((child, _childOffset, index) => {
    if (child.type.name === declaration.nodeType) {
      matches.push({ node: child, index, pos: owner.pos + 1 + offset });
    }
    offset += child.nodeSize;
  });

  if (matches.length === 0) {
    const nestedPaths = findDescendantPaths(owner.node, declaration.nodeType);
    if (nestedPaths.length > 0) {
      throw new Error(
        `Section "${owner.id}" has declared slot child "${declaration.nodeType}" only at nested path ${formatPath(nestedPaths[0]!)}.`,
      );
    }
    const childTypes = directChildTypes(owner.node);
    throw new Error(
      childTypes.length === 0
        ? `Section "${owner.id}" is missing declared slot child "${declaration.nodeType}".`
        : `Section "${owner.id}" expected direct slot child "${declaration.nodeType}" but found [${childTypes.join(", ")}].`,
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `Section "${owner.id}" has ${matches.length} direct slot children "${declaration.nodeType}" at indexes [${matches.map(({ index }) => index).join(", ")}].`,
    );
  }

  const match = matches[0]!;
  return Object.freeze({
    id: requireStableId(match.node, "physical composition slot"),
    nodeType: match.node.type.name,
    pos: match.pos,
    node: match.node,
  });
}

function assertDeclaredSectionStructure(
  owner: LayerOwnerIdentity,
  structure: LayoutSectionStructure | undefined,
): void {
  if (!structure) return;
  const actual = directChildTypes(owner.node);
  if (sameStrings(actual, structure.nodeTypes)) return;
  throw new Error(
    `Section "${owner.id}" violates declared ${structure.kind} structure: expected [${structure.nodeTypes.join(", ")}], found [${actual.join(", ")}].`,
  );
}

function findDescendantPaths(
  node: ProseMirrorNode,
  nodeType: string,
): readonly (readonly number[])[] {
  const paths: number[][] = [];
  const visit = (parent: ProseMirrorNode, path: readonly number[]) => {
    parent.forEach((child, _offset, index) => {
      const childPath = [...path, index];
      if (path.length > 0 && child.type.name === nodeType) paths.push(childPath);
      visit(child, childPath);
    });
  };
  visit(node, []);
  return paths;
}

function directChildTypes(node: ProseMirrorNode): readonly string[] {
  const types: string[] = [];
  node.forEach((child) => types.push(child.type.name));
  return types;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function formatPath(path: readonly number[]): string {
  return `[${path.join(", ")}]`;
}

function requireStableId(node: ProseMirrorNode, label: string): EmbeddedNodeId {
  const parsed = EmbeddedNodeIdSchema.safeParse(node.attrs["id"]);
  if (!parsed.success) {
    throw new Error(`${label} "${node.type.name}" has no valid stable identity.`);
  }
  return parsed.data;
}

function isLayerLogicalOwnerType(value: string): value is LayerLogicalOwnerType {
  return value === REGION_NODE_TYPE || value === CELL_NODE_TYPE || value === SECTION_NODE_TYPE;
}

function policyForOwner(ownerType: LayerLogicalOwnerType): LayerContentPolicy {
  return Object.freeze({
    directGrid: ownerType === CELL_NODE_TYPE ? "forbidden" : "allowed",
    fillOccupants: "exclusive",
  });
}
