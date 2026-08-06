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

export interface CopiedContentIdentityGenerators {
  /** Allocates identities for capability-private Data records only. */
  readonly createDataId: () => EmbeddedDataId;
}

export interface RewriteCopiedContentInput {
  /** The cloned Block JSON after generic document-node ID regeneration. */
  readonly content: JSONContent;
  /** One immutable old-to-new document-node ID snapshot for the whole clone. */
  readonly nodeIdChanges: ReadonlyMap<EmbeddedNodeId, EmbeddedNodeId>;
  readonly generators: CopiedContentIdentityGenerators;
}

/** Purely rewrites capability-private payload inside its own cloned Block. */
export type RewriteCopiedContent = (input: RewriteCopiedContentInput) => JSONContent;

export interface CopiedBlockDefinitionLookup {
  readonly getByNodeType: (
    nodeType: string,
  ) => { readonly rewriteCopiedContent?: RewriteCopiedContent } | undefined;
}

export interface CloneJsonWithNewStableIdsOptions {
  blockDefinitions: CopiedBlockDefinitionLookup;
  createDataId?: CopiedContentIdentityGenerators["createDataId"];
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
      rewriteCopiedBlocksInTree(node, options.blockDefinitions, immutableNodeIdChanges, generators),
    ) as T;
  }

  return rewriteCopiedBlocksInTree(
    clone,
    options.blockDefinitions,
    immutableNodeIdChanges,
    generators,
  ) as T;
}

function rewriteCopiedBlocksInTree(
  node: JSONContent,
  blockDefinitions: CopiedBlockDefinitionLookup,
  nodeIdChanges: ReadonlyMap<EmbeddedNodeId, EmbeddedNodeId>,
  generators: CopiedContentIdentityGenerators,
): JSONContent {
  if (node.content) {
    node.content = node.content.map((child) =>
      rewriteCopiedBlocksInTree(child, blockDefinitions, nodeIdChanges, generators),
    );
  }

  const rewriteCopiedContent = node.type
    ? blockDefinitions.getByNodeType(node.type)?.rewriteCopiedContent
    : undefined;
  return rewriteCopiedContent
    ? rewriteCopiedContent({ content: node, nodeIdChanges, generators })
    : node;
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
