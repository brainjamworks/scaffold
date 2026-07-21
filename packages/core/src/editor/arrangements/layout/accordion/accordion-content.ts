import type { JSONContent } from "@tiptap/core";

import { createStableId } from "@/document/model/identity/stable-ids";

export function createAccordionContent(options: Record<string, unknown> | undefined): JSONContent {
  const variant = parseAccordionVariant(options?.["variant"]);
  const allowMultiple = options?.["allowMultiple"] === true;
  const label = parseString(options?.["label"]) ?? "Accordion";
  const sectionCount = readPositiveInteger(options?.["sections"], 3);
  const labels = labelsFromOptions(options, sectionCount, "Section");

  return {
    type: "layout",
    attrs: {
      id: createStableId(),
      variant: "accordion",
      options: { variant, allowMultiple, label },
    },
    content: Array.from({ length: sectionCount }, (_, index) =>
      createAccordionSection(index, labels[index], index === 0),
    ),
  };
}

export function createAccordionSection(
  index: number,
  label: string | undefined,
  defaultOpen = false,
): JSONContent {
  const resolvedLabel = label ?? `Section ${index + 1}`;

  return {
    type: "section",
    attrs: {
      id: createStableId(),
      role: "accordion-panel",
      options: { defaultOpen },
    },
    content: [createAccordionSectionTitle(resolvedLabel), createAccordionSectionPanel()],
  };
}

function createAccordionSectionTitle(label: string): JSONContent {
  return {
    type: "accordion_section_title",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: label }],
      },
    ],
  };
}

function createAccordionSectionPanel(): JSONContent {
  return {
    type: "accordion_section_panel",
    content: [{ type: "paragraph" }],
  };
}

function parseAccordionVariant(value: unknown): "default" | "borderless" {
  return value === "borderless" ? value : "default";
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
