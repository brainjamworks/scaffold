import type { JSONContent } from "@tiptap/core";

import type { AssessmentTargetSettings } from "@scaffold/contracts";

/** Shared helpers for publishing authored assessment content. */
export function readContent(node: JSONContent): JSONContent[] {
  return Array.isArray(node.content) ? node.content : [];
}

export function readAttrs(node: JSONContent): Record<string, unknown> {
  return isRecord(node.attrs) ? node.attrs : {};
}

export function readStringAttr(node: JSONContent, key: string): string {
  const value = readAttrs(node)[key];
  return typeof value === "string" ? value : "";
}

export function readOptionalString(settings: unknown, key: string): string | undefined {
  if (!isRecord(settings)) return undefined;
  const value = settings[key];
  return typeof value === "string" ? value : undefined;
}

export function readNullableNumber(settings: unknown, key: string): number | null | undefined {
  if (!isRecord(settings)) return undefined;
  const value = settings[key];
  return typeof value === "number" ? value : value === null ? null : undefined;
}

export function childByType(node: JSONContent, type: string): JSONContent | null {
  return readContent(node).find((child) => child.type === type) ?? null;
}

export function childrenOfType(node: JSONContent, type: string): JSONContent[] {
  return readContent(node).filter((child) => child.type === type);
}

export function childText(node: JSONContent, childType: string): string {
  const child = childByType(node, childType);
  return child ? textBetween(child).trim() : "";
}

export function textBetween(node: JSONContent): string {
  if (typeof node.text === "string") return node.text;
  return readContent(node)
    .map(textBetween)
    .filter((part) => part.length > 0)
    .join(" ");
}

export function walkDescendants(node: JSONContent, visit: (child: JSONContent) => void) {
  for (const child of readContent(node)) {
    visit(child);
    walkDescendants(child, visit);
  }
}

export function redactCommonAssessmentShellNode(
  node: JSONContent,
  redactChild: (child: JSONContent) => JSONContent = redactCommonAssessmentShellNode,
): JSONContent {
  if (node.type === "assessment_summary_feedback") {
    return {
      ...cloneJsonNodeWithoutContent(node),
      content: [{ type: "paragraph" }],
    };
  }

  return {
    ...cloneJsonNodeWithoutContent(node),
    ...(node.content ? { content: readContent(node).map((child) => redactChild(child)) } : {}),
  };
}

export function redactSelectableChoicesGroupNode(group: JSONContent): JSONContent {
  return {
    ...cloneJsonNodeWithoutContent(group),
    content: readContent(group).map((child) =>
      child.type === "selectable_choice"
        ? redactSelectableChoiceNode(child)
        : redactCommonAssessmentShellNode(child),
    ),
  };
}

export function redactSelectableChoiceNode(choice: JSONContent): JSONContent {
  return {
    ...cloneJsonNodeWithoutContent(choice),
    attrs: omitAttrs(choice, ["isCorrect"]),
    content: readContent(choice).map((child) => redactCommonAssessmentShellNode(child)),
  };
}

export function feedbackRecord(
  entries: Array<{ id: string; feedback?: string }>,
): Record<string, unknown> {
  const feedbackById: Record<string, unknown> = {};
  for (const entry of entries) {
    if (entry.feedback) feedbackById[entry.id] = entry.feedback;
  }
  return feedbackById;
}

export function optionalStringField(
  key: "legend" | "label" | "placeholder",
  value: string | undefined,
): Partial<AssessmentTargetSettings> {
  return value === undefined ? {} : ({ [key]: value } as Partial<AssessmentTargetSettings>);
}

export function optionalNullableNumberField(
  key: "maxSelections",
  value: number | null | undefined,
): Partial<AssessmentTargetSettings> {
  return value === undefined ? {} : ({ [key]: value } as Partial<AssessmentTargetSettings>);
}

export function stableShuffleDifferent<T>(items: readonly T[], seed: string): T[] {
  if (items.length <= 1) return items.slice();

  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }

  const nextRandom = () => {
    h = Math.imul(h, 1664525) + 1013904223;
    h >>>= 0;
    return h / 0x100000000;
  };

  const shuffled = items.slice();
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(nextRandom() * (i + 1));
    const tmp = shuffled[i] as T;
    shuffled[i] = shuffled[j] as T;
    shuffled[j] = tmp;
  }

  if (shuffled.every((item, index) => item === items[index])) {
    const first = shuffled.shift();
    if (first !== undefined) shuffled.push(first);
  }

  return shuffled;
}

export function omitAttrs(
  node: JSONContent,
  keys: readonly string[],
): Record<string, unknown> | undefined {
  const attrs = readAttrs(node);
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (!keys.includes(key)) next[key] = cloneJson(value);
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

export function cloneAttrs(node: JSONContent): Record<string, unknown> | undefined {
  const attrs = readAttrs(node);
  if (Object.keys(attrs).length === 0) return undefined;
  return cloneJson(attrs) as Record<string, unknown>;
}

export function cloneJsonNodeWithoutContent(node: JSONContent): JSONContent {
  const out: JSONContent = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "content") continue;
    out[key as keyof JSONContent] = cloneJson(value) as never;
  }
  return out;
}

export function cloneJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneJson);
  if (!isRecord(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, childValue] of Object.entries(value)) {
    out[key] = cloneJson(childValue);
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
