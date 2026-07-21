import type { Schema, Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Fragment } from "@tiptap/pm/model";

import { createEditableRegionFragment } from "@/document/model/content-model/editable-region";
import { isFieldContentEmpty } from "@/document/model/content-model/is-field-content-empty";
import { createStableId } from "@/document/model/identity/stable-ids";
import {
  VerticalContentPositionSchema,
  type VerticalContentPosition,
} from "@/schemas/course-document";

export type GridTemplateOptions = {
  columns?: number;
  columnWidths?: readonly number[];
};

export type GridCellSide = "left" | "right";
export type GridCellVerticalPosition = VerticalContentPosition;

export const MIN_GRID_COLUMNS = 1;
export const MIN_AUTHORED_GRID_COLUMNS = 2;
export const MAX_GRID_COLUMNS = 6;
export const MIN_GRID_COLUMN_WIDTH = 0.2;

export function isGridCellVerticalPosition(value: unknown): value is GridCellVerticalPosition {
  return VerticalContentPositionSchema.safeParse(value).success;
}

export function isValidGridColumnCount(count: unknown): count is number {
  return (
    typeof count === "number" &&
    Number.isInteger(count) &&
    count >= MIN_GRID_COLUMNS &&
    count <= MAX_GRID_COLUMNS
  );
}

function requestedColumnCount(options: GridTemplateOptions): number | null {
  const count = options.columns ?? (options.columnWidths?.length ? options.columnWidths.length : 2);
  return isValidGridColumnCount(count) ? count : null;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function roundColumnWidth(value: number): number {
  return Number(value.toFixed(6));
}

export function normalizeColumnWidths(
  widths: readonly unknown[] | null | undefined,
  cellCount: number,
): number[] {
  const count = Math.max(1, cellCount);
  if (widths?.length === count && widths.every(isPositiveFiniteNumber)) {
    return [...widths];
  }

  return Array.from({ length: count }, () => 1);
}

export function equalColumnWidths(cellCount: number): number[] | null {
  if (!isValidGridColumnCount(cellCount)) return null;
  return Array.from({ length: cellCount }, () => 1);
}

export function insertColumnWidth(
  widths: readonly unknown[] | null | undefined,
  insertIndex: number,
  currentCellCount: number,
): number[] | null {
  if (!isValidGridColumnCount(currentCellCount)) return null;
  const currentWidths = normalizeColumnWidths(widths, currentCellCount);
  if (currentWidths.length !== currentCellCount) return null;
  if (!Number.isInteger(insertIndex) || insertIndex < 0) return null;
  if (insertIndex > currentCellCount) return null;

  return equalColumnWidths(currentCellCount + 1);
}

export function removeColumnWidth(
  widths: readonly unknown[] | null | undefined,
  removeIndex: number,
  currentCellCount: number,
): number[] | null {
  if (!isValidGridColumnCount(currentCellCount)) return null;
  const currentWidths = normalizeColumnWidths(widths, currentCellCount);
  if (currentWidths.length !== currentCellCount) return null;
  if (!Number.isInteger(removeIndex) || removeIndex < 0) return null;
  if (removeIndex >= currentCellCount || currentCellCount <= MIN_GRID_COLUMNS) {
    return null;
  }

  return equalColumnWidths(currentCellCount - 1);
}

export function resizeAdjacentColumnWidths(
  widths: readonly unknown[] | null | undefined,
  leftColumnIndex: number,
  delta: number,
  minColumnWidth = MIN_GRID_COLUMN_WIDTH,
): number[] | null {
  if (!Array.isArray(widths)) return null;
  if (!widths.every(isPositiveFiniteNumber)) return null;
  if (!Number.isInteger(leftColumnIndex) || leftColumnIndex < 0) return null;
  if (leftColumnIndex >= widths.length - 1) return null;
  if (!Number.isFinite(delta)) return null;
  if (!isPositiveFiniteNumber(minColumnWidth)) return null;

  const left = widths[leftColumnIndex]!;
  const right = widths[leftColumnIndex + 1]!;
  const pairWidth = left + right;
  if (pairWidth < minColumnWidth * 2) return null;

  const next = [...widths];
  const nextLeft = Math.min(pairWidth - minColumnWidth, Math.max(minColumnWidth, left + delta));

  next[leftColumnIndex] = roundColumnWidth(nextLeft);
  next[leftColumnIndex + 1] = roundColumnWidth(pairWidth - nextLeft);
  return next;
}

export function createGridTemplate(
  schema: Schema,
  options: GridTemplateOptions = {},
): ProseMirrorNode | null {
  const gridType = schema.nodes.grid;
  const cellCount = requestedColumnCount(options);
  if (!gridType) return null;
  if (cellCount === null) return null;

  const cells: ProseMirrorNode[] = [];
  for (let index = 0; index < cellCount; index += 1) {
    const cell = createGridCell(schema);
    if (!cell) return null;
    cells.push(cell);
  }

  return gridType.createChecked(
    {
      id: createStableId(),
      columnWidths: normalizeColumnWidths(options.columnWidths, cellCount),
    },
    Fragment.fromArray(cells),
  );
}

export function createGridCell(
  schema: Schema,
  content: Fragment | ProseMirrorNode | null = null,
): ProseMirrorNode | null {
  const cellType = schema.nodes.cell;
  if (!cellType) return null;

  const fragment =
    content === null ? createEditableCellFragment(schema) : contentToFragment(content);
  if (!cellType.validContent(fragment)) return null;

  return cellType.createChecked({ id: createStableId() }, fragment);
}

export function isGridCellEmpty(cell: ProseMirrorNode): boolean {
  return cell.type.name === "cell" && isFieldContentEmpty(cell);
}

export function isGridEmpty(grid: ProseMirrorNode): boolean {
  return grid.type.name === "grid" && everyChild(grid, isGridCellEmpty);
}

export function cellPositionAt(
  grid: ProseMirrorNode,
  gridPos: number,
  cellIndex: number,
): number | null {
  if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex > grid.childCount) {
    return null;
  }

  let pos = gridPos + 1;
  for (let index = 0; index < cellIndex; index += 1) {
    pos += grid.child(index).nodeSize;
  }

  return pos;
}

function contentToFragment(content: Fragment | ProseMirrorNode | null): Fragment {
  if (!content) return Fragment.empty;
  return content instanceof Fragment ? content : Fragment.from(content);
}

function createEditableCellFragment(schema: Schema): Fragment {
  return createEditableRegionFragment(schema);
}

function everyChild(
  node: ProseMirrorNode,
  predicate: (child: ProseMirrorNode) => boolean,
): boolean {
  for (let index = 0; index < node.childCount; index += 1) {
    if (!predicate(node.child(index))) return false;
  }

  return true;
}
