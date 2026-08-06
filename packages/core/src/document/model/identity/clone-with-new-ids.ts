import type { JSONContent } from "@tiptap/core";

import type { EmbeddedDataId, EmbeddedNodeId } from "@scaffold/contracts";
import { createEmbeddedDataId, createEmbeddedNodeId } from "./stable-ids";

type JsonRecord = Record<string, unknown>;

interface IdRewriteMaps {
  choiceIds: Map<string, string>;
  dropdownChoiceIds: Map<string, string>;
  fillBlankIds: Map<string, string>;
  sequencingItemIds: Map<string, string>;
  matchingItemIds: Map<string, string>;
  categoriseItemIds: Map<string, string>;
  hotspotIds: Map<string, string>;
}

function emptyRewriteMaps(): IdRewriteMaps {
  return {
    choiceIds: new Map(),
    dropdownChoiceIds: new Map(),
    fillBlankIds: new Map(),
    sequencingItemIds: new Map(),
    matchingItemIds: new Map(),
    categoriseItemIds: new Map(),
    hotspotIds: new Map(),
  };
}

function mergeRewriteMaps(target: IdRewriteMaps, source: IdRewriteMaps) {
  for (const [key, map] of Object.entries(source) as Array<
    [keyof IdRewriteMaps, Map<string, string>]
  >) {
    for (const [previous, next] of map) {
      target[key].set(previous, next);
    }
  }
}

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

function asRecordArray(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const record = asRecord(item);
        return record ? [record] : [];
      })
    : [];
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

function regenerateRecordListIds(value: unknown, createId: () => string): Map<string, string> {
  const idMap = new Map<string, string>();

  asRecordArray(value).forEach((record) => {
    const replacement = regenerateAttrId(record, createId);
    if (replacement) {
      idMap.set(replacement.previous, replacement.next);
    }
  });

  return idMap;
}

function rewriteMappedValue(record: JsonRecord, key: string, idMap: Map<string, string>) {
  const current = record[key];
  if (typeof current !== "string") return;

  const replacement = idMap.get(current);
  if (replacement) {
    record[key] = replacement;
  }
}

function rewriteMappedStringArray(record: JsonRecord, key: string, idMap: Map<string, string>) {
  const current = record[key];
  if (!Array.isArray(current)) return;

  record[key] = current.map((value) =>
    typeof value === "string" ? (idMap.get(value) ?? value) : value,
  );
}

function rewriteRecordKeys(value: unknown, idMap: Map<string, string>): unknown {
  const record = asRecord(value);
  if (!record) return value;

  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => [idMap.get(key) ?? key, entry]),
  );
}

function rewriteColumnRefs(value: unknown, columnIdMap: Map<string, string>) {
  if (Array.isArray(value)) {
    value.forEach((item) => rewriteColumnRefs(item, columnIdMap));
    return;
  }

  const record = asRecord(value);
  if (!record) return;

  rewriteMappedValue(record, "columnId", columnIdMap);
  Object.values(record).forEach((child) => rewriteColumnRefs(child, columnIdMap));
}

function rewriteRowCells(value: unknown, columnIdMap: Map<string, string>) {
  asRecordArray(value).forEach((row) => {
    const cells = asRecord(row["cells"]);
    if (!cells) return;

    row["cells"] = Object.fromEntries(
      Object.entries(cells).map(([columnId, cellValue]) => [
        columnIdMap.get(columnId) ?? columnId,
        cellValue,
      ]),
    );
  });
}

function regenerateHotspotIds(node: JSONContent, maps: IdRewriteMaps, createId: () => string) {
  if (node.type !== "image_hotspot_canvas") return;

  const data = asRecord(asRecord(node.attrs)?.["data"]);
  if (!data) return;

  for (const [previous, next] of regenerateRecordListIds(data["hotspots"], createId)) {
    maps.hotspotIds.set(previous, next);
  }
}

function regenerateChartIds(node: JSONContent, createId: () => string) {
  if (node.type !== "chart_block") return;

  const attrs = asRecord(node.attrs);
  const blockData = asRecord(attrs?.["data"]);
  const table = asRecord(blockData?.["data"]);
  if (!blockData || !table) return;

  const columnIdMap = regenerateRecordListIds(table["columns"], createId);
  regenerateRecordListIds(table["rows"], createId);
  rewriteRowCells(table["rows"], columnIdMap);
  rewriteColumnRefs(blockData["encoding"], columnIdMap);
}

