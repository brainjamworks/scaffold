import type { JSONContent } from "@tiptap/core";

import {
  FillBlankAttrsSchema,
  FillBlanksPrivateAssessmentSchema,
  FillBlanksSettingsSchema,
  type FillBlanksPrivateAssessment,
} from "@scaffold/contracts";

export type FillBlanksIntegrityIssueCode =
  | "empty_fill_blank_id"
  | "duplicate_fill_blank_id"
  | "missing_fill_blank_assessment"
  | "empty_fill_blank_accepted_answers"
  | "unnamed_fill_blanks_response";

export interface FillBlanksIntegrityIssue {
  readonly code: FillBlanksIntegrityIssueCode;
  readonly message: string;
  readonly path: readonly (string | number)[];
}

export function collectFillBlanksIntegrityIssues(
  node: JSONContent,
): readonly FillBlanksIntegrityIssue[] {
  if (node.type !== "fill_blanks") return [];

  const issues: FillBlanksIntegrityIssue[] = [];
  const assessmentResult = FillBlanksPrivateAssessmentSchema.safeParse(node.attrs?.["assessment"]);
  const assessment: FillBlanksPrivateAssessment = assessmentResult.success
    ? assessmentResult.data
    : FillBlanksPrivateAssessmentSchema.parse({});
  const settingsResult = FillBlanksSettingsSchema.safeParse(node.attrs?.["settings"] ?? {});
  const legend = settingsResult.success ? (settingsResult.data.legend?.trim() ?? "") : "";
  const promptIndex = node.content?.findIndex((child) => child.type === "assessment_prompt") ?? -1;
  const prompt = promptIndex >= 0 ? node.content?.[promptIndex] : undefined;
  if (!legend && !meaningfulText(prompt)) {
    issues.push({
      code: "unnamed_fill_blanks_response",
      message: "fill_blanks requires a response legend or a meaningful assessment prompt",
      path: ["attrs", "settings", "legend"],
    });
  }

  const seenIds = new Set<string>();
  walk(node, [], (child, path) => {
    if (child.type !== "fill_blank") return;
    const parsed = FillBlankAttrsSchema.safeParse(child.attrs ?? {});
    const blankId = parsed.success ? parsed.data.id.trim() : "";
    if (!blankId) {
      issues.push({
        code: "empty_fill_blank_id",
        message: "fill_blank requires a stable id",
        path: [...path, "attrs", "id"],
      });
      return;
    }
    if (seenIds.has(blankId)) {
      issues.push({
        code: "duplicate_fill_blank_id",
        message: `fill_blank id "${blankId}" must be unique within its block`,
        path: [...path, "attrs", "id"],
      });
    } else {
      seenIds.add(blankId);
    }

    const privateBlank = assessment.blanksById[blankId];
    if (!privateBlank) {
      issues.push({
        code: "missing_fill_blank_assessment",
        message: `fill_blank "${blankId}" requires keyed private assessment configuration`,
        path: ["attrs", "assessment", "blanksById", blankId],
      });
      return;
    }
    if (!privateBlank.acceptedAnswers.some((answer) => answer.trim().length > 0)) {
      issues.push({
        code: "empty_fill_blank_accepted_answers",
        message: `fill_blank "${blankId}" requires at least one meaningful accepted answer`,
        path: ["attrs", "assessment", "blanksById", blankId, "acceptedAnswers"],
      });
    }
  });

  return issues;
}

export function assertFillBlanksIntegrity(node: JSONContent): void {
  const issues = collectFillBlanksIntegrityIssues(node);
  if (issues.length === 0) return;
  throw new Error(
    `Invalid fill_blanks publication: ${issues.map((issue) => issue.code).join(", ")}`,
  );
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

function meaningfulText(node: JSONContent | undefined): boolean {
  if (!node) return false;
  if (typeof node.text === "string" && node.text.trim()) return true;
  return (node.content ?? []).some(meaningfulText);
}
