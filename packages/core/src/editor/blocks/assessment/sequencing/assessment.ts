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

export const SequencingResponseSchema = z
  .object({
    order: z.array(z.string()).default([]),
  })
  .strict();
export type SequencingResponse = z.infer<typeof SequencingResponseSchema>;

export function projectSequencingLearnerNode(node: JSONContent): JSONContent {
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
  return {
    kind: "sequence",
    items: projectSequencingItems(node),
  };
}

export function projectSequencingAssessment(node: JSONContent): AssessmentAnswerKey {
  const assessment = SequencingPrivateAssessmentSchema.parse(readAttrs(node)["assessment"] ?? {});
  const itemIds = projectSequencingItems(node).map((item) => item.id);
  const itemSet = new Set(itemIds);
  const correctOrder = assessment.correctOrder.filter((id) => itemSet.has(id));
  const feedbackByItemId: typeof assessment.feedbackByItemId = {};
  for (const id of itemIds) {
    const feedback = assessment.feedbackByItemId[id];
    if (feedback) feedbackByItemId[id] = feedback;
  }
  return {
    kind: "sequence",
    correctOrder: correctOrder.length > 0 ? correctOrder : itemIds,
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
    if (!id) continue;
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

export function toSequencingContractResponse(response: unknown) {
  const local = SequencingResponseSchema.parse(response);
  assertUniqueOrderedItemIds(local.order);
  return SequenceResponseSchema.parse({ kind: "sequence", orderedItemIds: local.order });
}

export function fromSequencingContractResponse(
  response: AssessmentResponseValue,
): SequencingResponse {
  const canonical = SequenceResponseSchema.parse(response);
  assertUniqueOrderedItemIds(canonical.orderedItemIds);
  return SequencingResponseSchema.parse({ order: canonical.orderedItemIds });
}

export function hasSequencingResponse(response: unknown): boolean {
  return SequencingResponseSchema.parse(response).order.length > 0;
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
