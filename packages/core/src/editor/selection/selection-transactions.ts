import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, TextSelection, type Transaction } from "@tiptap/pm/state";

export function isNodeSelectable(node: ProseMirrorNode): boolean {
  return NodeSelection.isSelectable(node);
}

export function setNodeSelectionInTransaction(tr: Transaction, pos: number): boolean {
  try {
    tr.setSelection(NodeSelection.create(tr.doc, pos));
    return true;
  } catch {
    return false;
  }
}

export function setTextSelectionNearInTransaction(tr: Transaction, pos: number, bias = 1): boolean {
  try {
    tr.setSelection(TextSelection.near(tr.doc.resolve(pos), bias));
    return true;
  } catch {
    return false;
  }
}

/**
 * Deliberate object-shell activation: sets a ProseMirror NodeSelection.
 * Structural ownership changes must use the non-destructive helpers instead.
 */
export function setObjectSelectionInTransaction(tr: Transaction, pos: number): boolean {
  return setNodeSelectionInTransaction(tr, pos);
}

/**
 * Structural-owner fallback selection: moves PM selection to the nearest
 * valid text caret without ever object-selecting a structural container.
 */
export function setNonDestructiveSelectionNearInTransaction(
  tr: Transaction,
  pos: number,
  bias = 1,
): boolean {
  return setTextSelectionNearInTransaction(tr, pos, bias);
}

export interface SelectionDocumentRange {
  from: number;
  to: number;
}

/**
 * Structural-owner selection repair: place a nearby text caret, but only when
 * ProseMirror can keep that caret inside the activated structural target.
 */
export function setNonDestructiveSelectionNearWithinRangeInTransaction(
  tr: Transaction,
  pos: number,
  range: SelectionDocumentRange,
  bias = 1,
): boolean {
  if (!isUsableRange(range)) return false;

  const candidates = uniqueDocumentPositions([
    pos,
    clampDocumentPos(pos, range),
    range.from + 1,
    range.to - 1,
  ]);
  const biases = bias === 1 ? ([1, -1] as const) : ([-1, 1] as const);

  for (const candidate of candidates) {
    for (const candidateBias of biases) {
      const previousSelection = tr.selection;
      if (
        setNonDestructiveSelectionNearInTransaction(tr, candidate, candidateBias) &&
        isTextSelectionInsideRange(tr.selection, range)
      ) {
        return true;
      }
      tr.setSelection(previousSelection);
    }
  }

  return false;
}

export interface ClearObjectSelectionOptions {
  bias?: number;
}

export function clearObjectSelectionToNonDestructiveSelectionInTransaction(
  tr: Transaction,
  options: ClearObjectSelectionOptions = {},
): boolean {
  if (!(tr.selection instanceof NodeSelection)) return false;

  const pos = Math.min(tr.selection.to, tr.doc.content.size);
  return setNonDestructiveSelectionNearInTransaction(tr, pos, options.bias ?? 1);
}

function isUsableRange(range: SelectionDocumentRange): boolean {
  return Number.isInteger(range.from) && Number.isInteger(range.to) && range.to > range.from + 1;
}

function isTextSelectionInsideRange(
  selection: Transaction["selection"],
  range: SelectionDocumentRange,
): boolean {
  return (
    selection instanceof TextSelection &&
    selection.empty &&
    selection.from > range.from &&
    selection.to < range.to
  );
}

function clampDocumentPos(pos: number, range: SelectionDocumentRange): number {
  return Math.max(range.from + 1, Math.min(pos, range.to - 1));
}

function uniqueDocumentPositions(positions: number[]): number[] {
  return [...new Set(positions.filter(Number.isFinite))];
}
