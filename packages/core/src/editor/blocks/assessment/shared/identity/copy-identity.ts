import type { JSONContent } from "@tiptap/core";
import type { EmbeddedDataId, EmbeddedNodeId } from "@scaffold/contracts";

import type { ContentIdentityRewrite } from "@/document/model/identity/clone-with-new-ids";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function rewriteRequiredMappedString<TId extends string>(
  value: unknown,
  changes: ReadonlyMap<TId, TId>,
  owner: string,
  field: string,
  options: { nullable?: boolean } = {},
): TId | null {
  if (value === null && options.nullable) return null;
  if (typeof value !== "string") {
    throw new Error(`Malformed ${owner} private assessment graph at "${field}".`);
  }

  const rewritten = changes.get(value as TId);
  if (!rewritten) {
    throw new Error(`Missing copied identity for "${value}" in ${owner} "${field}".`);
  }
  return rewritten;
}

function rewriteRequiredRecordKeys<TId extends string>(
  value: unknown,
  changes: ReadonlyMap<TId, TId>,
  owner: string,
  field: string,
): JsonRecord {
  if (value === undefined) return {};
  const record = asRecord(value);
  if (!record) {
    throw new Error(`Malformed ${owner} private assessment graph at "${field}".`);
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => [
      rewriteRequiredMappedString(key, changes, owner, field),
      entry,
    ]),
  );
}

function rewriteRequiredNodeIdArray(
  value: unknown,
  nodeIdChanges: ReadonlyMap<EmbeddedNodeId, EmbeddedNodeId>,
  owner: string,
  field: string,
): EmbeddedNodeId[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`Malformed ${owner} private assessment graph at "${field}".`);
  }
  return value.map((entry) => {
    const rewritten = rewriteRequiredMappedString(entry, nodeIdChanges, owner, field);
    if (rewritten === null) {
      throw new Error(`Malformed ${owner} private assessment graph at "${field}".`);
    }
    return rewritten;
  });
}

function rewriteAssessment(
  content: Parameters<ContentIdentityRewrite>[0]["content"],
  owner: string,
  rewrite: (assessment: JsonRecord) => JsonRecord,
) {
  const attrs = asRecord(content.attrs);
  const assessment = asRecord(attrs?.["assessment"]);
  if (!attrs || !assessment) {
    throw new Error(`Malformed ${owner} private assessment graph.`);
  }

  return {
    ...content,
    attrs: {
      ...attrs,
      assessment: rewrite(assessment),
    },
  };
}

export const rewriteMcqCopiedContent: ContentIdentityRewrite = ({ content, nodeIdChanges }) =>
  rewriteAssessment(content, "mcq", (assessment) => ({
    ...assessment,
    correctOptionId:
      assessment["correctOptionId"] === undefined
        ? null
        : rewriteRequiredMappedString(
            assessment["correctOptionId"],
            nodeIdChanges,
            "mcq",
            "correctOptionId",
            { nullable: true },
          ),
    feedbackByOptionId: rewriteRequiredRecordKeys(
      assessment["feedbackByOptionId"],
      nodeIdChanges,
      "mcq",
      "feedbackByOptionId",
    ),
  }));

export const rewriteMultiselectCopiedContent: ContentIdentityRewrite = ({
  content,
  nodeIdChanges,
}) =>
  rewriteAssessment(content, "multiselect", (assessment) => ({
    ...assessment,
    correctOptionIds: rewriteRequiredNodeIdArray(
      assessment["correctOptionIds"],
      nodeIdChanges,
      "multiselect",
      "correctOptionIds",
    ),
    feedbackByOptionId: rewriteRequiredRecordKeys(
      assessment["feedbackByOptionId"],
      nodeIdChanges,
      "multiselect",
      "feedbackByOptionId",
    ),
  }));

export const rewriteDropdownCopiedContent: ContentIdentityRewrite = ({ content, nodeIdChanges }) =>
  rewriteAssessment(content, "dropdown", (assessment) => ({
    ...assessment,
    correctOptionId:
      assessment["correctOptionId"] === undefined
        ? null
        : rewriteRequiredMappedString(
            assessment["correctOptionId"],
            nodeIdChanges,
            "dropdown",
            "correctOptionId",
            { nullable: true },
          ),
    feedbackByOptionId: rewriteRequiredRecordKeys(
      assessment["feedbackByOptionId"],
      nodeIdChanges,
      "dropdown",
      "feedbackByOptionId",
    ),
  }));

export const rewriteFillBlanksCopiedContent: ContentIdentityRewrite = ({
  content,
  nodeIdChanges,
}) =>
  rewriteAssessment(content, "fill_blanks", (assessment) => ({
    ...assessment,
    blanksById: rewriteRequiredRecordKeys(
      assessment["blanksById"],
      nodeIdChanges,
      "fill_blanks",
      "blanksById",
    ),
  }));

