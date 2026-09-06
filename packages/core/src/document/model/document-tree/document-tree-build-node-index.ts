import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { readUnavailableContentCompatibilityRoot } from "../establishment/unavailable-content-compatibility-root";
import type { DocumentTreeDefinitionLookup } from "./definition-lookup";

export interface DocumentTreeBuildNodeRecord {
  readonly node: ProseMirrorNode;
  readonly id: EmbeddedNodeId | null;
  readonly from: number;
  readonly to: number;
  readonly parentNodeType: string;
  readonly nearestMountedBlockAncestor: DocumentTreeBuildNodeRecord | null;
}

export interface DocumentTreeBuildNodeIndex {
  getByAbsolutePos(position: number): DocumentTreeBuildNodeRecord | undefined;
  getById(id: EmbeddedNodeId): DocumentTreeBuildNodeRecord | undefined;
  isDescendant(owner: DocumentTreeBuildNodeRecord, candidate: DocumentTreeBuildNodeRecord): boolean;
  crossesMountedBlockBoundary(
    owner: DocumentTreeBuildNodeRecord,
    candidate: DocumentTreeBuildNodeRecord,
  ): boolean;
}

export function createDocumentTreeBuildNodeIndex(
  doc: ProseMirrorNode,
  definitions: DocumentTreeDefinitionLookup,
): DocumentTreeBuildNodeIndex {
  const byAbsolutePos = new Map<number, DocumentTreeBuildNodeRecord>();
  const byId = new Map<EmbeddedNodeId, DocumentTreeBuildNodeRecord>();

  const indexChildren = (
    parent: ProseMirrorNode,
    parentPos: number,
    nearestMountedBlockAncestor: DocumentTreeBuildNodeRecord | null,
  ): void => {
    let offset = 0;
    parent.forEach((node) => {
      const from = parentPos + (parent.type.name === "doc" ? 0 : 1) + offset;
      const parsedId = EmbeddedNodeIdSchema.safeParse(node.attrs["id"]);
      const record: DocumentTreeBuildNodeRecord = Object.freeze({
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
    owner: DocumentTreeBuildNodeRecord,
    candidate: DocumentTreeBuildNodeRecord,
  ): boolean => owner.from < candidate.from && owner.to >= candidate.to;

  return Object.freeze({
    getByAbsolutePos: (position: number) => byAbsolutePos.get(position),
    getById: (id: EmbeddedNodeId) => byId.get(id),
    isDescendant,
    crossesMountedBlockBoundary: (
      owner: DocumentTreeBuildNodeRecord,
      candidate: DocumentTreeBuildNodeRecord,
    ) => {
      const boundary = candidate.nearestMountedBlockAncestor;
      return boundary !== null && boundary !== owner && isDescendant(owner, boundary);
    },
  });
}
