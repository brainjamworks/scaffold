import type { JSONContent } from "@tiptap/core";

import { createStableId } from "@/document/model/identity/stable-ids";

export function createTabsContent(options: Record<string, unknown> | undefined): JSONContent {
  const variant = parseTabsVariant(options?.["variant"]);
  const label = parseString(options?.["label"]) ?? "Tabs";
  const tabCount = readPositiveInteger(options?.["tabs"] ?? options?.["sections"], 3);
  const labels = labelsFromOptions(options, tabCount, "Tab");

  return {
    type: "layout",
    attrs: {
      id: createStableId(),
      variant: "tabs",
      options: { variant, label },
    },
    content: Array.from({ length: tabCount }, (_, index) => createTabSection(index, labels[index])),
  };
}

export function createTabSection(index: number, label: string | undefined): JSONContent {
  const resolvedLabel = label ?? `Tab ${index + 1}`;

  return {
    type: "section",
    attrs: {
      id: createStableId(),
      role: "tab-panel",
      label: resolvedLabel,
      options: { label: resolvedLabel },
    },
    content: [{ type: "paragraph" }],
  };
}

function parseTabsVariant(value: unknown): "default" | "pills" | "underline" {
  return value === "pills" || value === "underline" ? value : "default";
}

function parseString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readPositiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function labelsFromOptions(
  options: Record<string, unknown> | undefined,
  count: number,
  prefix: string,
): string[] {
  const labels = options?.["labels"];
  if (
    Array.isArray(labels) &&
    labels.every((label): label is string => typeof label === "string") &&
    labels.length > 0
  ) {
    return labels;
  }

  return Array.from({ length: count }, (_, index) => `${prefix} ${index + 1}`);
}
