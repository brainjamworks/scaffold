import type { JSONContent } from "@tiptap/core";
import { z } from "zod";
import {
  EmbeddedNodeIdSchema,
  MatchResponseSchema,
  MatchAssessmentSchema,
  MatchInteractionSchema,
  MatchingPrivateAssessmentSchema,
  type AssessmentAnswerKey,
  type AssessmentInteractionContract,
  type AssessmentResponseValue,
  type AssessmentTargetSettings,
} from "@scaffold/contracts";

const EmbeddedNodeRecordKeySchema = EmbeddedNodeIdSchema.unwrap().unwrap();

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
    matches: z.record(EmbeddedNodeRecordKeySchema, EmbeddedNodeIdSchema).default({}),
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
  const projection = projectMatchingProjection(node);
  return MatchInteractionSchema.parse({
    kind: "match",
    items: projection.items.map(({ itemId, itemLabel }) => ({
      id: itemId,
      ...(itemLabel ? { label: itemLabel } : {}),
    })),
    targets: projection.targets.map(({ targetId, targetLabel }) => ({
      id: targetId,
      ...(targetLabel ? { label: targetLabel } : {}),
    })),
  });
}

export function projectMatchingAssessment(node: JSONContent): AssessmentAnswerKey {
  const assessment = MatchingPrivateAssessmentSchema.parse(readAttrs(node)["assessment"] ?? {});
  const projectedItems = projectMatchingProjection(node).items;
  const itemOrder = projectedItems.map((pair) => pair.itemId);
  const correctPairs = projectedItems.map(({ itemId, targetId }) => ({ itemId, targetId }));
  const feedbackByItemId: typeof assessment.feedbackByItemId = {};
  for (const itemId of itemOrder) {
    const feedback = assessment.feedbackByItemId[itemId];
    if (feedback) feedbackByItemId[itemId] = feedback;
  }
  return MatchAssessmentSchema.parse({
    kind: "match",
    correctPairs,
    feedbackByItemId,
    summaryFeedback: assessment.summaryFeedback,
  });
}

export function projectMatchingSettings(settings: unknown): Partial<AssessmentTargetSettings> {
  return optionalStringField("legend", readOptionalString(settings, "legend"));
}

function projectMatchingPairsGroupLearnerNode(group: JSONContent, blockId: string): JSONContent {
  const projection = projectMatchingProjectionFromGroup(group, blockId);

  return {
    ...cloneJsonNodeWithoutContent(group),
    content: projection.items.map((pair, index) =>
      projectMatchingPairLearnerNode(pair.node, projection.targets[index] ?? null),
    ),
  };
}

function projectMatchingPairLearnerNode(
  pair: JSONContent,
  targetProjection: { targetId: string; target: JSONContent } | null,
): JSONContent {
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
    content,
  };
}

interface MatchingProjectedPair {
  itemId: string;
  targetId: string;
  itemLabel?: string;
  targetLabel?: string;
  node: JSONContent;
  target: JSONContent;
}

function projectMatchingProjection(node: JSONContent): {
  items: MatchingProjectedPair[];
  targets: MatchingProjectedPair[];
} {
  const group = childByType(node, "matching_pairs_group");
  return group
    ? projectMatchingProjectionFromGroup(group, readStringAttr(node, "id"))
    : { items: [], targets: [] };
}

