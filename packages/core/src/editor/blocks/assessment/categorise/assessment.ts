import type { JSONContent } from "@tiptap/core";
import { z } from "zod";
import {
  CategorisePrivateAssessmentSchema,
  ClassifyAssessmentSchema,
  ClassifyInteractionSchema,
  ClassifyResponseSchema,
  EmbeddedNodeIdSchema,
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

export const CategoriseResponseSchema = z
  .object({
    placements: z.record(EmbeddedNodeRecordKeySchema, EmbeddedNodeIdSchema).default({}),
  })
  .strict();
export type CategoriseResponse = z.infer<typeof CategoriseResponseSchema>;

export function projectCategoriseLearnerNode(node: JSONContent): JSONContent {
  return {
    ...cloneJsonNodeWithoutContent(node),
    attrs: omitAttrs(node, ["assessment"]),
    content: readContent(node).map((child) =>
      child.type === "categorise_content"
        ? projectCategoriseContentLearnerNode(child, readStringAttr(node, "id"))
        : redactCommonAssessmentShellNode(child),
    ),
  };
}

export function projectCategoriseInteraction(
  node: JSONContent,
): Extract<AssessmentInteractionContract, { kind: "classify" }> {
  const { categories, items } = projectCategoriseParts(node);
  return ClassifyInteractionSchema.parse({
    kind: "classify",
    categories,
    items: items.map(({ id, label }) => ({
      id,
      ...(label ? { label } : {}),
    })),
  });
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
  return ClassifyAssessmentSchema.parse({
    kind: "classify",
    correctPlacements,
    feedbackByItemId,
    summaryFeedback: assessment.summaryFeedback,
  });
}

export function projectCategoriseSettings(settings: unknown): Partial<AssessmentTargetSettings> {
  return optionalStringField("legend", readOptionalString(settings, "legend"));
}

function projectCategoriseContentLearnerNode(node: JSONContent, blockId: string): JSONContent {
  const binsGroup = childByType(node, "categorise_bins_group");
  const categories = binsGroup ? childrenOfType(binsGroup, "categorise_bin") : [];
  const authoredItemGroups = categories.flatMap((category) => {
    const group = childByType(category, "categorise_items_group");
    return group ? [group] : [];
  });
  const authoredItems = authoredItemGroups.flatMap((group) =>
    childrenOfType(group, "categorise_item"),
  );
  const items = stableCategoriseSourceItems(authoredItems, blockId);
  const projectedBinsGroup = binsGroup
    ? cloneJsonNodeWithoutContent(binsGroup)
    : { type: "categorise_bins_group" };
  const projectedItemsGroup = authoredItemGroups[0]
    ? cloneJsonNodeWithoutContent(authoredItemGroups[0])
    : { type: "categorise_items_group" };

  return {
    ...cloneJsonNodeWithoutContent(node),
    content: [
      {
        ...projectedBinsGroup,
        content: categories.map(projectCategoriseCategoryLearnerNode),
      },
      {
        ...projectedItemsGroup,
        content: items.map(projectCategoriseItemLearnerNode),
      },
    ],
  };
}

function projectCategoriseCategoryLearnerNode(category: JSONContent): JSONContent {
  const title = childByType(category, "categorise_bin_title");

  return {
    ...cloneJsonNodeWithoutContent(category),
    attrs: readAttrs(category),
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
  const learnerItemsGroup = content ? childByType(content, "categorise_items_group") : null;
  const categories: Array<{ id: string; label?: string }> = [];
  const items: Array<{ id: string; label?: string }> = [];
  const correctPlacements: Array<{ itemId: string; categoryId: string }> = [];
  const correctCategoryByItemId = new Map<string, string>();

  for (const category of binsGroup ? childrenOfType(binsGroup, "categorise_bin") : []) {
    const id = readStringAttr(category, "id");
    if (!id) continue;
    const title = childByType(category, "categorise_bin_title");
    const label = textBetween(title ?? category).trim();
    categories.push({ id, ...(label ? { label } : {}) });
    const itemsGroup = childByType(category, "categorise_items_group");
    for (const item of itemsGroup ? childrenOfType(itemsGroup, "categorise_item") : []) {
      const itemId = readStringAttr(item, "id");
      if (!itemId) continue;
      const labelNode = childByType(item, "categorise_item_body");
      const itemLabel = labelNode ? textBetween(labelNode).trim() : "";
      items.push({ id: itemId, ...(itemLabel ? { label: itemLabel } : {}) });
      correctCategoryByItemId.set(itemId, id);
    }
  }

  for (const item of learnerItemsGroup
    ? childrenOfType(learnerItemsGroup, "categorise_item")
    : []) {
    const itemId = readStringAttr(item, "id");
    if (!itemId) continue;
    const labelNode = childByType(item, "categorise_item_body");
    const itemLabel = textBetween(labelNode ?? item).trim();
    items.push({ id: itemId, ...(itemLabel ? { label: itemLabel } : {}) });
  }

  const orderedItems = learnerItemsGroup
    ? items
    : stableCategoriseProjectedItems(items, readStringAttr(node, "id"));
  for (const item of orderedItems) {
    const categoryId = correctCategoryByItemId.get(item.id);
    if (categoryId) correctPlacements.push({ itemId: item.id, categoryId });
  }

  return { categories, items: orderedItems, correctPlacements };
}

function stableCategoriseSourceItems(
  items: readonly JSONContent[],
  blockId: string,
): JSONContent[] {
  const sorted = items
    .slice()
    .sort((left, right) => compareIds(readStringAttr(left, "id"), readStringAttr(right, "id")));
  const stableIds = sorted.map((item) => readStringAttr(item, "id"));
  return stableShuffleDifferent(sorted, `categorise:${blockId}:${stableIds.join("|")}`);
}

function stableCategoriseProjectedItems<T extends { id: string }>(
  items: readonly T[],
  blockId: string,
): T[] {
  const sorted = items.slice().sort((left, right) => compareIds(left.id, right.id));
  return stableShuffleDifferent(
    sorted,
    `categorise:${blockId}:${sorted.map((item) => item.id).join("|")}`,
  );
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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

interface CategoriseInteractionIdentity {
  readonly categoryIds: readonly string[];
  readonly categoryIdSet: ReadonlySet<string>;
  readonly itemIds: readonly string[];
  readonly itemIdSet: ReadonlySet<string>;
}

function currentCategoriseIdentity(
  interaction?: AssessmentInteractionContract,
): CategoriseInteractionIdentity | null {
  if (!interaction) return null;
  if (interaction.kind !== "classify") {
    throw new Error("Categorise response requires a classify interaction.");
  }
  const itemIds = interaction.items.map((item) => item.id);
  const categoryIds = interaction.categories.map((category) => category.id);
  if (itemIds.some((id) => !id.trim()) || new Set(itemIds).size !== itemIds.length) {
    throw new Error("Categorise interaction item ids must be nonblank and unique.");
  }
  if (categoryIds.some((id) => !id.trim()) || new Set(categoryIds).size !== categoryIds.length) {
    throw new Error("Categorise interaction category ids must be nonblank and unique.");
  }
  return {
    categoryIds,
    categoryIdSet: new Set(categoryIds),
    itemIds,
    itemIdSet: new Set(itemIds),
  };
}

function hasExactCategoriseMapping(
  placements: Readonly<Record<string, string>>,
  identity: CategoriseInteractionIdentity,
): boolean {
  const entries = Object.entries(placements);
  return (
    entries.length === identity.itemIds.length &&
    entries.every(
      ([itemId, categoryId]) =>
        itemId.trim().length > 0 &&
        categoryId.trim().length > 0 &&
        identity.itemIdSet.has(itemId) &&
        identity.categoryIdSet.has(categoryId),
    )
  );
}

export function toCategoriseContractResponse(
  response: unknown,
  interaction?: AssessmentInteractionContract,
) {
  const local = readCategoriseResponse(response).placements;
  const identity = currentCategoriseIdentity(interaction);
  const entries = identity
    ? identity.itemIds.flatMap((itemId) => {
        const categoryId = local[itemId];
        return categoryId && identity.categoryIdSet.has(categoryId)
          ? [[itemId, categoryId] as const]
          : [];
      })
    : Object.entries(local);
  const placements = entries.map(([itemId, categoryId]) => ({ itemId, categoryId }));
  return ClassifyResponseSchema.parse({ kind: "classify", placements });
}

export function fromCategoriseContractResponse(
  response: AssessmentResponseValue,
  interaction?: AssessmentInteractionContract,
): CategoriseResponse {
  const canonical = ClassifyResponseSchema.parse(response);
  assertUniqueCategoriseItemIds(canonical.placements);
  const identity = currentCategoriseIdentity(interaction);
  return CategoriseResponseSchema.parse({
    placements: Object.fromEntries(
      canonical.placements
        .filter(
          ({ itemId, categoryId }) =>
            !identity || (identity.itemIdSet.has(itemId) && identity.categoryIdSet.has(categoryId)),
        )
        .map(({ itemId, categoryId }) => [itemId, categoryId]),
    ),
  });
}

export function hasCategoriseResponse(
  response: unknown,
  interaction?: AssessmentInteractionContract,
): boolean {
  const placements = readCategoriseResponse(response).placements;
  const identity = currentCategoriseIdentity(interaction);
  if (!identity) {
    const entries = Object.entries(placements);
    return (
      entries.length > 0 &&
      entries.every(
        ([itemId, categoryId]) => itemId.trim().length > 0 && categoryId.trim().length > 0,
      )
    );
  }
  return hasExactCategoriseMapping(placements, identity);
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
