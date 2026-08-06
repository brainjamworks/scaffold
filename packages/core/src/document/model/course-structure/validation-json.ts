import type { JSONContent } from "@tiptap/core";

import type {
  CourseStructureIssue,
  CourseStructureIssueCode,
  CourseStructureValidationResult,
} from "./types";

export function createCourseStructureIssue(
  code: CourseStructureIssueCode,
  message: string,
  path: readonly (string | number)[],
): CourseStructureIssue {
  return Object.freeze({ code, message, path: Object.freeze([...path]) });
}

export function invalidCourseStructureResult(
  issues: readonly CourseStructureIssue[],
): CourseStructureValidationResult {
  return Object.freeze({ ok: false, issues: Object.freeze([...issues]) });
}

export function courseDocumentChildPath(courseDocumentIndex: number, childIndex: number) {
  return ["content", courseDocumentIndex, "content", childIndex] as const;
}

export function getJsonContent(node: JSONContent | undefined): JSONContent[] {
  return Array.isArray(node?.content) ? node.content : [];
}

export function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function firstJsonDifferencePath(
  parsed: unknown,
  persisted: unknown,
): readonly (string | number)[] | null {
  if (Object.is(parsed, persisted)) return null;
  if (Array.isArray(parsed) || Array.isArray(persisted)) {
    if (!Array.isArray(parsed) || !Array.isArray(persisted)) return [];
    const length = Math.max(parsed.length, persisted.length);
    for (let index = 0; index < length; index += 1) {
      if (index >= parsed.length || index >= persisted.length) return [index];
      const nested = firstJsonDifferencePath(parsed[index], persisted[index]);
      if (nested) return [index, ...nested];
    }
    return null;
  }
  if (!isJsonRecord(parsed) || !isJsonRecord(persisted)) return [];

  const keys = [...new Set([...Object.keys(parsed), ...Object.keys(persisted)])].sort();
  for (const key of keys) {
    if (!(key in parsed) || !(key in persisted)) return [key];
    const nested = firstJsonDifferencePath(parsed[key], persisted[key]);
    if (nested) return [key, ...nested];
  }
  return null;
}

export function formatJsonValue(value: unknown): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}