function projectMatchingProjectionFromGroup(
  group: JSONContent,
  blockId: string,
): { items: MatchingProjectedPair[]; targets: MatchingProjectedPair[] } {
  const pairs = childrenOfType(group, "matching_pair").map((pair) => {
    const item = childByType(pair, "matching_item")!;
    const target = childByType(pair, "matching_target")!;
    const itemLabel = textBetween(item).trim();
    const targetLabel = textBetween(target).trim();
    return {
      itemId: readStringAttr(pair, "itemId"),
      targetId: readStringAttr(pair, "targetId"),
      ...(itemLabel ? { itemLabel } : {}),
      ...(targetLabel ? { targetLabel } : {}),
      node: pair,
      target,
    };
  });
  const items = pairs.slice().sort((left, right) => left.itemId.localeCompare(right.itemId));
  const sortedTargets = pairs
    .slice()
    .sort((left, right) => left.targetId.localeCompare(right.targetId));
  const targetIdSet = sortedTargets.map((target) => target.targetId).join("|");
  const targets = stableShuffleDifferent(sortedTargets, `matching:${blockId}:${targetIdSet}`);
  return { items, targets };
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

function currentMatchingIds(interaction?: AssessmentInteractionContract): {
  itemIds: readonly string[];
  targetIds: readonly string[];
} | null {
  if (!interaction) return null;
  if (interaction.kind !== "match") {
    throw new Error("Matching response requires a match interaction.");
  }
  const itemIds = interaction.items.map((item) => item.id);
  const targetIds = interaction.targets.map((target) => target.id);
  if (itemIds.some((id) => !id.trim()) || new Set(itemIds).size !== itemIds.length) {
    throw new Error("Matching interaction item ids must be nonblank and unique.");
  }
  if (targetIds.some((id) => !id.trim()) || new Set(targetIds).size !== targetIds.length) {
    throw new Error("Matching interaction target ids must be nonblank and unique.");
  }
  if (itemIds.length !== targetIds.length || itemIds.length === 0) {
    throw new Error("Matching interaction must contain equally many items and targets.");
  }
  return { itemIds, targetIds };
}

function canonicalMatchingPairs(
  matches: Readonly<Record<string, string>>,
  interaction?: AssessmentInteractionContract,
): Array<{ itemId: string; targetId: string }> {
  const current = currentMatchingIds(interaction);
  if (!current) return Object.entries(matches).map(([itemId, targetId]) => ({ itemId, targetId }));
  const targetIdSet = new Set(current.targetIds);
  const claimedTargetIds = new Set<string>();
  const pairs: Array<{ itemId: string; targetId: string }> = [];
  for (const itemId of current.itemIds) {
    const targetId = matches[itemId];
    if (!targetId || !targetIdSet.has(targetId) || claimedTargetIds.has(targetId)) continue;
    claimedTargetIds.add(targetId);
    pairs.push({ itemId, targetId });
  }
  return pairs;
}

export function toMatchingContractResponse(
  response: unknown,
  interaction?: AssessmentInteractionContract,
) {
  const pairs = canonicalMatchingPairs(readMatchingResponse(response).matches, interaction);
  return MatchResponseSchema.parse({ kind: "match", pairs });
}

export function fromMatchingContractResponse(
  response: AssessmentResponseValue,
  interaction?: AssessmentInteractionContract,
): MatchingResponse {
  const canonical = MatchResponseSchema.parse(response);
  assertUniqueMatchingItemIds(canonical.pairs);
  const current = currentMatchingIds(interaction);
  const itemIdSet = current ? new Set(current.itemIds) : null;
  const targetIdSet = current ? new Set(current.targetIds) : null;
  const matches: Record<string, string> = {};
  const claimedTargetIds = new Set<string>();
  for (const { itemId, targetId } of canonical.pairs) {
    if (itemIdSet && !itemIdSet.has(itemId)) continue;
    if (targetIdSet && !targetIdSet.has(targetId)) continue;
    if (claimedTargetIds.has(targetId)) continue;
    claimedTargetIds.add(targetId);
    matches[itemId] = targetId;
  }
  return MatchingResponseSchema.parse({
    matches,
  });
}

export function hasMatchingResponse(
  response: unknown,
  interaction?: AssessmentInteractionContract,
): boolean {
  const matches = readMatchingResponse(response).matches;
  if (!interaction) return Object.keys(matches).length > 0;
  const current = currentMatchingIds(interaction);
  if (!current) return false;
  const expectedItemIds = new Set(current.itemIds);
  const expectedTargetIds = new Set(current.targetIds);
  const entries = Object.entries(matches);
  const selectedTargetIds = new Set(entries.map(([, targetId]) => targetId));

  return (
    entries.length === expectedItemIds.size &&
    selectedTargetIds.size === entries.length &&
    entries.every(
      ([itemId, targetId]) => expectedItemIds.has(itemId) && expectedTargetIds.has(targetId),
    )
  );
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
