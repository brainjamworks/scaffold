import type { JSONContent } from "@tiptap/core";

import type { EmbeddedDataId, EmbeddedNodeId } from "@scaffold/contracts";
import { createEmbeddedDataId, createEmbeddedNodeId } from "./stable-ids";

type JsonRecord = Record<string, unknown>;

function cloneJsonValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneJsonValue(item)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, cloneJsonValue(child)]),
    ) as T;
  }

  return value;
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function readStableId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function regenerateAttrId(attrs: JsonRecord | undefined, createId: () => string) {
  const currentId = readStableId(attrs?.["id"]);
  if (!currentId || !attrs) return null;

  const nextId = createId();
  attrs["id"] = nextId;

  return { previous: currentId, next: nextId };
}

function regenerateIdsInNode(
  node: JSONContent,
  createId: () => string,
  nodeIdChanges: Map<EmbeddedNodeId, EmbeddedNodeId>,
): void {
  const replacement = regenerateAttrId(asRecord(node.attrs) ?? undefined, createId);
  if (replacement) {
    nodeIdChanges.set(replacement.previous as EmbeddedNodeId, replacement.next as EmbeddedNodeId);
  }

  node.content?.forEach((child) => regenerateIdsInNode(child, createId, nodeIdChanges));
}

export interface DuplicatedContentIdentityGenerators {
  /** Allocates identities for capability-private Data records only. */
  readonly createDataId: () => EmbeddedDataId;
}

export interface BlockDuplicationOperationInput {
  /** The cloned Block JSON after generic document-node ID regeneration. */
  readonly content: JSONContent;
  /** One immutable old-to-new document-node ID snapshot for the whole clone. */
  readonly nodeIdChanges: ReadonlyMap<EmbeddedNodeId, EmbeddedNodeId>;
  readonly generators: DuplicatedContentIdentityGenerators;
}

/** Purely repairs capability-private identity inside its own duplicated Block. */
export type BlockDuplicationOperation = (input: BlockDuplicationOperationInput) => JSONContent;

export interface BlockDuplicationLookup {
  readonly getByNodeType: (nodeType: string) => BlockDuplicationOperation | undefined;
  readonly hasNodeType: (nodeType: string) => boolean;
}

export interface CloneJsonWithNewStableIdsOptions {
  blockDuplications: BlockDuplicationLookup;
  createDataId?: DuplicatedContentIdentityGenerators["createDataId"];
  createId?: () => string;
}

export function cloneJsonWithNewStableIds<T extends JSONContent | JSONContent[]>(
  content: T,
  options: CloneJsonWithNewStableIdsOptions,
): T {
  const clone = cloneJsonValue(content);
  const createId = options.createId ?? createEmbeddedNodeId;
  const nodeIdChanges = new Map<EmbeddedNodeId, EmbeddedNodeId>();

  if (Array.isArray(clone)) {
    clone.forEach((node) => regenerateIdsInNode(node, createId, nodeIdChanges));
  } else {
    regenerateIdsInNode(clone, createId, nodeIdChanges);
  }

  const immutableNodeIdChanges = immutableReadonlyMap(nodeIdChanges);
  const generators = Object.freeze({
    createDataId: options.createDataId ?? createEmbeddedDataId,
  });

  if (Array.isArray(clone)) {
    return clone.map((node) =>
      applyBlockDuplicationsInsideOut(
        node,
        options.blockDuplications,
        immutableNodeIdChanges,
        generators,
      ),
    ) as T;
  }

  return applyBlockDuplicationsInsideOut(
    clone,
    options.blockDuplications,
    immutableNodeIdChanges,
    generators,
  ) as T;
}

function applyBlockDuplicationsInsideOut(
  node: JSONContent,
  blockDuplications: BlockDuplicationLookup,
  nodeIdChanges: ReadonlyMap<EmbeddedNodeId, EmbeddedNodeId>,
  generators: DuplicatedContentIdentityGenerators,
): JSONContent {
  if (node.content) {
    node.content = node.content.map((child) =>
      applyBlockDuplicationsInsideOut(child, blockDuplications, nodeIdChanges, generators),
    );
  }

  const duplication = node.type ? blockDuplications.getByNodeType(node.type) : undefined;
  if (!duplication) return node;

  const beforeOperation = cloneJsonValue(node);
  const repaired = duplication({ content: node, nodeIdChanges, generators });
  assertBlockDuplicationBoundary(beforeOperation, repaired, blockDuplications, node.type);
  return repaired;
}

