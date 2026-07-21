import type { JSONContent } from "@tiptap/core";
import { z } from "zod";
import {
  MatchResponseSchema,
  MatchingPrivateAssessmentSchema,
  type AssessmentAnswerKey,
  type AssessmentInteractionContract,
  type AssessmentResponseValue,
  type AssessmentTargetSettings,
} from "@scaffold/contracts";

import type { AssessmentBlockAdapter } from "@/editor/blocks/assessment/shared/model/assessment-block-adapter";
import type { AssessmentCapabilityResponseDefinition } from "@/editor/blocks/block-definition";
import {
  childByType,
  childrenOfType,
  cloneJsonNodeWithoutContent,
  omitAttrs,
  optionalStringField,
  readAttrs,
  readContent,
  readOptionalString,
  readStringAttr,
  redactCommonAssessmentShellNode,
  stableShuffleDifferent,
  textBetween,
} from "@/editor/blocks/assessment/shared/publication/projection";

export const MatchingResponseSchema = z
  .object({
    matches: z.record(z.string(), z.string()).default({}),
  })
  .strict();
export type MatchingResponse = z.infer<typeof MatchingResponseSchema>;

export function projectMatchingLearnerNode(node: JSONContent): JSONContent {
  const blockId = readStringAttr(node, "id");
  return {
    ...cloneJsonNodeWithoutContent(node),
    attrs: omitAttrs(node, ["assessment"]),
    content: readContent(node).map((child) => {
      if (child.type !== "matching_pairs_group") {
        return redactCommonAssessmentShellNode(child);
      }
      return projectMatchingPairsGroupLearnerNode(child, blockId);
    }),
  };
}

export function projectMatchingInteraction(node: JSONContent): AssessmentInteractionContract {
  const pairs = projectMatchingPairs(node);
  return {
    kind: "match",
    items: pairs.map(({ itemId, itemLabel }) => ({
      id: itemId,
      ...(itemLabel ? { label: itemLabel } : {}),
    })),
    targets: pairs.map(({ targetId, targetLabel }) => ({
      id: targetId,
      ...(targetLabel ? { label: targetLabel } : {}),
    })),
  };
}

export function projectMatchingAssessment(node: JSONContent): AssessmentAnswerKey {
  const assessment = MatchingPrivateAssessmentSchema.parse(readAttrs(node)["assessment"] ?? {});
  const visiblePairs = projectMatchingPairs(node);
  const validItemIds = new Set(visiblePairs.map((pair) => pair.itemId));
  const validTargetIds = new Set(visiblePairs.map((pair) => pair.targetId));
  const correctPairs = assessment.correctPairs.filter(
    (pair) => validItemIds.has(pair.itemId) && validTargetIds.has(pair.targetId),
  );
  const feedbackByItemId: typeof assessment.feedbackByItemId = {};
  for (const pair of correctPairs) {
    const feedback = assessment.feedbackByItemId[pair.itemId];
    if (feedback) feedbackByItemId[pair.itemId] = feedback;
  }
  return {
    kind: "match",
    correctPairs,
    feedbackByItemId,
    summaryFeedback: assessment.summaryFeedback,
  };
}

export function projectMatchingSettings(settings: unknown): Partial<AssessmentTargetSettings> {
  return optionalStringField("legend", readOptionalString(settings, "legend"));
}

function projectMatchingPairsGroupLearnerNode(group: JSONContent, blockId: string): JSONContent {
  const pairs = childrenOfType(group, "matching_pair");
  const targets = pairs
    .map((pair) => {
      const target = childByType(pair, "matching_target");
      const targetId = readStringAttr(pair, "targetId");
      return target && targetId ? { targetId, target } : null;
    })
    .filter((target): target is { targetId: string; target: JSONContent } => Boolean(target));
  const shuffledTargets =
    targets.length === pairs.length
      ? stableShuffleDifferent(
          targets,
          `matching:${blockId}:${targets.map((target) => target.targetId).join("|")}`,
        )
      : targets;

  return {
    ...cloneJsonNodeWithoutContent(group),
    content: pairs.map((pair, index) =>
      projectMatchingPairLearnerNode(pair, shuffledTargets[index] ?? null),
    ),
  };
}

