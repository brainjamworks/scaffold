import type { JSONContent } from "@tiptap/core";

import { createStableId } from "./stable-ids";

type JsonRecord = Record<string, unknown>;

interface IdRewriteMaps {
  choiceIds: Map<string, string>;
  dropdownChoiceIds: Map<string, string>;
  fillBlankIds: Map<string, string>;
  sequencingItemIds: Map<string, string>;
  matchingItemIds: Map<string, string>;
  matchingTargetIds: Map<string, string>;
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
    matchingTargetIds: new Map(),
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

function regenerateAttrId(attrs: JsonRecord | undefined) {
  const currentId = readStableId(attrs?.["id"]);
  if (!currentId || !attrs) return null;

  const nextId = createStableId();
  attrs["id"] = nextId;

  return { previous: currentId, next: nextId };
}

function regenerateRecordListIds(value: unknown): Map<string, string> {
  const idMap = new Map<string, string>();

  asRecordArray(value).forEach((record) => {
    const replacement = regenerateAttrId(record);
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

function rewriteRecordKeys(value: unknown, idMap: Map<string, string>): JsonRecord | unknown {
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

function regenerateMatchingIds(node: JSONContent, maps: IdRewriteMaps) {
  if (node.type !== "matching_pair") return;

  const attrs = asRecord(node.attrs);
  if (!attrs) return;

  if (typeof attrs["itemId"] === "string" && attrs["itemId"]) {
    const previous = attrs["itemId"];
    const next = createStableId();
    attrs["itemId"] = next;
    maps.matchingItemIds.set(previous, next);
  }
  if (typeof attrs["targetId"] === "string" && attrs["targetId"]) {
    const previous = attrs["targetId"];
    const next = createStableId();
    attrs["targetId"] = next;
    maps.matchingTargetIds.set(previous, next);
  }
}

function regenerateHotspotIds(node: JSONContent, maps: IdRewriteMaps) {
  if (node.type !== "image_hotspot_canvas") return;

  const data = asRecord(asRecord(node.attrs)?.["data"]);
  if (!data) return;

  for (const [previous, next] of regenerateRecordListIds(data["hotspots"])) {
    maps.hotspotIds.set(previous, next);
  }
}

function regenerateChartIds(node: JSONContent) {
  if (node.type !== "chart_block") return;

  const attrs = asRecord(node.attrs);
  const blockData = asRecord(attrs?.["data"]);
  const table = asRecord(blockData?.["data"]);
  if (!blockData || !table) return;

  const columnIdMap = regenerateRecordListIds(table["columns"]);
  regenerateRecordListIds(table["rows"]);
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
    asRecordArray(assessment["correctPairs"]).forEach((pair) => {
      rewriteMappedValue(pair, "itemId", maps.matchingItemIds);
      rewriteMappedValue(pair, "targetId", maps.matchingTargetIds);
    });
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

function regenerateIdsInNode(node: JSONContent): IdRewriteMaps {
  const maps = emptyRewriteMaps();

  const attrIdReplacement = regenerateAttrId(asRecord(node.attrs) ?? undefined);
  trackAssessmentReferenceId(node, attrIdReplacement, maps);

  regenerateMatchingIds(node, maps);
  regenerateHotspotIds(node, maps);
  regenerateChartIds(node);

  node.content?.forEach((child) => {
    mergeRewriteMaps(maps, regenerateIdsInNode(child));
  });

  rewriteAssessmentReferences(node, maps);
  return maps;
}

export function cloneJsonWithNewStableIds<T extends JSONContent | JSONContent[]>(content: T): T {
  const clone = cloneJsonValue(content);

  if (Array.isArray(clone)) {
    clone.forEach((node) => regenerateIdsInNode(node));
  } else {
    regenerateIdsInNode(clone);
  }

  return clone;
}
