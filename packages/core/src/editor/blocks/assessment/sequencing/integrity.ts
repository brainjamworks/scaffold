import type { JSONContent } from "@tiptap/core";

import { SequencingPrivateAssessmentSchema, SequencingSettingsSchema } from "@scaffold/contracts";

export type SequencingIntegrityIssueCode =
  | "too_few_sequencing_items"
  | "empty_sequencing_item_id"
  | "duplicate_sequencing_item_id"
  | "invalid_sequencing_correct_order"
  | "unnamed_sequencing_response";

export interface SequencingIntegrityIssue {
  readonly code: SequencingIntegrityIssueCode;
  readonly message: string;
  readonly path: readonly (string | number)[];
}

export function collectSequencingIntegrityIssues(
  node: JSONContent,
): readonly SequencingIntegrityIssue[] {
  if (node.type !== "sequencing") return [];

  const issues: SequencingIntegrityIssue[] = [];
  const settingsResult = SequencingSettingsSchema.safeParse(node.attrs?.["settings"] ?? {});
  const legend = settingsResult.success ? (settingsResult.data.legend?.trim() ?? "") : "";
  const promptIndex = node.content?.findIndex((child) => child.type === "assessment_prompt") ?? -1;
  const prompt = promptIndex >= 0 ? node.content?.[promptIndex] : undefined;
  if (!legend && !meaningfulText(prompt)) {
    issues.push({
      code: "unnamed_sequencing_response",
      message: "sequencing requires a response legend or a meaningful assessment prompt",
      path: ["attrs", "settings", "legend"],
    });
  }

  const groupIndex =
    node.content?.findIndex((child) => child.type === "sequencing_items_group") ?? -1;
  const group = groupIndex >= 0 ? node.content?.[groupIndex] : undefined;
  const items = (group?.content ?? []).filter((child) => child.type === "sequencing_item");
  if (items.length < 2) {
    issues.push({
      code: "too_few_sequencing_items",
      message: "sequencing requires at least two items",
      path: groupIndex >= 0 ? ["content", groupIndex, "content"] : ["content"],
    });
  }

  const itemIds: string[] = [];
  const seenIds = new Set<string>();
  for (const [index, item] of items.entries()) {
    const id = typeof item.attrs?.["id"] === "string" ? item.attrs["id"] : "";
    const itemPath = ["content", groupIndex, "content", index, "attrs", "id"];
    itemIds.push(id);
    if (!id.trim()) {
      issues.push({
        code: "empty_sequencing_item_id",
        message: "sequencing_item requires a stable id",
        path: itemPath,
      });
      continue;
    }
    if (seenIds.has(id)) {
      issues.push({
        code: "duplicate_sequencing_item_id",
        message: `sequencing_item id "${id}" must be unique within its block`,
        path: itemPath,
      });
    } else {
      seenIds.add(id);
    }
  }

  const assessmentResult = SequencingPrivateAssessmentSchema.safeParse(
    node.attrs?.["assessment"] ?? {},
  );
  const correctOrder = assessmentResult.success ? assessmentResult.data.correctOrder : [];
  if (!isExactPermutation(correctOrder, itemIds)) {
    issues.push({
      code: "invalid_sequencing_correct_order",
      message: "sequencing correctOrder must contain every unique item id exactly once",
      path: ["attrs", "assessment", "correctOrder"],
    });
  }

  return issues;
}

export function assertSequencingIntegrity(node: JSONContent): void {
  const issues = collectSequencingIntegrityIssues(node);
  if (issues.length === 0) return;
  throw new Error(
    `Invalid sequencing publication: ${issues.map((issue) => issue.code).join(", ")}`,
  );
}

/** Validates the public interaction shape after private answer state has been redacted. */
export function assertSequencingInteractionIntegrity(node: JSONContent): void {
  const issues = collectSequencingIntegrityIssues(node).filter(
    (issue) => issue.code !== "invalid_sequencing_correct_order",
  );
  if (issues.length === 0) return;
  throw new Error(
    `Invalid sequencing interaction: ${issues.map((issue) => issue.code).join(", ")}`,
  );
}

function isExactPermutation(order: readonly string[], itemIds: readonly string[]): boolean {
  if (order.length !== itemIds.length) return false;
  if (new Set(order).size !== order.length || new Set(itemIds).size !== itemIds.length)
    return false;
  const itemSet = new Set(itemIds);
  return order.every((id) => id.trim().length > 0 && itemSet.has(id));
}

function meaningfulText(node: JSONContent | undefined): boolean {
  if (!node) return false;
  if (typeof node.text === "string" && node.text.trim()) return true;
  return (node.content ?? []).some(meaningfulText);
}
