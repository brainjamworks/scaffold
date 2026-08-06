import type { JSONContent } from "@tiptap/core";

import { CategorisePrivateAssessmentSchema, CategoriseSettingsSchema } from "@scaffold/contracts";

export type CategoriseIntegrityIssueCode =
  | "too_few_categorise_categories"
  | "too_few_categorise_items"
  | "empty_categorise_category_id"
  | "duplicate_categorise_category_id"
  | "empty_categorise_item_id"
  | "duplicate_categorise_item_id"
  | "invalid_categorise_item_structure"
  | "stale_categorise_feedback_item_id"
  | "unnamed_categorise_response";

export interface CategoriseIntegrityIssue {
  readonly code: CategoriseIntegrityIssueCode;
  readonly message: string;
  readonly path: readonly (string | number)[];
}

interface LocatedNode {
  readonly node: JSONContent;
  readonly path: readonly (string | number)[];
}

export function collectCategoriseIntegrityIssues(
  node: JSONContent,
): readonly CategoriseIntegrityIssue[] {
  if (node.type !== "categorise") return [];

  const issues = collectPublicCategoriseIssues(node, false);
  const currentItemIds = new Set<string>();
  for (const item of locateDescendants(node, "categorise_item")) {
    const id = stringId(item.node);
    if (id.trim() && isCurrentCategoryItem(node, item.path)) currentItemIds.add(id);
  }

  const assessment = CategorisePrivateAssessmentSchema.safeParse(node.attrs?.["assessment"]);
  if (assessment.success) {
    for (const feedbackItemId of Object.keys(assessment.data.feedbackByItemId)) {
      if (currentItemIds.has(feedbackItemId)) continue;
      issues.push({
        code: "stale_categorise_feedback_item_id",
        message: `categorise feedback key "${feedbackItemId}" must reference a current item`,
        path: ["attrs", "assessment", "feedbackByItemId", feedbackItemId],
      });
    }
  }

  return issues;
}

export function assertCategoriseIntegrity(node: JSONContent): void {
  const issues = collectCategoriseIntegrityIssues(node);
  if (issues.length === 0) return;
  throw new Error(
    `Invalid categorise publication: ${issues.map((issue) => issue.code).join(", ")}`,
  );
}

/** Validates the redacted learner interaction, whose items live in one source group. */
export function assertCategoriseInteractionIntegrity(node: JSONContent): void {
  if (node.type !== "categorise") return;
  const issues = collectPublicCategoriseIssues(node, true);
  if (issues.length === 0) return;
  throw new Error(
    `Invalid categorise interaction: ${issues.map((issue) => issue.code).join(", ")}`,
  );
}

function collectPublicCategoriseIssues(
  node: JSONContent,
  acceptLearnerSource: boolean,
): CategoriseIntegrityIssue[] {
  const issues: CategoriseIntegrityIssue[] = [];
  const settings = CategoriseSettingsSchema.safeParse(node.attrs?.["settings"] ?? {});
  const legend = settings.success ? (settings.data.legend?.trim() ?? "") : "";
  const promptIndex = node.content?.findIndex((child) => child.type === "assessment_prompt") ?? -1;
  const prompt = promptIndex >= 0 ? node.content?.[promptIndex] : undefined;
  if (!legend && !meaningfulText(prompt)) {
    issues.push({
      code: "unnamed_categorise_response",
      message: "categorise requires a response legend or a meaningful assessment prompt",
      path: ["attrs", "settings", "legend"],
    });
  }

  const contentIndex =
    node.content?.findIndex((child) => child.type === "categorise_content") ?? -1;
  const content = contentIndex >= 0 ? node.content?.[contentIndex] : undefined;
  const binsIndex =
    content?.content?.findIndex((child) => child.type === "categorise_bins_group") ?? -1;
  const binsGroup = binsIndex >= 0 ? content?.content?.[binsIndex] : undefined;
  const categories = (binsGroup?.content ?? []).filter((child) => child.type === "categorise_bin");
  if (categories.length < 2) {
    issues.push({
      code: "too_few_categorise_categories",
      message: "categorise requires at least two categories",
      path:
        contentIndex >= 0 && binsIndex >= 0
          ? ["content", contentIndex, "content", binsIndex, "content"]
          : ["content"],
    });
  }

  const seenCategoryIds = new Set<string>();
  for (const [index, category] of categories.entries()) {
    const id = stringId(category);
    const path = ["content", contentIndex, "content", binsIndex, "content", index, "attrs", "id"];
    if (!id.trim()) {
      issues.push({
        code: "empty_categorise_category_id",
        message: "categorise_bin requires a stable id",
        path,
      });
    } else if (seenCategoryIds.has(id)) {
      issues.push({
        code: "duplicate_categorise_category_id",
        message: `categorise_bin id "${id}" must be unique within its block`,
        path,
      });
    } else {
      seenCategoryIds.add(id);
    }
  }

  const sourceIndex =
    content?.content?.findIndex((child) => child.type === "categorise_items_group") ?? -1;
  const sourceGroup = sourceIndex >= 0 ? content?.content?.[sourceIndex] : undefined;
  const allItems = locateDescendants(node, "categorise_item");
  const interactionItems =
    acceptLearnerSource && sourceGroup
      ? (sourceGroup.content ?? [])
          .map((item, index) => ({
            node: item,
            path: ["content", contentIndex, "content", sourceIndex, "content", index],
          }))
          .filter((item) => item.node.type === "categorise_item")
      : allItems;

  if (interactionItems.length < 1) {
    issues.push({
      code: "too_few_categorise_items",
      message: "categorise requires at least one item",
      path: contentIndex >= 0 ? ["content", contentIndex, "content"] : ["content"],
    });
  }

  const seenItemIds = new Set<string>();
  for (const item of interactionItems) {
    const id = stringId(item.node);
    const idPath = [...item.path, "attrs", "id"];
    if (!id.trim()) {
      issues.push({
        code: "empty_categorise_item_id",
        message: "categorise_item requires a stable id",
        path: idPath,
      });
    } else if (seenItemIds.has(id)) {
      issues.push({
        code: "duplicate_categorise_item_id",
        message: `categorise_item id "${id}" must be unique within its block`,
        path: idPath,
      });
    } else {
      seenItemIds.add(id);
    }
  }

  if (!acceptLearnerSource || !sourceGroup) {
    for (const item of allItems) {
      if (isCurrentCategoryItem(node, item.path)) continue;
      issues.push({
        code: "invalid_categorise_item_structure",
        message: "categorise_item must be nested exactly once under a current category",
        path: item.path,
      });
    }
  } else {
    for (const item of allItems) {
      if (isCurrentLearnerSourceItem(node, item.path)) continue;
      issues.push({
        code: "invalid_categorise_item_structure",
        message: "learner categorise_item must be nested exactly once in the current source group",
        path: item.path,
      });
    }
  }

  return issues;
}

