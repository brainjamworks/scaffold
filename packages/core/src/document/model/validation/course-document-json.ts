import type { JSONContent } from "@tiptap/core";

export function cloneCourseDocumentJSON(content: unknown): JSONContent | null {
  if (!content || typeof content !== "object" || Array.isArray(content)) return null;
  try {
    const serialized = JSON.stringify(content);
    if (!serialized) return null;
    const parsed = JSON.parse(serialized) as unknown;
    return isJSONContent(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function findCourseDocument(
  content: unknown,
): { readonly node: JSONContent; readonly index: number } | null {
  if (!isJSONContent(content) || content.type !== "doc") return null;
  const children = Array.isArray(content.content) ? content.content : [];
  const index = children.findIndex((child) => child.type === "courseDocument");
  return index === -1 ? null : { node: children[index]!, index };
}

export function readCourseDocumentFormatVersion(content: unknown): number | null {
  const courseDocument = findCourseDocument(content);
  if (!courseDocument) return null;
  const attrs = asRecord(courseDocument.node.attrs);
  const version = attrs?.["schemaVersion"];
  if (version === undefined || version === null || version === "") return null;
  const parsed = typeof version === "number" ? version : Number(version);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isJSONContent(value: unknown): value is JSONContent {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
