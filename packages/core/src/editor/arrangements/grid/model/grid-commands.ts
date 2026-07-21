import type { Editor } from "@tiptap/core";
import type { Schema, Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import type { Transform } from "@tiptap/pm/transform";

import {
  insertNodeChecked,
  type CheckedMutationResult,
} from "@/document/model/commands/checked-transactions";
import { isValidDocPos } from "@/editor/prosemirror/position/document-position";

import {
  MIN_AUTHORED_GRID_COLUMNS,
  cellPositionAt,
  createGridCell,
  createGridTemplate,
  insertColumnWidth,
  isGridCellVerticalPosition,
  isValidGridColumnCount,
  normalizeColumnWidths,
  removeColumnWidth,
  resizeAdjacentColumnWidths,
  type GridCellSide,
  type GridCellVerticalPosition,
  type GridTemplateOptions,
} from "./grid-model";

export function insertGridAt(
  editor: Editor,
  pos: number,
  options: GridTemplateOptions = {},
): boolean {
  const result = insertGridChecked({
    tr: editor.state.tr,
    schema: editor.schema,
    pos,
    options,
  });
  if (!result.ok) return false;

  return dispatchChecked(editor, result.tr);
}

export function insertGridChecked<TTransform extends Transform>({
  tr,
  schema,
  pos,
  options = {},
}: {
  tr: TTransform;
  schema: Schema;
  pos: number;
  options?: GridTemplateOptions;
}): CheckedMutationResult<TTransform> {
  const grid = createGridTemplate(schema, options);
  if (!grid) {
    return {
      ok: false,
      issue: {
        code: "invalid_grid_template",
        message: "Grid options did not produce a valid grid node.",
      },
    };
  }

  return insertNodeChecked({ tr, pos, node: grid });
}

export function addGridCellAt(
  editor: Editor,
  gridPos: number,
  cellIndex: number,
  side: GridCellSide,
): boolean {
  if (!isValidDocPos(editor.state.doc, gridPos)) return false;
  const grid = editor.state.doc.nodeAt(gridPos);
  if (!grid || grid.type.name !== "grid") return false;
  if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex >= grid.childCount) {
    return false;
  }

  const cell = createGridCell(editor.schema);
  if (!cell) return false;

  const insertIndex = side === "left" ? cellIndex : cellIndex + 1;
  const tr = insertGridCellInTransaction(editor.state.tr, gridPos, insertIndex, cell);
  if (!tr) return false;

  return dispatchChecked(editor, tr);
}

export function addGridCellAtEnd(editor: Editor, gridPos: number): boolean {
  if (!isValidDocPos(editor.state.doc, gridPos)) return false;
  const grid = editor.state.doc.nodeAt(gridPos);
  if (!grid || grid.type.name !== "grid" || grid.childCount === 0) return false;

  return addGridCellAt(editor, gridPos, grid.childCount - 1, "right");
}

/**
 * Deletes a grid as an explicit destructive arrangement edit.
 *
 * Authored content inside the grid is removed with the grid. Use this command
 * only from chrome that presents the action as destructive.
 */
export function deleteGridAt(editor: Editor, gridPos: number): boolean {
  if (!isValidDocPos(editor.state.doc, gridPos)) return false;
  const grid = editor.state.doc.nodeAt(gridPos);
  if (!grid || grid.type.name !== "grid") return false;

  try {
    const tr = editor.state.tr.delete(gridPos, gridPos + grid.nodeSize);
    tr.doc.check();
    return dispatchChecked(editor, tr);
  } catch {
    return false;
  }
}

/**
 * Deletes one grid cell as an explicit destructive arrangement edit.
 *
 * Authored content inside the deleted cell is removed. When deleting from the
 * minimum two-cell grid, the remaining cell is unwrapped into the parent.
 */
export function deleteGridCellAt(editor: Editor, gridPos: number, cellIndex: number): boolean {
  if (!isValidDocPos(editor.state.doc, gridPos)) return false;
  const grid = editor.state.doc.nodeAt(gridPos);
  if (!grid || grid.type.name !== "grid") return false;
  if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex >= grid.childCount) {
    return false;
  }

  const tr =
    grid.childCount === MIN_AUTHORED_GRID_COLUMNS
      ? removeGridCellAndUnwrapRemainingInTransaction(editor.state.tr, gridPos, cellIndex)
      : removeGridCellInTransaction(editor.state.tr, gridPos, cellIndex);
  if (!tr) return false;

  return dispatchChecked(editor, tr);
}

