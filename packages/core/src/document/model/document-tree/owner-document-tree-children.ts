import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type {
  DocumentTreeDefinition,
  ExposedDocumentChild,
  DocumentItemActivation,
  DocumentTreeItemDescription,
} from "./definition";
import type { DocumentTreeDefinitionLookup } from "./definition-lookup";
import { createDocumentTreeBuildHelpers } from "./document-tree-build-helpers";
import type {
  DocumentTreeBuildNodeIndex,
  DocumentTreeBuildNodeRecord,
} from "./document-tree-build-node-index";
import type { DocumentTreeSnapshotBuilder } from "./document-tree-snapshot-builder";

export interface DocumentTreeOwnerContext {
  readonly node: ProseMirrorNode;
  readonly id: EmbeddedNodeId;
  readonly nodeType: string;
  readonly definitionId: string;
  readonly absolutePos: number;
  readonly documentTree: DocumentTreeDefinition;
}

export interface ResolvedExposedDocumentChild {
  readonly candidate: ExposedDocumentChild;
  readonly node: ProseMirrorNode;
  readonly id: EmbeddedNodeId;
  readonly relativePos: number;
  readonly absolutePos: number;
  readonly parentNodeType: string;
  readonly authoringAnchorId: EmbeddedNodeId | null;
  readonly activationPath: readonly DocumentItemActivation[];
}

export function evaluateOwnerDescription(
  owner: DocumentTreeOwnerContext,
  definitions: DocumentTreeDefinitionLookup,
  builder: DocumentTreeSnapshotBuilder,
): DocumentTreeItemDescription | null {
  const describe = owner.documentTree.describe;
  if (!describe) return null;
  const helpers = createDocumentTreeBuildHelpers(owner.node, definitions);

  try {
    const description = describe({
      owner: owner.node,
      ownerId: owner.id,
      definitionId: owner.definitionId,
      helpers,
    });
    if (!isValidDescription(description)) {
      addDiagnostic(builder, "invalid-definition-description", owner);
      return null;
    }
    return description;
  } catch {
    addDiagnostic(builder, "definition-callback-failed", owner);
    return null;
  }
}

export function buildOwnerDocumentTreeChildren(
  owner: DocumentTreeOwnerContext,
  definitions: DocumentTreeDefinitionLookup,
  nodeIndex: DocumentTreeBuildNodeIndex,
  builder: DocumentTreeSnapshotBuilder,
): readonly ResolvedExposedDocumentChild[] {
  const projectChildren = owner.documentTree.projectChildren;
  if (!projectChildren) return [];
  const helpers = createDocumentTreeBuildHelpers(owner.node, definitions);

  let candidates: readonly ExposedDocumentChild[];
  try {
    candidates = projectChildren({
      owner: owner.node,
      ownerId: owner.id,
      definitionId: owner.definitionId,
      helpers,
    });
    if (!Array.isArray(candidates)) throw new TypeError("Invalid semantic child candidates.");
  } catch {
    addDiagnostic(builder, "definition-callback-failed", owner);
    return [];
  }

  const ownerRecord = nodeIndex.getByAbsolutePos(owner.absolutePos);
  if (!ownerRecord || ownerRecord.node !== owner.node || ownerRecord.id !== owner.id) {
    addDiagnostic(builder, "invalid-published-candidate", owner);
    return [];
  }

  const seenIds = new Set<EmbeddedNodeId>();
  const resolved: ResolvedExposedDocumentChild[] = [];
  for (const candidate of candidates) {
    const record = resolveCandidateRecord(candidate, ownerRecord, nodeIndex);
    if (!record?.id) {
      addDiagnostic(builder, "invalid-published-candidate", owner, record ?? null);
      continue;
    }
    if (seenIds.has(record.id)) {
      addDiagnostic(builder, "duplicate-published-candidate", owner, record);
      continue;
    }
    seenIds.add(record.id);

    if (nodeIndex.crossesMountedBlockBoundary(ownerRecord, record)) {
      addDiagnostic(builder, "invalid-published-candidate", owner, record);
      continue;
    }

    const authoringAnchorId = validateAuthoringAnchor(candidate, owner);
    if (authoringAnchorId === undefined) {
      addDiagnostic(builder, "invalid-published-candidate", owner, record);
      continue;
    }

    const activationPath = validateActivationPath(
      candidate.activation ?? [],
      record,
      ownerRecord,
      nodeIndex,
      definitions,
    );
    if (!activationPath) {
      addDiagnostic(builder, "invalid-activation-relationship", owner, record);
      continue;
    }

    resolved.push(
      Object.freeze({
        candidate,
        node: record.node,
        id: record.id,
        relativePos: candidate.relativePos,
        absolutePos: record.from,
        parentNodeType: record.parentNodeType,
        authoringAnchorId,
        activationPath,
      }),
    );
  }

  return Object.freeze(resolved.sort((left, right) => left.relativePos - right.relativePos));
}