function assertBlockDuplicationBoundary(
  before: JSONContent,
  after: JSONContent,
  blockDuplications: BlockDuplicationLookup,
  ownerNodeType: string | undefined,
): void {
  const violation = findBlockDuplicationBoundaryViolation(before, after, blockDuplications);
  if (!violation) return;

  throw new Error(`Block duplication operation for "${ownerNodeType ?? "unknown"}" ${violation}.`);
}

function findBlockDuplicationBoundaryViolation(
  before: JSONContent,
  after: JSONContent,
  blockDuplications: BlockDuplicationLookup,
): string | null {
  const afterRecord = asRecord(after);
  if (!afterRecord) return "returned a non-object node";
  if (before.type !== after.type) return "changed a node type";
  if (!sameNodeIdentity(before, after)) return "changed a document node ID";
  if (!sameProtectedNodeFields(before, after)) {
    return "changed text, marks, or another non-attribute node field";
  }

  const beforeContent = structuralContent(before);
  const afterContent = structuralContent(after);
  if (beforeContent.kind !== afterContent.kind) return "changed structural content topology";
  if (beforeContent.kind === "invalid" || afterContent.kind === "invalid") {
    return "returned invalid structural content";
  }
  if (beforeContent.kind === "absent" || afterContent.kind === "absent") return null;
  if (beforeContent.nodes.length !== afterContent.nodes.length) {
    return "changed structural content topology";
  }

  for (let index = 0; index < beforeContent.nodes.length; index += 1) {
    const beforeChild = beforeContent.nodes[index]!;
    const afterChild = afterContent.nodes[index]!;
    if (
      beforeChild.type &&
      blockDuplications.hasNodeType(beforeChild.type) &&
      !jsonValuesEqual(beforeChild, afterChild)
    ) {
      return `changed nested mounted Block "${beforeChild.type}"`;
    }

    const childViolation = findBlockDuplicationBoundaryViolation(
      beforeChild,
      afterChild,
      blockDuplications,
    );
    if (childViolation) return childViolation;
  }

  return null;
}

function sameNodeIdentity(before: JSONContent, after: JSONContent): boolean {
  const beforeAttrs = asRecord(before.attrs);
  const afterAttrs = asRecord(after.attrs);
  const beforeHasId = beforeAttrs ? Object.hasOwn(beforeAttrs, "id") : false;
  const afterHasId = afterAttrs ? Object.hasOwn(afterAttrs, "id") : false;
  return beforeHasId === afterHasId && jsonValuesEqual(beforeAttrs?.["id"], afterAttrs?.["id"]);
}

function sameProtectedNodeFields(before: JSONContent, after: JSONContent): boolean {
  const beforeRecord = before as Record<string, unknown>;
  const afterRecord = after as Record<string, unknown>;
  const protectedKeys = new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)]);
  protectedKeys.delete("attrs");
  protectedKeys.delete("content");

  for (const key of protectedKeys) {
    if (!jsonValuesEqual(beforeRecord[key], afterRecord[key])) return false;
  }
  return true;
}

type StructuralContent =
  | { readonly kind: "absent" }
  | { readonly kind: "invalid" }
  | { readonly kind: "nodes"; readonly nodes: readonly JSONContent[] };

function structuralContent(node: JSONContent): StructuralContent {
  if (node.content === undefined) return { kind: "absent" };
  return Array.isArray(node.content) ? { kind: "nodes", nodes: node.content } : { kind: "invalid" };
}

function jsonValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => jsonValuesEqual(value, right[index]))
    );
  }

  const leftRecord = asRecord(left);
  const rightRecord = asRecord(right);
  if (!leftRecord || !rightRecord) return false;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.hasOwn(rightRecord, key) && jsonValuesEqual(leftRecord[key], rightRecord[key]),
    )
  );
}

function immutableReadonlyMap<K, V>(source: ReadonlyMap<K, V>): ReadonlyMap<K, V> {
  const snapshot = new Map(source);
  let readonlyMap: ReadonlyMap<K, V>;
  readonlyMap = {
    get size() {
      return snapshot.size;
    },
    entries: () => snapshot.entries(),
    forEach: (callback, thisArg) =>
      snapshot.forEach((value, key) => callback.call(thisArg, value, key, readonlyMap)),
    get: (key) => snapshot.get(key),
    has: (key) => snapshot.has(key),
    keys: () => snapshot.keys(),
    values: () => snapshot.values(),
    [Symbol.iterator]: () => snapshot[Symbol.iterator](),
  };
  return Object.freeze(readonlyMap);
}