export function setGridCellVerticalPositionAt(
  editor: Editor,
  gridPos: number,
  cellIndex: number,
  verticalPosition: GridCellVerticalPosition,
): boolean {
  if (!isGridCellVerticalPosition(verticalPosition)) return false;
  const tr = setGridCellVerticalPositionInTransaction(
    editor.state.tr,
    gridPos,
    cellIndex,
    verticalPosition,
  );
  if (!tr) return false;

  return dispatchChecked(editor, tr);
}

export function setAllGridCellsVerticalPositionAt(
  editor: Editor,
  gridPos: number,
  verticalPosition: GridCellVerticalPosition,
): boolean {
  if (!isGridCellVerticalPosition(verticalPosition)) return false;
  if (!isValidDocPos(editor.state.doc, gridPos)) return false;

  const grid = editor.state.doc.nodeAt(gridPos);
  if (!grid || grid.type.name !== "grid") return false;

  let tr: Transaction | null = editor.state.tr;
  for (let index = 0; index < grid.childCount; index += 1) {
    tr = setGridCellVerticalPositionInTransaction(
      tr,
      tr.mapping.map(gridPos, -1),
      index,
      verticalPosition,
    );
    if (!tr) return false;
  }

  return dispatchChecked(editor, tr);
}

export function setGridCellCountAt(editor: Editor, gridPos: number, cellCount: number): boolean {
  if (!isValidDocPos(editor.state.doc, gridPos)) return false;
  const grid = editor.state.doc.nodeAt(gridPos);
  if (!grid || grid.type.name !== "grid") return false;
  if (!isValidGridColumnCount(cellCount)) return false;
  if (cellCount < MIN_AUTHORED_GRID_COLUMNS) return false;
  if (cellCount === grid.childCount) return false;

  let tr: Transaction | null = editor.state.tr;
  if (cellCount > grid.childCount) {
    for (let count = grid.childCount; count < cellCount; count += 1) {
      const cell = createGridCell(editor.schema);
      if (!cell) return false;
      tr = insertGridCellInTransaction(tr, tr.mapping.map(gridPos, -1), count, cell);
      if (!tr) return false;
    }
    return dispatchChecked(editor, tr);
  }

  // Reducing the authored cell count intentionally drops trailing cells and
  // their authored content. This is a structural grid edit, not content rescue.
  for (let count = grid.childCount; count > cellCount; count -= 1) {
    tr = removeGridCellInTransaction(tr, tr.mapping.map(gridPos, -1), count - 1);
    if (!tr) return false;
  }

  return dispatchChecked(editor, tr);
}

export function resizeGridColumnsAt(
  editor: Editor,
  gridPos: number,
  leftColumnIndex: number,
  delta: number,
): boolean {
  const tr = resizeGridColumnsInTransaction(editor.state.tr, gridPos, leftColumnIndex, delta);
  if (!tr) return false;

  return dispatchChecked(editor, tr);
}

export function insertGridCellInTransaction(
  tr: Transaction,
  gridPos: number,
  insertIndex: number,
  cell: ProseMirrorNode,
): Transaction | null {
  if (!isValidDocPos(tr.doc, gridPos)) return null;
  const grid = tr.doc.nodeAt(gridPos);
  if (!grid || grid.type.name !== "grid") return null;
  if (cell.type.name !== "cell") return null;

  const columnWidths = insertColumnWidth(grid.attrs["columnWidths"], insertIndex, grid.childCount);
  if (!columnWidths) return null;

  const insertPos = cellPositionAt(grid, gridPos, insertIndex);
  if (insertPos === null) return null;

  try {
    tr.insert(insertPos, cell);
    const mappedGridPos = tr.mapping.map(gridPos, -1);
    if (!isValidDocPos(tr.doc, mappedGridPos)) return null;
    const mappedGrid = tr.doc.nodeAt(mappedGridPos);
    if (!mappedGrid || mappedGrid.type.name !== "grid") return null;

    tr.setNodeMarkup(mappedGridPos, undefined, {
      ...mappedGrid.attrs,
      columnWidths,
    });
    tr.doc.check();
    return tr;
  } catch {
    return null;
  }
}

