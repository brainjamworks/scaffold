/**
 * ProseMirror working attrs use `null` as the in-memory sentinel for absent
 * optional orchestration values (`branching`, `learnerInteractions`,
 * `presentation`). The portable Course Document contract keeps those values
 * strictly optional: absent means omitted, and `null` is rejected.
 *
 * This boundary converts one representation to the other. It never widens the
 * portable schema and never mutates its input.
 */

const ABSENT_ORCHESTRATION_ATTRS = new Set(["branching", "learnerInteractions", "presentation"]);

export function toPortableCourseDocumentAttrs(workingAttrs: unknown): unknown {
  if (!isRecord(workingAttrs)) return workingAttrs;
  const portable: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(workingAttrs)) {
    if (value === null || value === undefined) {
      if (ABSENT_ORCHESTRATION_ATTRS.has(key)) continue;
    }
    portable[key] = value;
  }
  return portable;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
