import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type {
  DocumentSemanticsDefinition,
  PublishedSemanticChild,
  SemanticActivationRelationship,
  SemanticItemDescription,
} from "./definition";
import type { SemanticDefinitionLookup } from "./definition-lookup";
import { createSemanticProjectionHelpers } from "./projection-helpers";
import type { SemanticSnapshotBuilder } from "./snapshot-builder";

export interface SemanticOwnerContext {
  readonly node: ProseMirrorNode;
  readonly id: EmbeddedNodeId;
  readonly nodeType: string;
  readonly definitionId: string;
  readonly absolutePos: number;
  readonly documentSemantics: DocumentSemanticsDefinition;
}

export interface ResolvedPublishedSemanticChild {
  readonly candidate: PublishedSemanticChild;
  readonly node: ProseMirrorNode;
  readonly id: EmbeddedNodeId;
  readonly relativePos: number;
  readonly absolutePos: number;
  readonly parentNodeType: string;
  readonly authoringAnchorId: EmbeddedNodeId | null;
  readonly activationPath: readonly SemanticActivationRelationship[];
}

interface OwnedNodeRecord {
  readonly node: ProseMirrorNode;
  readonly id: EmbeddedNodeId | null;
  readonly from: number;
  readonly to: number;
  readonly ancestors: readonly ProseMirrorNode[];
  readonly parentNodeType: string;
}

export function evaluateOwnerDescription(
  owner: SemanticOwnerContext,
  definitions: SemanticDefinitionLookup,
  builder: SemanticSnapshotBuilder,
): SemanticItemDescription | null {
  const describe = owner.documentSemantics.describe;
  if (!describe) return null;
  const helpers = createSemanticProjectionHelpers(owner.node, definitions);

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

export function resolveOwnerPublication(
  owner: SemanticOwnerContext,
  definitions: SemanticDefinitionLookup,
  builder: SemanticSnapshotBuilder,
): readonly ResolvedPublishedSemanticChild[] {
  const projectChildren = owner.documentSemantics.projectChildren;
  if (!projectChildren) return [];
  const helpers = createSemanticProjectionHelpers(owner.node, definitions);

  let candidates: readonly PublishedSemanticChild[];
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

  const ownedNodes = indexOwnedNodes(owner.node);
  const ownedNodeById = new Map(
    ownedNodes
      .filter((record): record is OwnedNodeRecord & { readonly id: EmbeddedNodeId } =>
        Boolean(record.id),
      )
      .map((record) => [record.id, record]),
  );
  ownedNodeById.set(owner.id, {
    node: owner.node,
    id: owner.id,
    from: -1,
    to: owner.node.nodeSize - 1,
    ancestors: [],
    parentNodeType: owner.node.type.name,
  });

  const seenIds = new Set<EmbeddedNodeId>();
  const resolved: ResolvedPublishedSemanticChild[] = [];
  for (const candidate of candidates) {
    const record = resolveCandidateRecord(candidate, ownedNodes);
    if (!record?.id) {
      addDiagnostic(builder, "invalid-published-candidate", owner, record ?? null);
      continue;
    }
    if (seenIds.has(record.id)) {
      addDiagnostic(builder, "duplicate-published-candidate", owner, record);
      continue;
    }
    seenIds.add(record.id);

    if (record.ancestors.some((ancestor) => definitions.blocks.get(ancestor.type.name))) {
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
      ownedNodeById,
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
        relativePos: record.from,
        absolutePos: owner.absolutePos + 1 + record.from,
        parentNodeType: record.parentNodeType,
        authoringAnchorId,
        activationPath,
      }),
    );
  }

  return Object.freeze(resolved.sort((left, right) => left.relativePos - right.relativePos));
}

