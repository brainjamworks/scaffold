import type { JSONContent } from "@tiptap/core";

export function findCourseDocument(content: unknown): { node: JSONContent; index: number } | null {
  if (!isJSONContent(content) || content.type !== "doc") return null;
  const children = Array.isArray(content.content) ? content.content : [];
  const index = children.findIndex((child) => child.type === "courseDocument");
  if (index === -1) return null;
  return { node: children[index]!, index };
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isJSONContent(value: unknown): value is JSONContent {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
