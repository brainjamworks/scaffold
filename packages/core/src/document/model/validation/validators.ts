import type { JSONContent } from "@tiptap/core";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import {
  AnnotatedFigureAnnotationAttrsSchema,
  AnnotatedFigureDataSchema,
} from "@scaffold/contracts";
import { collectFillBlanksIntegrityIssues } from "@/editor/blocks/assessment/fill-blanks/integrity";
import {
  collectCategoriseIntegrityIssues,
  type CategoriseIntegrityIssueCode,
} from "@/editor/blocks/assessment/categorise/integrity";
import { collectSequencingIntegrityIssues } from "@/editor/blocks/assessment/sequencing/integrity";
import {
  collectMatchingIntegrityIssues,
  type MatchingIntegrityIssueCode,
} from "@/editor/blocks/assessment/matching/integrity";

import {
  validateCourseSurfaceLifecycle,
  type CourseDocumentIssueCode as SurfaceCourseDocumentIssueCode,
} from "./surface-lifecycle-validation";

export type CourseDocumentIssueCode =
  | SurfaceCourseDocumentIssueCode
  | "invalid_annotated_figure_data"
  | "invalid_annotated_figure_structure"
  | "invalid_annotated_figure_annotation_attrs"
  | "duplicate_annotated_figure_annotation_id"
  | "invalid_annotated_figure_annotation_content"
  | CategoriseIntegrityIssueCode
  | MatchingIntegrityIssueCode
  | "empty_fill_blank_id"
  | "duplicate_fill_blank_id"
  | "missing_fill_blank_assessment"
  | "empty_fill_blank_accepted_answers"
  | "unnamed_fill_blanks_response"
  | "too_few_sequencing_items"
  | "empty_sequencing_item_id"
  | "duplicate_sequencing_item_id"
  | "invalid_sequencing_correct_order"
  | "unnamed_sequencing_response";

export interface CourseDocumentIssue {
  readonly code: CourseDocumentIssueCode;
  readonly message: string;
  readonly path: readonly (string | number)[];
}

export interface CourseDocumentValidationResult {
  readonly ok: boolean;
  readonly issues: readonly CourseDocumentIssue[];
}

function getContent(node: JSONContent | undefined): JSONContent[] {
  return Array.isArray(node?.content) ? node.content : [];
}

export function validateCourseDocumentJSON(content: JSONContent): CourseDocumentValidationResult {
  const surfaceResult = validateCourseSurfaceLifecycle({
    content,
    registry: builtInSurfaceVariantRegistry,
  });
  const issues: CourseDocumentIssue[] = surfaceResult.ok ? [] : [...surfaceResult.issues];
  collectQuizCompletenessIssues(content, []).forEach((quizIssue) => issues.push(quizIssue));
  collectFillBlanksIssues(content, []).forEach((issue) => issues.push(issue));
  collectSequencingIssues(content, []).forEach((issue) => issues.push(issue));
  collectCategoriseIssues(content, []).forEach((issue) => issues.push(issue));
  collectMatchingIssues(content, []).forEach((issue) => issues.push(issue));
  collectAnnotatedFigureIssues(content, []).forEach((issue) => issues.push(issue));

  const ownedIssues = Object.freeze([...issues]);
  return Object.freeze({
    ok: issues.length === 0,
    issues: ownedIssues,
  });
}

function collectMatchingIssues(
  node: JSONContent,
  path: Array<string | number>,
): CourseDocumentIssue[] {
  const issues =
    node.type === "matching"
      ? collectMatchingIntegrityIssues(node).map((issue) =>
          createIssue(issue.code, issue.message, [...path, ...issue.path]),
        )
      : [];
  for (const [index, child] of getContent(node).entries()) {
    issues.push(...collectMatchingIssues(child, [...path, "content", index]));
  }
  return issues;
}

function collectCategoriseIssues(
  node: JSONContent,
  path: Array<string | number>,
): CourseDocumentIssue[] {
  const issues =
    node.type === "categorise"
      ? collectCategoriseIntegrityIssues(node).map((issue) =>
          createIssue(issue.code, issue.message, [...path, ...issue.path]),
        )
      : [];
  for (const [index, child] of getContent(node).entries()) {
    issues.push(...collectCategoriseIssues(child, [...path, "content", index]));
  }
  return issues;
}

function collectSequencingIssues(
  node: JSONContent,
  path: Array<string | number>,
): CourseDocumentIssue[] {
  const issues =
    node.type === "sequencing"
      ? collectSequencingIntegrityIssues(node).map((issue) =>
          createIssue(issue.code, issue.message, [...path, ...issue.path]),
        )
      : [];
  for (const [index, child] of getContent(node).entries()) {
    issues.push(...collectSequencingIssues(child, [...path, "content", index]));
  }
  return issues;
}

function collectFillBlanksIssues(
  node: JSONContent,
  path: Array<string | number>,
): CourseDocumentIssue[] {
  const issues =
    node.type === "fill_blanks"
      ? collectFillBlanksIntegrityIssues(node).map((issue) =>
          createIssue(issue.code, issue.message, [...path, ...issue.path]),
        )
      : [];
  for (const [index, child] of getContent(node).entries()) {
    issues.push(...collectFillBlanksIssues(child, [...path, "content", index]));
  }
  return issues;
}

