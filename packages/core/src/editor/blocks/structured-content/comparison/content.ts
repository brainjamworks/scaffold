import type { JSONContent } from "@tiptap/core";
import { ComparisonDataSchema, type ComparisonData } from "@scaffold/contracts";

import { createStableId } from "@/document/model/identity/stable-ids";

export const COMPARISON_BLOCK_ID = "comparison";
export const COMPARISON_NODE = "comparison";
export const COMPARISON_ROW_NODE = "comparison_row";
export const COMPARISON_CELL_NODE = "comparison_cell";

export function emptyComparisonData(overrides: Partial<ComparisonData> = {}): ComparisonData {
  return ComparisonDataSchema.parse(overrides);
}

export function createComparisonContent(options?: Partial<ComparisonData>): JSONContent {
  return {
    type: COMPARISON_NODE,
    attrs: {
      id: createStableId(),
      data: emptyComparisonData(options),
    },
    content: [createComparisonRow(0), createComparisonRow(1)],
  };
}

export function createComparisonRow(index: number): JSONContent {
  return {
    type: COMPARISON_ROW_NODE,
    attrs: { id: createStableId() },
    content: [createComparisonCell("left", index), createComparisonCell("right", index)],
  };
}

function createComparisonCell(side: "left" | "right", _rowIndex: number): JSONContent {
  return {
    type: COMPARISON_CELL_NODE,
    attrs: { side },
    content: [{ type: "paragraph" }],
  };
}
