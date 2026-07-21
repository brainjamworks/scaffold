import type { Editor } from "@tiptap/core";
import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";

import { createStableId } from "@/document/model/identity/stable-ids";
import { isValidDocPos } from "@/editor/prosemirror/position/document-position";

import { insertGridCellInTransaction } from "./grid-commands";
import { createGridCell, equalColumnWidths } from "./grid-model";

export type GridSideDrop = {
  side: "left" | "right";
  targetPos: number;
};

export type GridBesideDropInput = GridSideDrop & {
  editor: Editor;
  sourceNode: ProseMirrorNode;
  sourcePos: number;
  targetNode: ProseMirrorNode;
};

type AncestorInfo = {
  index: number;
  node: ProseMirrorNode;
  parent: ProseMirrorNode;
  pos: number;
};

const GRID_MOVEMENT_REJECTED_SOURCE_TYPES = new Set(["grid", "cell", "section"]);

export function canUseGridMovementSource(node: ProseMirrorNode | null | undefined): boolean {
  return Boolean(node && !GRID_MOVEMENT_REJECTED_SOURCE_TYPES.has(node.type.name));
}

export function canCreateSiblingGridDrop(
  sourceNode: ProseMirrorNode | null | undefined,
  targetNode: ProseMirrorNode | null | undefined,
): boolean {
  return Boolean(sourceNode?.type.isInGroup("block") && targetNode?.type.isInGroup("block"));
}

export function buildGridBesideDropTransaction({
  editor,
  side,
  sourceNode,
  sourcePos,
  targetNode,
  targetPos,
}: GridBesideDropInput): Transaction | null {
  if (!canUseGridMovementSource(sourceNode)) return null;

  return (
    buildExistingGridCellTransaction(editor, sourcePos, sourceNode, {
      side,
      targetPos,
    }) ??
    buildSiblingGridTransaction(editor, sourcePos, sourceNode, targetNode, {
      side,
      targetPos,
    })
  );
}

function buildExistingGridCellTransaction(
  editor: Editor,
  sourcePos: number,
  sourceNode: ProseMirrorNode,
  sideDrop: GridSideDrop,
): Transaction | null {
  const cellInfo = findAncestor(
    editor.state.doc,
    sideDrop.targetPos,
    (node) => node.type.name === "cell",
  );
  if (!cellInfo || cellInfo.parent.type.name !== "grid") return null;
  const gridInfo = findAncestor(
    editor.state.doc,
    sideDrop.targetPos,
    (node) => node.type.name === "grid",
  );
  if (!gridInfo) return null;

  const newCell = createGridCell(editor.schema, Fragment.from(sourceNode));
  if (!newCell) return null;

  const tr = editor.state.tr.delete(sourcePos, sourcePos + sourceNode.nodeSize);
  const mappedGridPos = tr.mapping.map(gridInfo.pos, -1);
  const insertIndex = cellInfo.index + (sideDrop.side === "left" ? 0 : 1);

  return insertGridCellInTransaction(tr, mappedGridPos, insertIndex, newCell);
}

function buildSiblingGridTransaction(
  editor: Editor,
  sourcePos: number,
  sourceNode: ProseMirrorNode,
  targetNode: ProseMirrorNode,
  sideDrop: GridSideDrop,
): Transaction | null {
  const gridType = editor.schema.nodes["grid"];
  if (!gridType) return null;
  if (!canCreateSiblingGridDrop(sourceNode, targetNode)) return null;
  if (!isValidDocPos(editor.state.doc, sourcePos)) return null;
  if (!isValidDocPos(editor.state.doc, sideDrop.targetPos)) return null;

  const sourceResolved = editor.state.doc.resolve(sourcePos);
  const targetResolved = editor.state.doc.resolve(sideDrop.targetPos);
  if (sourceResolved.parent !== targetResolved.parent) return null;

  const orderedNodes =
    sideDrop.side === "left" ? [sourceNode, targetNode] : [targetNode, sourceNode];
  const cells = orderedNodes.map((node) => createGridCell(editor.schema, Fragment.from(node)));
  const columnWidths = equalColumnWidths(orderedNodes.length);
  if (!cells.every((node): node is ProseMirrorNode => node !== null)) return null;
  if (!columnWidths) return null;

  const grid = gridType.createChecked(
    { id: createStableId(), columnWidths },
    Fragment.fromArray(cells),
  );

  const tr = editor.state.tr.delete(sourcePos, sourcePos + sourceNode.nodeSize);
  const mappedTargetPos = tr.mapping.map(sideDrop.targetPos, -1);
  if (!isValidDocPos(tr.doc, mappedTargetPos)) return null;
  const mappedTargetNode = tr.doc.nodeAt(mappedTargetPos);
  if (!mappedTargetNode || mappedTargetNode.type !== targetNode.type) return null;

  tr.replaceWith(mappedTargetPos, mappedTargetPos + mappedTargetNode.nodeSize, grid);
  return tr;
}

function findAncestor(
  doc: ProseMirrorNode,
  pos: number,
  predicate: (node: ProseMirrorNode) => boolean,
): AncestorInfo | null {
  if (!isValidDocPos(doc, pos)) return null;
  const directNode = doc.nodeAt(pos);
  const resolved = doc.resolve(pos);

  if (directNode && predicate(directNode)) {
    return {
      index: resolved.index(),
      node: directNode,
      parent: resolved.parent,
      pos,
    };
  }

  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    const node = resolved.node(depth);
    if (!predicate(node)) continue;

    return {
      index: resolved.index(depth - 1),
      node,
      parent: resolved.node(depth - 1),
      pos: resolved.before(depth),
    };
  }

  return null;
}
