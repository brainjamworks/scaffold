import type { JSONContent } from "@tiptap/core";
import { z } from "zod";
import {
  SequenceResponseSchema,
  SequencingPrivateAssessmentSchema,
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
import { assertSequencingIntegrity, assertSequencingInteractionIntegrity } from "./integrity";

export const SequencingResponseSchema = z
  .object({
    order: z.array(z.string()).default([]),
  })
  .strict();
export type SequencingResponse = z.infer<typeof SequencingResponseSchema>;

export function projectSequencingLearnerNode(node: JSONContent): JSONContent {
  assertSequencingIntegrity(node);
  const blockId = readStringAttr(node, "id");
  return {
    ...cloneJsonNodeWithoutContent(node),
    attrs: omitAttrs(node, ["assessment"]),
    content: readContent(node).map((child) => {
      if (child.type !== "sequencing_items_group") {
        return redactCommonAssessmentShellNode(child);
      }
      const items = childrenOfType(child, "sequencing_item");
      const ids = items.map((item) => readStringAttr(item, "id")).join("|");
      return {
        ...cloneJsonNodeWithoutContent(child),
        content: stableShuffleDifferent(readContent(child), `sequencing:${blockId}:${ids}`).map(
          (item) => redactCommonAssessmentShellNode(item),
        ),
      };
    }),
  };
}

export function projectSequencingInteraction(node: JSONContent): AssessmentInteractionContract {
  assertSequencingInteractionIntegrity(node);
  return {
    kind: "sequence",
    items: projectSequencingItems(node),
  };
}

export function projectSequencingAssessment(node: JSONContent): AssessmentAnswerKey {
  assertSequencingIntegrity(node);
  const assessment = SequencingPrivateAssessmentSchema.parse(readAttrs(node)["assessment"] ?? {});
  const itemIds = projectSequencingItems(node).map((item) => item.id);
  const feedbackByItemId: typeof assessment.feedbackByItemId = {};
  for (const id of itemIds) {
    const feedback = assessment.feedbackByItemId[id];
    if (feedback) feedbackByItemId[id] = feedback;
  }
  return {
    kind: "sequence",
    correctOrder: assessment.correctOrder,
    feedbackByItemId,
    summaryFeedback: assessment.summaryFeedback,
  };
}

export function projectSequencingSettings(settings: unknown): Partial<AssessmentTargetSettings> {
  return optionalStringField("legend", readOptionalString(settings, "legend"));
}

function projectSequencingItems(node: JSONContent): Array<{ id: string; label?: string }> {
  const items: Array<{ id: string; label?: string }> = [];
  const group = childByType(node, "sequencing_items_group");
  if (!group) return items;

  for (const item of childrenOfType(group, "sequencing_item")) {
    const id = readStringAttr(item, "id");
    const label = textBetween(item).trim();
    items.push({ id, ...(label ? { label } : {}) });
  }

  return items;
}

function assertUniqueOrderedItemIds(itemIds: readonly string[]): void {
  if (new Set(itemIds).size !== itemIds.length) {
    throw new Error("Sequence response item ids must be unique.");
  }
}

function currentSequencingItemIds(
  interaction?: AssessmentInteractionContract,
): readonly string[] | null {
  if (!interaction) return null;
  if (interaction.kind !== "sequence") {
    throw new Error("Sequence response requires a sequence interaction.");
  }
  const itemIds = interaction.items.map((item) => item.id);
  if (itemIds.some((id) => id.trim().length === 0) || new Set(itemIds).size !== itemIds.length) {
    throw new Error("Sequence interaction item ids must be nonblank and unique.");
  }
  return itemIds;
}

function isExactItemPermutation(order: readonly string[], itemIds: readonly string[]): boolean {
  if (order.length !== itemIds.length) return false;
  const itemIdSet = new Set(itemIds);
  return order.every((id) => id.trim().length > 0 && itemIdSet.has(id));
}

export function toSequencingContractResponse(
  response: unknown,
  interaction?: AssessmentInteractionContract,
) {
  const local = SequencingResponseSchema.parse(response);
  assertUniqueOrderedItemIds(local.order);
  const itemIds = currentSequencingItemIds(interaction);
  const orderedItemIds =
    !itemIds || isExactItemPermutation(local.order, itemIds) ? local.order : [];
  return SequenceResponseSchema.parse({ kind: "sequence", orderedItemIds });
}

export function fromSequencingContractResponse(
  response: AssessmentResponseValue,
  interaction?: AssessmentInteractionContract,
): SequencingResponse {
  const canonical = SequenceResponseSchema.parse(response);
  assertUniqueOrderedItemIds(canonical.orderedItemIds);
  const itemIds = currentSequencingItemIds(interaction);
  const itemIdSet = itemIds ? new Set(itemIds) : null;
  const order = itemIdSet
    ? canonical.orderedItemIds.filter((id) => itemIdSet.has(id))
    : canonical.orderedItemIds;
  return SequencingResponseSchema.parse({ order });
}

export function hasSequencingResponse(
  response: unknown,
  interaction?: AssessmentInteractionContract,
): boolean {
  const order = SequencingResponseSchema.parse(response).order;
  assertUniqueOrderedItemIds(order);
  const itemIds = currentSequencingItemIds(interaction);
  return itemIds ? isExactItemPermutation(order, itemIds) : order.length > 0;
}

export const sequencingResponseCodec: AssessmentCapabilityResponseDefinition<SequencingResponse> = {
  schema: SequencingResponseSchema,
  toContractResponse: toSequencingContractResponse,
  fromContractResponse: fromSequencingContractResponse,
  hasResponse: hasSequencingResponse,
};

export const sequencingAssessmentAdapter: AssessmentBlockAdapter = {
  interactionKind: "sequence",
  choiceMode: null,
  response: sequencingResponseCodec,
};
