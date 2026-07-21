import type { JSONContent } from "@tiptap/core";
import { z } from "zod";
import {
  CategorisePrivateAssessmentSchema,
  ClassifyResponseSchema,
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
  textBetween,
} from "@/editor/blocks/assessment/shared/publication/projection";

export const CategoriseResponseSchema = z
  .object({
    placements: z.record(z.string(), z.string()).default({}),
  })
  .strict();
export type CategoriseResponse = z.infer<typeof CategoriseResponseSchema>;

export function projectCategoriseLearnerNode(node: JSONContent): JSONContent {
  return {
    ...cloneJsonNodeWithoutContent(node),
    attrs: omitAttrs(node, ["assessment"]),
    content: readContent(node).map((child) =>
      child.type === "categorise_content"
        ? projectCategoriseContentLearnerNode(child)
        : redactCommonAssessmentShellNode(child),
    ),
  };
}

export function projectCategoriseInteraction(node: JSONContent): AssessmentInteractionContract {
  const { categories, items } = projectCategoriseParts(node);
  return {
    kind: "classify",
    categories,
    items: items.map(({ id, label }) => ({
      id,
      ...(label ? { label } : {}),
    })),
  };
}

export function projectCategoriseAssessment(node: JSONContent): AssessmentAnswerKey {
  const assessment = CategorisePrivateAssessmentSchema.parse(readAttrs(node)["assessment"] ?? {});
  const { correctPlacements, items } = projectCategoriseParts(node);
  const itemIds = new Set(items.map((item) => item.id));
  const feedbackByItemId: typeof assessment.feedbackByItemId = {};
  for (const itemId of itemIds) {
    const feedback = assessment.feedbackByItemId[itemId];
    if (feedback) feedbackByItemId[itemId] = feedback;
  }
  return {
    kind: "classify",
    correctPlacements,
    feedbackByItemId,
    summaryFeedback: assessment.summaryFeedback,
  };
}

export function projectCategoriseSettings(settings: unknown): Partial<AssessmentTargetSettings> {
  return optionalStringField("legend", readOptionalString(settings, "legend"));
}

function projectCategoriseContentLearnerNode(node: JSONContent): JSONContent {
  const binsGroup = childByType(node, "categorise_bins_group");
  const bins = binsGroup ? childrenOfType(binsGroup, "categorise_bin") : [];
  const items = bins.flatMap((bin) => {
    const group = childByType(bin, "categorise_items_group");
    return group ? childrenOfType(group, "categorise_item") : [];
  });

  return {
    ...cloneJsonNodeWithoutContent(node),
    content: [
      {
        type: "categorise_bins_group",
        content: bins.map(projectCategoriseBinLearnerNode),
      },
      {
        type: "categorise_items_group",
        content: items.map(projectCategoriseItemLearnerNode),
      },
    ],
  };
}

function projectCategoriseBinLearnerNode(bin: JSONContent): JSONContent {
  const title = childByType(bin, "categorise_bin_title");

  return {
    ...cloneJsonNodeWithoutContent(bin),
    attrs: readAttrs(bin),
    content: title ? readContent(title).map((child) => redactCommonAssessmentShellNode(child)) : [],
  };
}

function projectCategoriseItemLearnerNode(item: JSONContent): JSONContent {
  return {
    ...cloneJsonNodeWithoutContent(item),
    attrs: readAttrs(item),
    content: readContent(item).map((child) => redactCommonAssessmentShellNode(child)),
  };
}

function projectCategoriseParts(node: JSONContent): {
  categories: Array<{ id: string; label?: string }>;
  items: Array<{ id: string; label?: string }>;
  correctPlacements: Array<{ itemId: string; categoryId: string }>;
} {
  const content = childByType(node, "categorise_content");
  const binsGroup = content ? childByType(content, "categorise_bins_group") : null;
  const categories: Array<{ id: string; label?: string }> = [];
  const items: Array<{ id: string; label?: string }> = [];
  const correctPlacements: Array<{ itemId: string; categoryId: string }> = [];

  for (const bin of binsGroup ? childrenOfType(binsGroup, "categorise_bin") : []) {
    const id = readStringAttr(bin, "id");
    if (!id) continue;
    const title = childByType(bin, "categorise_bin_title");
    const label = title ? textBetween(title).trim() : "";
    categories.push({ id, ...(label ? { label } : {}) });
    const itemsGroup = childByType(bin, "categorise_items_group");
    for (const item of itemsGroup ? childrenOfType(itemsGroup, "categorise_item") : []) {
      const itemId = readStringAttr(item, "id");
      if (!itemId) continue;
      const labelNode = childByType(item, "categorise_item_body");
      const itemLabel = labelNode ? textBetween(labelNode).trim() : "";
      items.push({ id: itemId, ...(itemLabel ? { label: itemLabel } : {}) });
      correctPlacements.push({ itemId, categoryId: id });
    }
  }

  return { categories, items, correctPlacements };
}

export function readCategoriseResponse(response: unknown): CategoriseResponse {
  return CategoriseResponseSchema.parse(response);
}

function assertUniqueCategoriseItemIds(
  placements: readonly { itemId: string; categoryId: string }[],
): void {
  const itemIds = placements.map((placement) => placement.itemId);
  if (new Set(itemIds).size !== itemIds.length) {
    throw new Error("Categorise response item ids must be unique.");
  }
}

export function toCategoriseContractResponse(response: unknown) {
  const placements = Object.entries(readCategoriseResponse(response).placements).map(
    ([itemId, categoryId]) => ({
      itemId,
      categoryId,
    }),
  );
  return ClassifyResponseSchema.parse({ kind: "classify", placements });
}

export function fromCategoriseContractResponse(
  response: AssessmentResponseValue,
): CategoriseResponse {
  const canonical = ClassifyResponseSchema.parse(response);
  assertUniqueCategoriseItemIds(canonical.placements);
  return CategoriseResponseSchema.parse({
    placements: Object.fromEntries(
      canonical.placements.map(({ itemId, categoryId }) => [itemId, categoryId]),
    ),
  });
}

export function hasCategoriseResponse(response: unknown): boolean {
  return Object.keys(readCategoriseResponse(response).placements).length > 0;
}

export const categoriseResponseCodec: AssessmentCapabilityResponseDefinition<CategoriseResponse> = {
  schema: CategoriseResponseSchema,
  toContractResponse: toCategoriseContractResponse,
  fromContractResponse: fromCategoriseContractResponse,
  hasResponse: hasCategoriseResponse,
};

export const categoriseAssessmentAdapter: AssessmentBlockAdapter = {
  interactionKind: "classify",
  choiceMode: null,
  response: categoriseResponseCodec,
};