function validateAuthoringAnchor(
  candidate: ExposedDocumentChild,
  owner: DocumentTreeOwnerContext,
): EmbeddedNodeId | null | undefined {
  if (candidate.authoringAnchorId === undefined) return null;
  if (
    candidate.treeRole !== "exposed-child" ||
    !EmbeddedNodeIdSchema.safeParse(candidate.authoringAnchorId).success ||
    candidate.authoringAnchorId !== owner.id
  ) {
    return undefined;
  }
  return candidate.authoringAnchorId;
}

function resolveCandidateRecord(
  candidate: ExposedDocumentChild,
  owner: DocumentTreeBuildNodeRecord,
  nodeIndex: DocumentTreeBuildNodeIndex,
): DocumentTreeBuildNodeRecord | null {
  if (
    candidate === null ||
    typeof candidate !== "object" ||
    !Number.isSafeInteger(candidate.relativePos) ||
    candidate.relativePos < 0
  ) {
    return null;
  }
  const record = nodeIndex.getByAbsolutePos(owner.from + 1 + candidate.relativePos);
  return record && nodeIndex.isDescendant(owner, record) ? record : null;
}

function validateActivationPath(
  path: readonly DocumentItemActivation[],
  candidate: DocumentTreeBuildNodeRecord,
  semanticOwner: DocumentTreeBuildNodeRecord,
  nodeIndex: DocumentTreeBuildNodeIndex,
  definitions: DocumentTreeDefinitionLookup,
): readonly DocumentItemActivation[] | null {
  if (!Array.isArray(path)) return null;
  let previousOwner: DocumentTreeBuildNodeRecord | null = null;
  let previousChild: DocumentTreeBuildNodeRecord | null = null;

  const findOwnedNode = (id: EmbeddedNodeId): DocumentTreeBuildNodeRecord | undefined => {
    const record = nodeIndex.getById(id);
    return record && (record === semanticOwner || nodeIndex.isDescendant(semanticOwner, record))
      ? record
      : undefined;
  };

  for (const relationship of path) {
    if (!isActivationRelationship(relationship)) return null;
    const owner = findOwnedNode(relationship.ownerId);
    const child = findOwnedNode(relationship.childId);
    if (
      !owner ||
      !child ||
      owner.id === child.id ||
      !contains(owner, child) ||
      !ownerMatchesKind(owner.node, relationship.ownerKind, definitions) ||
      (previousChild !== null &&
        previousChild.id !== owner.id &&
        !contains(previousChild, owner) &&
        !(previousOwner?.id === owner.id && contains(previousChild, child)))
    ) {
      return null;
    }
    previousOwner = owner;
    previousChild = child;
  }

  if (
    previousChild !== null &&
    previousChild.id !== candidate.id &&
    !contains(previousChild, candidate)
  ) {
    return null;
  }

  return Object.freeze(path.map((relationship) => Object.freeze({ ...relationship })));
}

function isActivationRelationship(value: unknown): value is DocumentItemActivation {
  if (!value || typeof value !== "object") return false;
  const relationship = value as Partial<DocumentItemActivation>;
  return (
    EmbeddedNodeIdSchema.safeParse(relationship.ownerId).success &&
    EmbeddedNodeIdSchema.safeParse(relationship.childId).success &&
    (relationship.ownerKind === "surface" ||
      relationship.ownerKind === "layout" ||
      relationship.ownerKind === "block")
  );
}

function ownerMatchesKind(
  node: ProseMirrorNode,
  ownerKind: DocumentItemActivation["ownerKind"],
  definitions: DocumentTreeDefinitionLookup,
): boolean {
  if (ownerKind === "surface") return node.type.name === "surface";
  if (ownerKind === "layout") return node.type.name === "layout";
  return definitions.blocks.get(node.type.name) !== undefined;
}

function contains(owner: DocumentTreeBuildNodeRecord, child: DocumentTreeBuildNodeRecord): boolean {
  return owner.from < child.from && owner.to >= child.to;
}

function isValidDescription(value: unknown): value is DocumentTreeItemDescription {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const description = value as DocumentTreeItemDescription;
  return (
    (description.label === undefined || typeof description.label === "string") &&
    (description.summary === undefined || typeof description.summary === "string")
  );
}

function addDiagnostic(
  builder: DocumentTreeSnapshotBuilder,
  code:
    | "definition-callback-failed"
    | "invalid-definition-description"
    | "invalid-published-candidate"
    | "duplicate-published-candidate"
    | "invalid-activation-relationship",
  owner: DocumentTreeOwnerContext,
  candidate: DocumentTreeBuildNodeRecord | null = null,
): void {
  builder.addDiagnostic({
    code,
    ownerId: owner.id,
    candidateId: candidate?.id ?? null,
    ownerNodeType: owner.nodeType,
    candidateNodeType: candidate?.node.type.name ?? null,
  });
}
