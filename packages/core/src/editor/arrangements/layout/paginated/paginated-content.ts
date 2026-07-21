import type { JSONContent } from "@tiptap/core";

import { createStableId } from "@/document/model/identity/stable-ids";

export function createPaginatedContent(options: Record<string, unknown> | undefined): JSONContent {
  const pageCount = readPositiveInteger(options?.["pages"] ?? options?.["sections"], 2);

  return {
    type: "layout",
    attrs: {
      id: createStableId(),
      variant: "paginated",
    },
    content: Array.from({ length: pageCount }, (_, index) => createPaginatedPage(index)),
  };
}

export function createPaginatedPage(index: number): JSONContent {
  return {
    type: "section",
    attrs: {
      id: createStableId(),
      role: "page",
      label: `Page ${index + 1}`,
    },
    content: [{ type: "paragraph" }],
  };
}

function readPositiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}