export const rewriteSequencingCopiedContent: ContentIdentityRewrite = ({
  content,
  nodeIdChanges,
}) =>
  rewriteAssessment(content, "sequencing", (assessment) => ({
    ...assessment,
    correctOrder: rewriteRequiredNodeIdArray(
      assessment["correctOrder"],
      nodeIdChanges,
      "sequencing",
      "correctOrder",
    ),
    feedbackByItemId: rewriteRequiredRecordKeys(
      assessment["feedbackByItemId"],
      nodeIdChanges,
      "sequencing",
      "feedbackByItemId",
    ),
  }));

export const rewriteMatchingCopiedContent: ContentIdentityRewrite = ({ content, nodeIdChanges }) =>
  rewriteAssessment(content, "matching", (assessment) => ({
    ...assessment,
    feedbackByItemId: rewriteRequiredRecordKeys(
      assessment["feedbackByItemId"],
      nodeIdChanges,
      "matching",
      "feedbackByItemId",
    ),
  }));

export const rewriteCategoriseCopiedContent: ContentIdentityRewrite = ({
  content,
  nodeIdChanges,
}) =>
  rewriteAssessment(content, "categorise", (assessment) => ({
    ...assessment,
    feedbackByItemId: rewriteRequiredRecordKeys(
      assessment["feedbackByItemId"],
      nodeIdChanges,
      "categorise",
      "feedbackByItemId",
    ),
  }));

export const rewriteImageHotspotCopiedContent: ContentIdentityRewrite = ({
  content,
  generators,
}) => {
  const hotspotIdChanges = new Map<EmbeddedDataId, EmbeddedDataId>();
  const rewriteState = { canvasCount: 0, generatedIds: new Set<EmbeddedDataId>() };
  const rewrittenContent = rewriteHotspotCanvases(
    content,
    hotspotIdChanges,
    generators.createDataId,
    rewriteState,
  );
  if (rewriteState.canvasCount !== 1) {
    throw new Error("Malformed image_hotspot private identity graph: expected one canvas.");
  }

  return rewriteAssessment(rewrittenContent, "image_hotspot", (assessment) => ({
    ...assessment,
    correctHotspotIds: rewriteRequiredDataIdArray(
      assessment["correctHotspotIds"],
      hotspotIdChanges,
      "correctHotspotIds",
    ),
    feedbackByHotspotId: rewriteRequiredRecordKeys(
      assessment["feedbackByHotspotId"],
      hotspotIdChanges,
      "image_hotspot",
      "feedbackByHotspotId",
    ),
  }));
};

function rewriteRequiredDataIdArray(
  value: unknown,
  changes: ReadonlyMap<EmbeddedDataId, EmbeddedDataId>,
  field: string,
): EmbeddedDataId[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`Malformed image_hotspot private assessment graph at "${field}".`);
  }
  return value.map((entry) => {
    const rewritten = rewriteRequiredMappedString(entry, changes, "image_hotspot", field);
    if (rewritten === null) {
      throw new Error(`Malformed image_hotspot private assessment graph at "${field}".`);
    }
    return rewritten;
  });
}

function rewriteHotspotCanvases(
  node: JSONContent,
  hotspotIdChanges: Map<EmbeddedDataId, EmbeddedDataId>,
  createDataId: () => EmbeddedDataId,
  state: { canvasCount: number; generatedIds: Set<EmbeddedDataId> },
): JSONContent {
  const content = node.content?.map((child) =>
    rewriteHotspotCanvases(child, hotspotIdChanges, createDataId, state),
  );
  if (node.type !== "image_hotspot_canvas") {
    return content ? { ...node, content } : node;
  }

  const attrs = asRecord(node.attrs);
  const data = asRecord(attrs?.["data"]);
  const hotspots = data?.["hotspots"];
  if (!attrs || !data || !Array.isArray(hotspots)) {
    throw new Error("Malformed image_hotspot private identity graph at canvas data.");
  }
  state.canvasCount += 1;

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
          if (!record || typeof previousId !== "string") {
            throw new Error("Malformed image_hotspot private identity graph at hotspot id.");
          }
          if (hotspotIdChanges.has(previousId as EmbeddedDataId)) {
            throw new Error(`Duplicate image_hotspot private identity "${previousId}".`);
          }

          const nextId = createDataId();
          if (state.generatedIds.has(nextId)) {
            throw new Error(`Duplicate generated image_hotspot private identity "${nextId}".`);
          }
          state.generatedIds.add(nextId);
          hotspotIdChanges.set(previousId as EmbeddedDataId, nextId);
          return { ...record, id: nextId };
        }),
      },
    },
  };
}
