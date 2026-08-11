import type { JSONContent } from "@tiptap/core";
import type { EmbeddedDataId, EmbeddedNodeId } from "@scaffold/contracts";

import type { BlockDuplicationOperation } from "@/document/model/identity/clone-with-new-ids";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function rewriteMappedString<TId extends string>(
  value: unknown,
  changes: ReadonlyMap<TId, TId>,
): unknown {
  return typeof value === "string" ? (changes.get(value as TId) ?? value) : value;
}

function rewriteRecordKeys<TId extends string>(
  value: unknown,
  changes: ReadonlyMap<TId, TId>,
): unknown {
  const record = asRecord(value);
  if (!record) return value;

  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => [rewriteMappedString(key, changes), entry]),
  );
}

function rewriteNodeIdArray(
  value: unknown,
  nodeIdChanges: ReadonlyMap<EmbeddedNodeId, EmbeddedNodeId>,
): unknown {
  return Array.isArray(value)
    ? value.map((entry) => rewriteMappedString(entry, nodeIdChanges))
    : value;
}

function rewriteAssessment(
  content: Parameters<BlockDuplicationOperation>[0]["content"],
  rewrite: (assessment: JsonRecord) => JsonRecord,
) {
  const attrs = asRecord(content.attrs);
  const assessment = asRecord(attrs?.["assessment"]);
  if (!attrs || !assessment) return content;

  return {
    ...content,
    attrs: {
      ...attrs,
      assessment: rewrite(assessment),
    },
  };
}

export const rewriteMcqCopiedContent: BlockDuplicationOperation = ({ content, nodeIdChanges }) =>
  rewriteAssessment(content, (assessment) => ({
    ...assessment,
    correctOptionId: rewriteMappedString(assessment["correctOptionId"], nodeIdChanges),
    feedbackByOptionId: rewriteRecordKeys(assessment["feedbackByOptionId"], nodeIdChanges),
  }));

export const rewriteMultiselectCopiedContent: BlockDuplicationOperation = ({
  content,
  nodeIdChanges,
}) =>
  rewriteAssessment(content, (assessment) => ({
    ...assessment,
    correctOptionIds: rewriteNodeIdArray(assessment["correctOptionIds"], nodeIdChanges),
    feedbackByOptionId: rewriteRecordKeys(assessment["feedbackByOptionId"], nodeIdChanges),
  }));

export const rewriteDropdownCopiedContent: BlockDuplicationOperation = ({
  content,
  nodeIdChanges,
}) =>
  rewriteAssessment(content, (assessment) => ({
    ...assessment,
    correctOptionId: rewriteMappedString(assessment["correctOptionId"], nodeIdChanges),
    feedbackByOptionId: rewriteRecordKeys(assessment["feedbackByOptionId"], nodeIdChanges),
  }));

export const rewriteFillBlanksCopiedContent: BlockDuplicationOperation = ({
  content,
  nodeIdChanges,
}) =>
  rewriteAssessment(content, (assessment) => ({
    ...assessment,
    blanksById: rewriteRecordKeys(assessment["blanksById"], nodeIdChanges),
  }));

export const rewriteSequencingCopiedContent: BlockDuplicationOperation = ({
  content,
  nodeIdChanges,
}) =>
  rewriteAssessment(content, (assessment) => ({
    ...assessment,
    correctOrder: rewriteNodeIdArray(assessment["correctOrder"], nodeIdChanges),
    feedbackByItemId: rewriteRecordKeys(assessment["feedbackByItemId"], nodeIdChanges),
  }));

export const rewriteMatchingCopiedContent: BlockDuplicationOperation = ({
  content,
  nodeIdChanges,
}) =>
  rewriteAssessment(content, (assessment) => ({
    ...assessment,
    feedbackByItemId: rewriteRecordKeys(assessment["feedbackByItemId"], nodeIdChanges),
  }));

export const rewriteCategoriseCopiedContent: BlockDuplicationOperation = ({
  content,
  nodeIdChanges,
}) =>
  rewriteAssessment(content, (assessment) => ({
    ...assessment,
    feedbackByItemId: rewriteRecordKeys(assessment["feedbackByItemId"], nodeIdChanges),
  }));

export const rewriteImageHotspotCopiedContent: BlockDuplicationOperation = ({
  content,
  generators,
}) => {
  const hotspotIdChanges = new Map<EmbeddedDataId, EmbeddedDataId>();
  const rewrittenContent = rewriteHotspotCanvases(
    content,
    hotspotIdChanges,
    generators.createDataId,
  );

  return rewriteAssessment(rewrittenContent, (assessment) => ({
    ...assessment,
    correctHotspotIds: Array.isArray(assessment["correctHotspotIds"])
      ? assessment["correctHotspotIds"].map((id) => rewriteMappedString(id, hotspotIdChanges))
      : assessment["correctHotspotIds"],
    feedbackByHotspotId: rewriteRecordKeys(assessment["feedbackByHotspotId"], hotspotIdChanges),
  }));
};

function rewriteHotspotCanvases(
  node: JSONContent,
  hotspotIdChanges: Map<EmbeddedDataId, EmbeddedDataId>,
  createDataId: () => EmbeddedDataId,
): JSONContent {
  const content = node.content?.map((child) =>
    rewriteHotspotCanvases(child, hotspotIdChanges, createDataId),
  );
  if (node.type !== "image_hotspot_canvas") {
    return content ? { ...node, content } : node;
  }

  const attrs = asRecord(node.attrs);
  const data = asRecord(attrs?.["data"]);
  const hotspots = data?.["hotspots"];
  if (!attrs || !data || !Array.isArray(hotspots)) {
    return content ? { ...node, content } : node;
  }

  return {
    ...node,
    ...(content ? { content } : {}),
    attrs: {
      ...attrs,
      data: {
        ...data,
        hotspots: hotspots.map((hotspot) => {
          const record = asRecord(hotspot);
          const previousId = record?.["id"];
          if (!record || typeof previousId !== "string") return hotspot;

          const nextId = createDataId();
          hotspotIdChanges.set(previousId as EmbeddedDataId, nextId);
          return { ...record, id: nextId };
        }),
      },
    },
  };
}