function projectMatchingPairLearnerNode(
  pair: JSONContent,
  targetProjection: { targetId: string; target: JSONContent } | null,
): JSONContent {
  const itemId = readStringAttr(pair, "itemId");
  const item = childByType(pair, "matching_item");
  const target = targetProjection?.target ?? childByType(pair, "matching_target");
  const content = [
    item
      ? redactCommonAssessmentShellNode(item)
      : { type: "matching_item", content: [{ type: "paragraph" }] },
    target
      ? redactCommonAssessmentShellNode(target)
      : { type: "matching_target", content: [{ type: "paragraph" }] },
  ];

  return {
    ...cloneJsonNodeWithoutContent(pair),
    attrs: {
      ...(itemId ? { itemId } : {}),
      ...(targetProjection?.targetId ? { targetId: targetProjection.targetId } : {}),
    },
    content,
  };
}

function projectMatchingPairs(node: JSONContent): Array<{
  itemId: string;
  targetId: string;
  itemLabel?: string;
  targetLabel?: string;
}> {
  const out: Array<{
    itemId: string;
    targetId: string;
    itemLabel?: string;
    targetLabel?: string;
  }> = [];
  const group = childByType(node, "matching_pairs_group");
  if (!group) return out;

  for (const pair of childrenOfType(group, "matching_pair")) {
    const itemId = readStringAttr(pair, "itemId");
    const targetId = readStringAttr(pair, "targetId");
    if (!itemId || !targetId) continue;
    const item = childByType(pair, "matching_item");
    const target = childByType(pair, "matching_target");
    const itemLabel = item ? textBetween(item).trim() : "";
    const targetLabel = target ? textBetween(target).trim() : "";
    out.push({
      itemId,
      targetId,
      ...(itemLabel ? { itemLabel } : {}),
      ...(targetLabel ? { targetLabel } : {}),
    });
  }

  return out;
}

export function readMatchingResponse(response: unknown): MatchingResponse {
  return MatchingResponseSchema.parse(response);
}

function assertUniqueMatchingItemIds(pairs: readonly { itemId: string; targetId: string }[]): void {
  const itemIds = pairs.map((pair) => pair.itemId);
  if (new Set(itemIds).size !== itemIds.length) {
    throw new Error("Matching response item ids must be unique.");
  }
}

export function toMatchingContractResponse(response: unknown) {
  const pairs = Object.entries(readMatchingResponse(response).matches).map(
    ([itemId, targetId]) => ({
      itemId,
      targetId,
    }),
  );
  return MatchResponseSchema.parse({ kind: "match", pairs });
}

export function fromMatchingContractResponse(response: AssessmentResponseValue): MatchingResponse {
  const canonical = MatchResponseSchema.parse(response);
  assertUniqueMatchingItemIds(canonical.pairs);
  return MatchingResponseSchema.parse({
    matches: Object.fromEntries(canonical.pairs.map(({ itemId, targetId }) => [itemId, targetId])),
  });
}

export function hasMatchingResponse(response: unknown): boolean {
  return Object.keys(readMatchingResponse(response).matches).length > 0;
}

export const matchingResponseCodec: AssessmentCapabilityResponseDefinition<MatchingResponse> = {
  schema: MatchingResponseSchema,
  toContractResponse: toMatchingContractResponse,
  fromContractResponse: fromMatchingContractResponse,
  hasResponse: hasMatchingResponse,
};

export const matchingAssessmentAdapter: AssessmentBlockAdapter = {
  interactionKind: "match",
  choiceMode: null,
  response: matchingResponseCodec,
};