function collectQuizCompletenessIssues(
  node: JSONContent,
  path: Array<string | number>,
): CourseDocumentIssue[] {
  const issues: CourseDocumentIssue[] = [];

  if (node.type === "quiz" && !hasAssessmentQuestionChild(node)) {
    issues.push(
      createIssue("incomplete_quiz", "quiz must contain at least one assessment question", path),
    );
  }

  for (const [index, child] of getContent(node).entries()) {
    issues.push(...collectQuizCompletenessIssues(child, [...path, "content", index]));
  }

  return issues;
}

function collectAnnotatedFigureIssues(
  node: JSONContent,
  path: Array<string | number>,
): CourseDocumentIssue[] {
  const issues = node.type === "annotated_figure" ? validateAnnotatedFigureNode(node, path) : [];

  for (const [index, child] of getContent(node).entries()) {
    issues.push(...collectAnnotatedFigureIssues(child, [...path, "content", index]));
  }
  return issues;
}

function validateAnnotatedFigureNode(
  node: JSONContent,
  path: Array<string | number>,
): CourseDocumentIssue[] {
  const issues: CourseDocumentIssue[] = [];
  const dataResult = AnnotatedFigureDataSchema.safeParse(node.attrs?.["data"]);
  if (!dataResult.success) {
    for (const schemaIssue of dataResult.error.issues) {
      const unknownKey = schemaIssue.code === "unrecognized_keys" ? schemaIssue.keys[0] : undefined;
      issues.push(
        createIssue("invalid_annotated_figure_data", "annotated_figure data is invalid", [
          ...path,
          "attrs",
          "data",
          ...schemaIssue.path,
          ...(unknownKey ? [unknownKey] : []),
        ]),
      );
    }
  }

  const children = getContent(node);
  const expectedTypes = ["annotated_figure_canvas", "annotated_figure_legend"] as const;
  for (const [index, expectedType] of expectedTypes.entries()) {
    const child = children[index];
    if (child?.type === expectedType) continue;
    issues.push(
      createIssue(
        "invalid_annotated_figure_structure",
        `annotated_figure child ${index} must be "${expectedType}"`,
        [...path, "content", index, ...(child ? ["type"] : [])],
      ),
    );
  }
  if (children.length > expectedTypes.length) {
    issues.push(
      createIssue(
        "invalid_annotated_figure_structure",
        `annotated_figure must contain exactly ${expectedTypes.length} children`,
        [...path, "content", expectedTypes.length],
      ),
    );
  }

  const canvas = children[0];
  if (canvas?.type === "annotated_figure_canvas" && getContent(canvas).length > 0) {
    issues.push(
      createIssue(
        "invalid_annotated_figure_structure",
        "annotated_figure_canvas must be atomic and contain no content",
        [...path, "content", 0, "content", 0],
      ),
    );
  }

  const legend = children[1];
  if (legend?.type !== "annotated_figure_legend") return issues;

  const seenIds = new Set<string>();
  for (const [index, annotation] of getContent(legend).entries()) {
    const annotationPath = [...path, "content", 1, "content", index];
    if (annotation.type !== "annotated_figure_annotation") {
      issues.push(
        createIssue(
          "invalid_annotated_figure_structure",
          "annotated_figure_legend may contain only annotated_figure_annotation children",
          [...annotationPath, "type"],
        ),
      );
      continue;
    }

    const attrsResult = AnnotatedFigureAnnotationAttrsSchema.safeParse(annotation.attrs);
    if (!attrsResult.success) {
      for (const schemaIssue of attrsResult.error.issues) {
        const unknownKey =
          schemaIssue.code === "unrecognized_keys" ? schemaIssue.keys[0] : undefined;
        issues.push(
          createIssue(
            "invalid_annotated_figure_annotation_attrs",
            "annotated_figure_annotation attrs are invalid",
            [...annotationPath, "attrs", ...schemaIssue.path, ...(unknownKey ? [unknownKey] : [])],
          ),
        );
      }
    }

    const annotationId = annotation.attrs?.["id"];
    if (typeof annotationId === "string" && annotationId.length > 0 && seenIds.has(annotationId)) {
      issues.push(
        createIssue(
          "duplicate_annotated_figure_annotation_id",
          `annotated figure annotation id "${annotationId}" must be unique`,
          [...annotationPath, "attrs", "id"],
        ),
      );
    } else if (typeof annotationId === "string" && annotationId.length > 0) {
      seenIds.add(annotationId);
    }

    const caption = getContent(annotation);
    if (caption.length !== 1 || caption[0]?.type !== "paragraph") {
      const mismatchIndex = caption.length === 0 ? 0 : caption[0]?.type !== "paragraph" ? 0 : 1;
      issues.push(
        createIssue(
          "invalid_annotated_figure_annotation_content",
          "annotated_figure_annotation must contain exactly one paragraph",
          [
            ...annotationPath,
            "content",
            mismatchIndex,
            ...(caption[mismatchIndex] ? ["type"] : []),
          ],
        ),
      );
    }
  }

  return issues;
}

function createIssue(
  code: CourseDocumentIssueCode,
  message: string,
  path: readonly (string | number)[],
): CourseDocumentIssue {
  return Object.freeze({ code, message, path: Object.freeze([...path]) });
}

function hasAssessmentQuestionChild(node: JSONContent): boolean {
  return getContent(node).some((child) => {
    if (!child.type) return false;
    return Boolean(builtInBlockRegistry.getByNodeType(child.type)?.capabilities?.assessment);
  });
}
