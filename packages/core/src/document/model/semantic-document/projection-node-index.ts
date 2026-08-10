import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { readUnavailableContentCompatibilityRoot } from "../establishment/unavailable-content-compatibility-root";
import type { SemanticDefinitionLookup } from "./definition-lookup";

export interface SemanticProjectionNodeRecord {
  readonly node: ProseMirrorNode;
  readonly id: EmbeddedNodeId | null;
  readonly from: number;
  readonly to: number;
  readonly parentNodeType: string;
  readonly nearestMountedBlockAncestor: SemanticProjectionNodeRecord | null;
}

export interface SemanticProjectionNodeIndex {
  getByAbsolutePos(position: number): SemanticProjectionNodeRecord | undefined;
  getById(id: EmbeddedNodeId): SemanticProjectionNodeRecord | undefined;
  isDescendant(
    owner: SemanticProjectionNodeRecord,
    candidate: SemanticProjectionNodeRecord,
  ): boolean;
  crossesMountedBlockBoundary(
    owner: SemanticProjectionNodeRecord,
    candidate: SemanticProjectionNodeRecord,
  ): boolean;
}

export function createSemanticProjectionNodeIndex(
  doc: ProseMirrorNode,
  definitions: SemanticDefinitionLookup,
): SemanticProjectionNodeIndex {
  const byAbsolutePos = new Map<number, SemanticProjectionNodeRecord>();
  const byId = new Map<EmbeddedNodeId, SemanticProjectionNodeRecord>();

  const indexChildren = (
    parent: ProseMirrorNode,
    parentPos: number,
    nearestMountedBlockAncestor: SemanticProjectionNodeRecord | null,
  ): void => {
    let offset = 0;
    parent.forEach((node) => {
      const from = parentPos + (parent.type.name === "doc" ? 0 : 1) + offset;
      const parsedId = EmbeddedNodeIdSchema.safeParse(node.attrs["id"]);
      const record: SemanticProjectionNodeRecord = Object.freeze({
        node,
        id: parsedId.success ? parsedId.data : null,
        from,
        to: from + node.nodeSize,
        parentNodeType: parent.type.name,
        nearestMountedBlockAncestor,
      });
      byAbsolutePos.set(from, record);
      if (record.id) byId.set(record.id, record);

      const unavailableRoot = readUnavailableContentCompatibilityRoot(node.type.name, node.attrs);
      if (!node.isText && !unavailableRoot) {
        indexChildren(
          node,
          from,
          definitions.blocks.get(node.type.name) ? record : nearestMountedBlockAncestor,
        );
      }
      offset += node.nodeSize;
    });
  };

  indexChildren(doc, 0, null);

  const isDescendant = (
    owner: SemanticProjectionNodeRecord,
    candidate: SemanticProjectionNodeRecord,
  ): boolean => owner.from < candidate.from && owner.to >= candidate.to;

  return Object.freeze({
    getByAbsolutePos: (position: number) => byAbsolutePos.get(position),
    getById: (id: EmbeddedNodeId) => byId.get(id),
    isDescendant,
    crossesMountedBlockBoundary: (
      owner: SemanticProjectionNodeRecord,
      candidate: SemanticProjectionNodeRecord,
    ) => {
      const boundary = candidate.nearestMountedBlockAncestor;
      return boundary !== null && boundary !== owner && isDescendant(owner, boundary);
    },
  });
}
