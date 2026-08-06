import type { JSONContent } from "@tiptap/core";

import { MatchingPrivateAssessmentSchema, MatchingSettingsSchema } from "@scaffold/contracts";

export type MatchingIntegrityIssueCode =
  | "too_few_matching_pairs"
  | "empty_matching_item_id"
  | "duplicate_matching_item_id"
  | "empty_matching_target_id"
  | "duplicate_matching_target_id"
  | "invalid_matching_pair_structure"
  | "invalid_matching_correct_pairs"
  | "stale_matching_feedback_item_id"
  | "unnamed_matching_response";

export interface MatchingIntegrityIssue {
  readonly code: MatchingIntegrityIssueCode;
  readonly message: string;
  readonly path: readonly (string | number)[];
}

interface LocatedPair {
  readonly node: JSONContent;
  readonly path: readonly (string | number)[];
}

export function collectMatchingIntegrityIssues(
  node: JSONContent,
): readonly MatchingIntegrityIssue[] {
  if (node.type !== "matching") return [];

  const issues = collectPublicMatchingIssues(node);
  const pairs = currentPairs(node);
  const itemIds = pairs.map(({ node: pair }) => stringAttr(pair, "itemId"));
  const targetIds = pairs.map(({ node: pair }) => stringAttr(pair, "targetId"));
  const currentItemIds = new Set(itemIds.filter((id) => id.trim().length > 0));
  const assessment = MatchingPrivateAssessmentSchema.safeParse(node.attrs?.["assessment"] ?? {});

  if (
    !assessment.success ||
    !isExactPairMapping(assessment.data.correctPairs, itemIds, targetIds)
  ) {
    issues.push({
      code: "invalid_matching_correct_pairs",
      message:
        "matching correctPairs must map every current item to every current target exactly once",
      path: ["attrs", "assessment", "correctPairs"],
    });
  }

  if (assessment.success) {
    for (const itemId of Object.keys(assessment.data.feedbackByItemId)) {
      if (currentItemIds.has(itemId)) continue;
      issues.push({
        code: "stale_matching_feedback_item_id",
        message: `matching feedback key "${itemId}" must reference a current item`,
        path: ["attrs", "assessment", "feedbackByItemId", itemId],
      });
    }
  }

  return issues;
}

export function assertMatchingIntegrity(node: JSONContent): void {
  const issues = collectMatchingIntegrityIssues(node);
  if (issues.length === 0) return;
  throw new Error(`Invalid matching publication: ${issues.map((issue) => issue.code).join(", ")}`);
}

/** Validates the public Matching shape after private answers have been redacted. */
export function assertMatchingInteractionIntegrity(node: JSONContent): void {
  if (node.type !== "matching") return;
  const issues = collectPublicMatchingIssues(node);
  if (issues.length === 0) return;
  throw new Error(`Invalid matching interaction: ${issues.map((issue) => issue.code).join(", ")}`);
}

function collectPublicMatchingIssues(node: JSONContent): MatchingIntegrityIssue[] {
  const issues: MatchingIntegrityIssue[] = [];
  const settings = MatchingSettingsSchema.safeParse(node.attrs?.["settings"] ?? {});
  const legend = settings.success ? (settings.data.legend?.trim() ?? "") : "";
  const prompt = node.content?.find((child) => child.type === "assessment_prompt");
  if (!legend && !meaningfulText(prompt)) {
    issues.push({
      code: "unnamed_matching_response",
      message: "matching requires a response legend or a meaningful assessment prompt",
      path: ["attrs", "settings", "legend"],
    });
  }

  const pairs = currentPairs(node);
  if (pairs.length < 1) {
    const groupIndex =
      node.content?.findIndex((child) => child.type === "matching_pairs_group") ?? -1;
    issues.push({
      code: "too_few_matching_pairs",
      message: "matching requires at least one pair",
      path: groupIndex >= 0 ? ["content", groupIndex, "content"] : ["content"],
    });
  }

  const seenItemIds = new Set<string>();
  const seenTargetIds = new Set<string>();
  for (const pair of pairs) {
    validateId({
      issues,
      id: stringAttr(pair.node, "itemId"),
      seen: seenItemIds,
      emptyCode: "empty_matching_item_id",
      duplicateCode: "duplicate_matching_item_id",
      kind: "item",
      path: [...pair.path, "attrs", "itemId"],
    });
    validateId({
      issues,
      id: stringAttr(pair.node, "targetId"),
      seen: seenTargetIds,
      emptyCode: "empty_matching_target_id",
      duplicateCode: "duplicate_matching_target_id",
      kind: "target",
      path: [...pair.path, "attrs", "targetId"],
    });

    const content = pair.node.content ?? [];
    if (
      content.length !== 2 ||
      content[0]?.type !== "matching_item" ||
      content[1]?.type !== "matching_target"
    ) {
      issues.push({
        code: "invalid_matching_pair_structure",
        message:
          "matching_pair must contain exactly one matching_item followed by one matching_target",
        path: [...pair.path, "content"],
      });
    }
  }

  return issues;
}

function currentPairs(node: JSONContent): LocatedPair[] {
  const groupIndex =
    node.content?.findIndex((child) => child.type === "matching_pairs_group") ?? -1;
  const group = groupIndex >= 0 ? node.content?.[groupIndex] : undefined;
  return (group?.content ?? [])
    .map((pair, index) => ({
      node: pair,
      path: ["content", groupIndex, "content", index] as const,
    }))
    .filter(({ node: pair }) => pair.type === "matching_pair");
}

function validateId({
  duplicateCode,
  emptyCode,
  id,
  issues,
  kind,
  path,
  seen,
}: {
  duplicateCode: MatchingIntegrityIssueCode;
  emptyCode: MatchingIntegrityIssueCode;
  id: string;
  issues: MatchingIntegrityIssue[];
  kind: "item" | "target";
  path: readonly (string | number)[];
  seen: Set<string>;
}): void {
  if (!id.trim()) {
    issues.push({
      code: emptyCode,
      message: `matching_pair requires a stable ${kind} id`,
      path,
    });
  } else if (seen.has(id)) {
    issues.push({
      code: duplicateCode,
      message: `matching ${kind} id "${id}" must be unique within its block`,
      path,
    });
  } else {
    seen.add(id);
  }
}

function isExactPairMapping(
  correctPairs: readonly { itemId: string; targetId: string }[],
  itemIds: readonly string[],
  targetIds: readonly string[],
): boolean {
  if (correctPairs.length !== itemIds.length) return false;
  if (
    itemIds.some((id) => !id.trim()) ||
    targetIds.some((id) => !id.trim()) ||
    new Set(itemIds).size !== itemIds.length ||
    new Set(targetIds).size !== targetIds.length
  ) {
    return false;
  }
  const itemIdSet = new Set(itemIds);
  const targetIdSet = new Set(targetIds);
  const expectedItemIds = correctPairs.map((pair) => pair.itemId);
  const expectedTargetIds = correctPairs.map((pair) => pair.targetId);
  return (
    new Set(expectedItemIds).size === expectedItemIds.length &&
    new Set(expectedTargetIds).size === expectedTargetIds.length &&
    expectedItemIds.every((id) => itemIdSet.has(id)) &&
    expectedTargetIds.every((id) => targetIdSet.has(id))
  );
}

function stringAttr(node: JSONContent, name: string): string {
  return typeof node.attrs?.[name] === "string" ? node.attrs[name] : "";
}

function meaningfulText(node: JSONContent | undefined): boolean {
  if (!node) return false;
  if (typeof node.text === "string" && node.text.trim()) return true;
  return (node.content ?? []).some(meaningfulText);
}