export function removeGridCellInTransaction(
  tr: Transaction,
  gridPos: number,
  cellIndex: number,
): Transaction | null {
  if (!isValidDocPos(tr.doc, gridPos)) return null;
  const grid = tr.doc.nodeAt(gridPos);
  if (!grid || grid.type.name !== "grid") return null;

  const columnWidths = removeColumnWidth(grid.attrs["columnWidths"], cellIndex, grid.childCount);
  if (!columnWidths) return null;

  const deletePos = cellPositionAt(grid, gridPos, cellIndex);
  const cell = deletePos === null ? null : grid.child(cellIndex);
  if (deletePos === null || !cell) return null;

  try {
    tr.delete(deletePos, deletePos + cell.nodeSize);
    const mappedGridPos = tr.mapping.map(gridPos, -1);
    if (!isValidDocPos(tr.doc, mappedGridPos)) return null;
    const mappedGrid = tr.doc.nodeAt(mappedGridPos);
    if (!mappedGrid || mappedGrid.type.name !== "grid") return null;

    tr.setNodeMarkup(mappedGridPos, undefined, {
      ...mappedGrid.attrs,
      columnWidths,
    });
    tr.doc.check();
    return tr;
  } catch {
    return null;
  }
}

export function removeGridCellAndUnwrapRemainingInTransaction(
  tr: Transaction,
  gridPos: number,
  cellIndex: number,
): Transaction | null {
  if (!isValidDocPos(tr.doc, gridPos)) return null;
  const grid = tr.doc.nodeAt(gridPos);
  if (!grid || grid.type.name !== "grid") return null;
  if (grid.childCount !== 2) return null;
  if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex >= grid.childCount) {
    return null;
  }

  const remainingCell = grid.child(cellIndex === 0 ? 1 : 0);
  try {
    tr.replaceWith(gridPos, gridPos + grid.nodeSize, remainingCell.content);
    tr.doc.check();
    return tr;
  } catch {
    return null;
  }
}

export function setGridCellVerticalPositionInTransaction(
  tr: Transaction,
  gridPos: number,
  cellIndex: number,
  verticalPosition: GridCellVerticalPosition,
): Transaction | null {
  if (!isValidDocPos(tr.doc, gridPos)) return null;
  const grid = tr.doc.nodeAt(gridPos);
  if (!grid || grid.type.name !== "grid") return null;
  if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex >= grid.childCount) {
    return null;
  }
  if (!isGridCellVerticalPosition(verticalPosition)) return null;

  const cellPos = cellPositionAt(grid, gridPos, cellIndex);
  const cell = cellPos === null ? null : grid.child(cellIndex);
  if (cellPos === null || !cell || cell.type.name !== "cell") return null;

  try {
    tr.setNodeMarkup(cellPos, undefined, {
      ...cell.attrs,
      verticalPosition,
    });
    tr.doc.check();
    return tr;
  } catch {
    return null;
  }
}

export function resizeGridColumnsInTransaction(
  tr: Transaction,
  gridPos: number,
  leftColumnIndex: number,
  delta: number,
): Transaction | null {
  if (!isValidDocPos(tr.doc, gridPos)) return null;
  const grid = tr.doc.nodeAt(gridPos);
  if (!grid || grid.type.name !== "grid") return null;

  const normalizedWidths = normalizeColumnWidths(grid.attrs["columnWidths"], grid.childCount);
  const columnWidths = resizeAdjacentColumnWidths(normalizedWidths, leftColumnIndex, delta);
  if (!columnWidths) return null;

  try {
    tr.setNodeMarkup(gridPos, undefined, {
      ...grid.attrs,
      columnWidths,
    });
    tr.doc.check();
    return tr;
  } catch {
    return null;
  }
}

function dispatchChecked(editor: Editor, tr: Transaction): boolean {
  if (tr.doc.eq(editor.state.doc)) return false;

  try {
    tr.doc.check();
    editor.view.dispatch(tr.scrollIntoView());
    return true;
  } catch {
    return false;
  }
}