function validateAuthoringAnchor(
  candidate: PublishedSemanticChild,
  owner: SemanticOwnerContext,
): EmbeddedNodeId | null | undefined {
  if (candidate.authoringAnchorId === undefined) return null;
  if (
    candidate.semanticRole !== "published-child" ||
    !EmbeddedNodeIdSchema.safeParse(candidate.authoringAnchorId).success ||
    candidate.authoringAnchorId !== owner.id
  ) {
    return undefined;
  }
  return candidate.authoringAnchorId;
}

function indexOwnedNodes(owner: ProseMirrorNode): readonly OwnedNodeRecord[] {
  const records: OwnedNodeRecord[] = [];
  const visit = (
    parent: ProseMirrorNode,
    parentContentStart: number,
    ancestors: readonly ProseMirrorNode[],
  ): void => {
    let offset = 0;
    parent.forEach((node) => {
      const from = parentContentStart + offset;
      const parsedId = EmbeddedNodeIdSchema.safeParse(node.attrs["id"]);
      records.push({
        node,
        id: parsedId.success ? parsedId.data : null,
        from,
        to: from + node.nodeSize,
        ancestors,
        parentNodeType: parent.type.name,
      });
      if (!node.isText) visit(node, from + 1, [...ancestors, node]);
      offset += node.nodeSize;
    });
  };
  visit(owner, 0, []);
  return records;
}

function resolveCandidateRecord(
  candidate: PublishedSemanticChild,
  ownedNodes: readonly OwnedNodeRecord[],
): OwnedNodeRecord | null {
  if (
    candidate === null ||
    typeof candidate !== "object" ||
    !Number.isSafeInteger(candidate.relativePos) ||
    candidate.relativePos < 0
  ) {
    return null;
  }
  return ownedNodes.find(({ from }) => from === candidate.relativePos) ?? null;
}

function validateActivationPath(
  path: readonly SemanticActivationRelationship[],
  candidate: OwnedNodeRecord,
  ownedNodeById: ReadonlyMap<EmbeddedNodeId, OwnedNodeRecord>,
  definitions: SemanticDefinitionLookup,
): readonly SemanticActivationRelationship[] | null {
  if (!Array.isArray(path)) return null;
  let previousOwner: OwnedNodeRecord | null = null;
  let previousChild: OwnedNodeRecord | null = null;

  for (const relationship of path) {
    if (!isActivationRelationship(relationship)) return null;
    const owner = ownedNodeById.get(relationship.ownerId);
    const child = ownedNodeById.get(relationship.childId);
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

function isActivationRelationship(value: unknown): value is SemanticActivationRelationship {
  if (!value || typeof value !== "object") return false;
  const relationship = value as Partial<SemanticActivationRelationship>;
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
  ownerKind: SemanticActivationRelationship["ownerKind"],
  definitions: SemanticDefinitionLookup,
): boolean {
  if (ownerKind === "surface") return node.type.name === "surface";
  if (ownerKind === "layout") return node.type.name === "layout";
  return definitions.blocks.get(node.type.name) !== undefined;
}

function contains(owner: OwnedNodeRecord, child: OwnedNodeRecord): boolean {
  return owner.from < child.from && owner.to >= child.to;
}

function isValidDescription(value: unknown): value is SemanticItemDescription {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const description = value as SemanticItemDescription;
  return (
    (description.label === undefined || typeof description.label === "string") &&
    (description.summary === undefined || typeof description.summary === "string")
  );
}

function addDiagnostic(
  builder: SemanticSnapshotBuilder,
  code:
    | "definition-callback-failed"
    | "invalid-definition-description"
    | "invalid-published-candidate"
    | "duplicate-published-candidate"
    | "invalid-activation-relationship",
  owner: SemanticOwnerContext,
  candidate: OwnedNodeRecord | null = null,
): void {
  builder.addDiagnostic({
    code,
    ownerId: owner.id,
    candidateId: candidate?.id ?? null,
    ownerNodeType: owner.nodeType,
    candidateNodeType: candidate?.node.type.name ?? null,
  });
}