function locateDescendants(node: JSONContent, type: string): LocatedNode[] {
  const out: LocatedNode[] = [];
  walk(node, [], (child, path) => {
    if (child.type === type) out.push({ node: child, path });
  });
  return out;
}

function isCurrentCategoryItem(
  block: JSONContent,
  itemPath: readonly (string | number)[],
): boolean {
  const chain = nodesAlongPath(block, itemPath);
  const item = chain.at(-1);
  const group = chain.at(-2);
  const category = chain.at(-3);
  const bins = chain.at(-4);
  const content = chain.at(-5);
  const currentContent = block.content?.find((child) => child.type === "categorise_content");
  const currentBins = currentContent?.content?.find(
    (child) => child.type === "categorise_bins_group",
  );
  const currentItemsGroup = category?.content?.find(
    (child) => child.type === "categorise_items_group",
  );
  return (
    item?.type === "categorise_item" &&
    group?.type === "categorise_items_group" &&
    category?.type === "categorise_bin" &&
    bins?.type === "categorise_bins_group" &&
    content?.type === "categorise_content" &&
    content === currentContent &&
    bins === currentBins &&
    currentBins?.content?.includes(category) === true &&
    group === currentItemsGroup
  );
}

function isCurrentLearnerSourceItem(
  block: JSONContent,
  itemPath: readonly (string | number)[],
): boolean {
  const chain = nodesAlongPath(block, itemPath);
  const item = chain.at(-1);
  const group = chain.at(-2);
  const content = chain.at(-3);
  const currentContent = block.content?.find((child) => child.type === "categorise_content");
  const currentSource = currentContent?.content?.find(
    (child) => child.type === "categorise_items_group",
  );
  return (
    item?.type === "categorise_item" &&
    group?.type === "categorise_items_group" &&
    content?.type === "categorise_content" &&
    content === currentContent &&
    group === currentSource
  );
}

function nodesAlongPath(root: JSONContent, path: readonly (string | number)[]): JSONContent[] {
  const nodes = [root];
  let current: JSONContent | undefined = root;
  for (let index = 0; index < path.length; index += 2) {
    if (path[index] !== "content") return nodes;
    const childIndex = path[index + 1];
    if (typeof childIndex !== "number") return nodes;
    current = current.content?.[childIndex];
    if (!current) return nodes;
    nodes.push(current);
  }
  return nodes;
}

function walk(
  node: JSONContent,
  path: readonly (string | number)[],
  visit: (node: JSONContent, path: readonly (string | number)[]) => void,
): void {
  visit(node, path);
  for (const [index, child] of (node.content ?? []).entries()) {
    walk(child, [...path, "content", index], visit);
  }
}

function stringId(node: JSONContent): string {
  return typeof node.attrs?.["id"] === "string" ? node.attrs["id"] : "";
}

function meaningfulText(node: JSONContent | undefined): boolean {
  if (!node) return false;
  if (typeof node.text === "string" && node.text.trim()) return true;
  return (node.content ?? []).some(meaningfulText);
}
