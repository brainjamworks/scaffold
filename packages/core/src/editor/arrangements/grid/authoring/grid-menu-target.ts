import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { isValidDocPos } from "@/editor/prosemirror/position/document-position";

import { cellPositionAt } from "../model/grid-model";

export function createGridMenuAnchorId(
  role: "grid-menu" | "grid-add-end" | "cell-menu",
  stableId: unknown,
): string | null {
  if (typeof stableId === "string" && stableId.length > 0) {
    return `${role}:${stableId}`;
  }
  return null;
}

export function gridCellPositionAt(
  doc: ProseMirrorNode,
  gridPos: number,
  cellIndex: number,
): number | null {
  if (!isValidDocPos(doc, gridPos)) return null;
  const grid = doc.nodeAt(gridPos);
  if (!grid || grid.type.name !== "grid") return null;
  if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex >= grid.childCount) {
    return null;
  }

  return cellPositionAt(grid, gridPos, cellIndex);
}