function trackAssessmentReferenceId(
  node: JSONContent,
  replacement: { previous: string; next: string } | null,
  maps: IdRewriteMaps,
) {
  // TODO: Move assessment reference repair behind assessment/block-owned
  // duplicate hooks. Generic cloning should only regenerate attrs.id and
  // expose the oldId -> newId map; authored answer-key repair belongs with
  // the assessment blocks that define those private attrs.
  if (!replacement) return;
  if (node.type === "selectable_choice") {
    maps.choiceIds.set(replacement.previous, replacement.next);
  }
  if (node.type === "dropdown_choice") {
    maps.dropdownChoiceIds.set(replacement.previous, replacement.next);
  }
  if (node.type === "fill_blank") {
    maps.fillBlankIds.set(replacement.previous, replacement.next);
  }
  if (node.type === "sequencing_item") {
    maps.sequencingItemIds.set(replacement.previous, replacement.next);
  }
  if (node.type === "matching_item") {
    maps.matchingItemIds.set(replacement.previous, replacement.next);
  }
  if (node.type === "categorise_item") {
    maps.categoriseItemIds.set(replacement.previous, replacement.next);
  }
}

function rewriteAssessmentReferences(node: JSONContent, maps: IdRewriteMaps) {
  const attrs = asRecord(node.attrs);
  const assessment = asRecord(attrs?.["assessment"]);
  if (!assessment) return;

  if (node.type === "mcq") {
    rewriteMappedValue(assessment, "correctOptionId", maps.choiceIds);
    assessment["feedbackByOptionId"] = rewriteRecordKeys(
      assessment["feedbackByOptionId"],
      maps.choiceIds,
    );
  }

  if (node.type === "multiselect") {
    rewriteMappedStringArray(assessment, "correctOptionIds", maps.choiceIds);
    assessment["feedbackByOptionId"] = rewriteRecordKeys(
      assessment["feedbackByOptionId"],
      maps.choiceIds,
    );
  }

  if (node.type === "dropdown") {
    rewriteMappedValue(assessment, "correctOptionId", maps.dropdownChoiceIds);
    assessment["feedbackByOptionId"] = rewriteRecordKeys(
      assessment["feedbackByOptionId"],
      maps.dropdownChoiceIds,
    );
  }

  if (node.type === "fill_blanks") {
    assessment["blanksById"] = rewriteRecordKeys(assessment["blanksById"], maps.fillBlankIds);
  }

  if (node.type === "sequencing") {
    rewriteMappedStringArray(assessment, "correctOrder", maps.sequencingItemIds);
    assessment["feedbackByItemId"] = rewriteRecordKeys(
      assessment["feedbackByItemId"],
      maps.sequencingItemIds,
    );
  }

  if (node.type === "matching") {
    assessment["feedbackByItemId"] = rewriteRecordKeys(
      assessment["feedbackByItemId"],
      maps.matchingItemIds,
    );
  }

  if (node.type === "categorise") {
    assessment["feedbackByItemId"] = rewriteRecordKeys(
      assessment["feedbackByItemId"],
      maps.categoriseItemIds,
    );
  }

  if (node.type === "image_hotspot") {
    rewriteMappedStringArray(assessment, "correctHotspotIds", maps.hotspotIds);
    assessment["feedbackByHotspotId"] = rewriteRecordKeys(
      assessment["feedbackByHotspotId"],
      maps.hotspotIds,
    );
  }
}

function regenerateIdsInNode(
  node: JSONContent,
  createId: () => string,
  nodeIdChanges: Map<EmbeddedNodeId, EmbeddedNodeId>,
): IdRewriteMaps {
  const maps = emptyRewriteMaps();

  const attrIdReplacement = regenerateAttrId(asRecord(node.attrs) ?? undefined, createId);
  if (attrIdReplacement) {
    nodeIdChanges.set(
      attrIdReplacement.previous as EmbeddedNodeId,
      attrIdReplacement.next as EmbeddedNodeId,
    );
  }
  trackAssessmentReferenceId(node, attrIdReplacement, maps);

  regenerateHotspotIds(node, maps, createId);
  regenerateChartIds(node, createId);

  node.content?.forEach((child) => {
    mergeRewriteMaps(maps, regenerateIdsInNode(child, createId, nodeIdChanges));
  });

  return maps;
}

function rewriteAssessmentReferencesInTree(node: JSONContent, maps: IdRewriteMaps) {
  rewriteAssessmentReferences(node, maps);
  node.content?.forEach((child) => rewriteAssessmentReferencesInTree(child, maps));
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
    const fragmentMaps = emptyRewriteMaps();
    clone.forEach((node) =>
      mergeRewriteMaps(fragmentMaps, regenerateIdsInNode(node, createId, nodeIdChanges)),
    );
    clone.forEach((node) => rewriteAssessmentReferencesInTree(node, fragmentMaps));
  } else {
    const maps = regenerateIdsInNode(clone, createId, nodeIdChanges);
    rewriteAssessmentReferencesInTree(clone, maps);
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
