import type { Editor } from "@tiptap/core";
import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";

import { createEditableTextblock } from "@/document/model/content-model/editable-region";
import { buildGridBesideDropTransaction } from "@/editor/arrangements/grid/model/grid-drop-rules";
import { validateBoundedContainerStructure } from "@/editor/bounded-containers/model/bounded-container-structure-policy";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import {
  canMoveSiblingNodeTo,
  moveSiblingNodeTo,
} from "@/editor/prosemirror/move-sibling/move-sibling-node";
import {
  isNodeSelectable,
  setNodeSelectionInTransaction,
} from "@/editor/selection/selection-transactions";
import {
  canInsertSurfaceStructureChild,
  canMoveSurfaceStructureNode,
} from "@/editor/surfaces/model/policies/surface-movement-policy";
import { allowsSurfaceRootInsertion } from "@/editor/surfaces/model/policies/surface-root-insertion-policy";
import { validateCourseSurfacesStructure } from "@/editor/surfaces/model/policies/surface-structure-policy";
import type { SurfaceVariantLookup } from "@/editor/surfaces/model/surface-variant-registry";

import {
  AddCellAfterTarget,
  AddCellAtGridStart,
  AddCellBeforeTarget,
  CreateGridAfterBlock,
  CreateGridBeforeBlock,
  InsertAfterTarget,
  InsertBeforeTarget,
  InsertInsideTarget,
  MoveContainedAfterTarget,
  MoveContainedBeforeTarget,
  isSideMovementIntent,
  type AnyMovementIntent,
  type SideMovementIntent,
} from "../model/movement-intents";
import {
  canApplyStructureMovementBoundary,
  canTargetContainedMovement,
  canStartStructureMovement,
  canTargetStructureMovement,
  createStructureMovementPolicy,
  resolveMovementNodeContext,
  resolveContainedMovementSourceContext,
  type MovementNodeContext,
} from "../model/movement-policy";
import {
  ContainedMovementTarget,
  createMovementTarget,
  type MovementTargetRect,
} from "../model/movement-target";

type DirectMoveIntent = InsertBeforeTarget | InsertAfterTarget | InsertInsideTarget;
type ContainedMoveIntent = MoveContainedBeforeTarget | MoveContainedAfterTarget;

type GridSide = "left" | "right";
export type KeyboardMovementDirection = "backward" | "forward";

export interface KeyboardMovementResult {
  moved: boolean;
  status: string;
}

const KEYBOARD_MOVEMENT_TARGET_RECT: MovementTargetRect = {
  bottom: 0,
  height: 0,
  left: 0,
  right: 0,
  top: 0,
  width: 0,
};

export function canApplyMovementIntent(
  editor: Editor,
  sourcePos: number,
  intent: AnyMovementIntent,
  blockDefinitions: BlockDefinitionLookup,
  surfaceVariants: SurfaceVariantLookup,
): boolean {
  return (
    buildMovementTransaction(editor, sourcePos, intent, blockDefinitions, surfaceVariants) !== null
  );
}

export function applyMovementIntent(
  editor: Editor,
  sourcePos: number,
  intent: AnyMovementIntent,
  blockDefinitions: BlockDefinitionLookup,
  surfaceVariants: SurfaceVariantLookup,
): boolean {
  const tr = buildMovementTransaction(editor, sourcePos, intent, blockDefinitions, surfaceVariants);
  if (!tr) return false;

  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

export function canApplyContainedMovementIntent(
  editor: Editor,
  sourcePos: number,
  intent: ContainedMoveIntent,
): boolean {
  return canMoveSiblingNodeTo(editor, sourcePos, intent.target.pos, containedPlacement(intent));
}

export function applyContainedMovementIntent(
  editor: Editor,
  sourcePos: number,
  intent: ContainedMoveIntent,
): boolean {
  return moveSiblingNodeTo(editor, sourcePos, intent.target.pos, containedPlacement(intent));
}

export function applyKeyboardMovementIntent(
  editor: Editor,
  sourcePos: number,
  direction: KeyboardMovementDirection,
  blockDefinitions: BlockDefinitionLookup,
  surfaceVariants: SurfaceVariantLookup,
): KeyboardMovementResult {
  const sourceContext = resolveMovementNodeContext(editor.state.doc, sourcePos);
  const kind = movementSourceKind(sourceContext);
  const movementPolicy = createStructureMovementPolicy(editor.schema, blockDefinitions);

  if (
    !sourceContext ||
    !sourceContext.parent ||
    !canStartStructureMovement(movementPolicy, sourceContext)
  ) {
    return {
      moved: false,
      status: `${capitalize(kind)} cannot be moved.`,
    };
  }

  const targetContext = resolveKeyboardSiblingTarget(editor.state.doc, sourceContext, direction);
  if (!targetContext) {
    return {
      moved: false,
      status:
        direction === "backward"
          ? `${capitalize(kind)} is already first.`
          : `${capitalize(kind)} is already last.`,
    };
  }
  if (!canTargetStructureMovement(movementPolicy, targetContext)) {
    return {
      moved: false,
      status: `${capitalize(kind)} cannot be moved ${direction === "backward" ? "up" : "down"}.`,
    };
  }

  const target = createMovementTarget(targetContext, KEYBOARD_MOVEMENT_TARGET_RECT);
  const intent =
    direction === "backward" ? new InsertBeforeTarget(target) : new InsertAfterTarget(target);
  const sourceNode = editor.state.doc.nodeAt(sourcePos);
  const tr = buildMovementTransaction(editor, sourcePos, intent, blockDefinitions, surfaceVariants);
  if (!tr || !sourceNode) {
    return {
      moved: false,
      status: `${capitalize(kind)} cannot be moved ${direction === "backward" ? "up" : "down"}.`,
    };
  }

  const movedPos = findMovedSourcePos(tr.doc, sourceNode);
  if (movedPos !== null) {
    const movedNode = tr.doc.nodeAt(movedPos);
    if (movedNode && isNodeSelectable(movedNode)) {
      setNodeSelectionInTransaction(tr, movedPos);
    }
  }
  editor.view.dispatch(tr.scrollIntoView());

  return {
    moved: true,
    status: `Moved ${kind} ${direction === "backward" ? "up" : "down"}.`,
  };
}

export function applyKeyboardContainedMovementIntent(
  editor: Editor,
  sourcePos: number,
  direction: KeyboardMovementDirection,
): KeyboardMovementResult {
  const sourceContext = resolveContainedMovementSourceContext(editor.state.doc, sourcePos);
  const kind = containedMovementSourceKind(sourceContext);

  if (!sourceContext || !sourceContext.parent) {
    return {
      moved: false,
      status: `${capitalize(kind)} cannot be moved.`,
    };
  }

  const targetContext = resolveKeyboardSiblingTarget(editor.state.doc, sourceContext, direction);
  if (!targetContext) {
    return {
      moved: false,
      status:
        direction === "backward"
          ? `${capitalize(kind)} is already first.`
          : `${capitalize(kind)} is already last.`,
    };
  }
  if (!canTargetContainedMovement(sourceContext, targetContext)) {
    return {
      moved: false,
      status: `${capitalize(kind)} cannot be moved ${direction === "backward" ? "up" : "down"}.`,
    };
  }

  const intent =
    direction === "backward"
      ? new MoveContainedBeforeTarget(
          new ContainedMovementTarget(targetContext, KEYBOARD_MOVEMENT_TARGET_RECT),
        )
      : new MoveContainedAfterTarget(
          new ContainedMovementTarget(targetContext, KEYBOARD_MOVEMENT_TARGET_RECT),
        );

  const moved = applyContainedMovementIntent(editor, sourcePos, intent);
  return {
    moved,
    status: moved
      ? `Moved ${kind} ${direction === "backward" ? "up" : "down"}.`
      : `${capitalize(kind)} cannot be moved ${direction === "backward" ? "up" : "down"}.`,
  };
}

function buildMovementTransaction(
  editor: Editor,
  sourcePos: number,
  intent: AnyMovementIntent,
  blockDefinitions: BlockDefinitionLookup,
  surfaceVariants: SurfaceVariantLookup,
): Transaction | null {
  const { doc } = editor.state;
  const sourceNode = doc.nodeAt(sourcePos);
  const targetNode = intent.target.node;
  const targetPos = intent.target.pos;
  const movementPolicy = createStructureMovementPolicy(editor.schema, blockDefinitions);
  const sourceContext = resolveMovementNodeContext(doc, sourcePos);

  if (!sourceNode || !targetNode) return null;
  if (sourcePos === targetPos) return null;
  if (!canStartStructureMovement(movementPolicy, sourceContext)) return null;
  if (!canMoveSurfaceStructureNode(doc, sourcePos, surfaceVariants)) return null;
  if (containsPosition(sourcePos, sourceNode, targetPos)) return null;
  if (!canApplyStructureMovementBoundary(doc, sourcePos, targetPos)) return null;

  try {
    const tr = isDirectMoveIntent(intent)
      ? buildDirectMoveTransaction(
          editor,
          sourcePos,
          sourceNode,
          targetNode,
          intent,
          surfaceVariants,
        )
      : isSideMovementIntent(intent)
        ? buildGridSideMovementTransaction(editor, sourcePos, sourceNode, intent)
        : null;

    if (!tr || tr.doc.eq(editor.state.doc)) return null;

    tr.doc.check();
    if (!validateCourseSurfacesStructure(tr.doc, surfaceVariants).ok) return null;
    if (!validateBoundedContainerStructure(tr.doc, blockDefinitions).ok) return null;
    return tr;
  } catch {
    return null;
  }
}

function buildDirectMoveTransaction(
  editor: Editor,
  sourcePos: number,
  sourceNode: ProseMirrorNode,
  targetNode: ProseMirrorNode,
  intent: DirectMoveIntent,
  surfaceVariants: SurfaceVariantLookup,
): Transaction | null {
  if (!canInsertForMove(editor, sourceNode, targetNode, intent, surfaceVariants)) {
    return null;
  }

  const insertPos =
    intent instanceof InsertBeforeTarget
      ? intent.target.pos
      : intent instanceof InsertAfterTarget
        ? intent.target.pos + targetNode.nodeSize
        : intent.target.pos + targetNode.nodeSize - 1;

  const targetPlaceholder =
    intent instanceof InsertInsideTarget
      ? emptyTargetPlaceholderForMove(intent.target.pos, targetNode, sourceNode)
      : null;
  if (targetPlaceholder) {
    return deleteAndReplace(
      editor.state.tr,
      sourcePos,
      sourceNode,
      targetPlaceholder.pos,
      targetPlaceholder.node,
      sourceNode,
    );
  }

  return deleteAndInsert(editor.state.tr, sourcePos, sourceNode, insertPos, sourceNode);
}

function canInsertForMove(
  editor: Editor,
  sourceNode: ProseMirrorNode,
  targetNode: ProseMirrorNode,
  intent: DirectMoveIntent,
  surfaceVariants: SurfaceVariantLookup,
): boolean {
  const fragment = Fragment.from(sourceNode);

  if (intent instanceof InsertInsideTarget) {
    if (!allowsSurfaceRootInsertion(targetNode, surfaceVariants)) return false;
    if (
      !canInsertSurfaceStructureChild({
        surface: targetNode,
        child: sourceNode,
        surfaceVariants,
      })
    ) {
      return false;
    }
    return targetNode.canReplace(targetNode.childCount, targetNode.childCount, fragment);
  }

  const targetResolved = editor.state.doc.resolve(intent.target.pos);
  const parent = targetResolved.parent;
  if (!allowsSurfaceRootInsertion(parent, surfaceVariants)) return false;

  if (
    !canInsertSurfaceStructureChild({
      surface: parent,
      child: sourceNode,
      surfaceVariants,
    })
  ) {
    return false;
  }

  const targetIndex = targetResolved.index();
  const insertIndex = intent instanceof InsertBeforeTarget ? targetIndex : targetIndex + 1;
  return targetResolved.parent.canReplace(insertIndex, insertIndex, fragment);
}

function buildGridSideMovementTransaction(
  editor: Editor,
  sourcePos: number,
  sourceNode: ProseMirrorNode,
  intent: SideMovementIntent,
): Transaction | null {
  const side = gridSideForIntent(intent);
  const sideTarget = gridSideTarget(editor, intent);
  if (!sideTarget) return null;

  return buildGridBesideDropTransaction({
    editor,
    side,
    sourceNode,
    sourcePos,
    targetNode: sideTarget.node,
    targetPos: sideTarget.pos,
  });
}

function gridSideForIntent(intent: SideMovementIntent): GridSide {
  if (
    intent instanceof CreateGridBeforeBlock ||
    intent instanceof AddCellBeforeTarget ||
    intent instanceof AddCellAtGridStart
  ) {
    return "left";
  }

  return "right";
}

function gridSideTarget(
  editor: Editor,
  intent: SideMovementIntent,
): { node: ProseMirrorNode; pos: number } | null {
  if (
    intent instanceof CreateGridBeforeBlock ||
    intent instanceof CreateGridAfterBlock ||
    intent instanceof AddCellBeforeTarget ||
    intent instanceof AddCellAfterTarget
  ) {
    return { node: intent.target.node, pos: intent.target.pos };
  }

  const cellPos =
    intent instanceof AddCellAtGridStart
      ? firstCellPos(intent.target.pos, intent.target.node)
      : lastCellPos(intent.target.pos, intent.target.node);
  if (cellPos === null) return null;

  const cellNode = editor.state.doc.nodeAt(cellPos);
  if (!cellNode || cellNode.type.name !== "cell") return null;

  return { node: cellNode, pos: cellPos };
}

function isDirectMoveIntent(intent: AnyMovementIntent): intent is DirectMoveIntent {
  return (
    intent instanceof InsertBeforeTarget ||
    intent instanceof InsertAfterTarget ||
    intent instanceof InsertInsideTarget
  );
}

function containedPlacement(intent: ContainedMoveIntent) {
  return intent instanceof MoveContainedBeforeTarget ? "before" : "after";
}

function firstCellPos(gridPos: number, gridNode: ProseMirrorNode): number | null {
  if (gridNode.type.name !== "grid" || gridNode.childCount === 0) return null;
  return gridPos + 1;
}

function lastCellPos(gridPos: number, gridNode: ProseMirrorNode): number | null {
  if (gridNode.type.name !== "grid" || gridNode.childCount === 0) return null;

  let pos = gridPos + 1;
  for (let index = 0; index < gridNode.childCount - 1; index += 1) {
    pos += gridNode.child(index).nodeSize;
  }
  return pos;
}

function deleteAndInsert(
  tr: Transaction,
  sourcePos: number,
  sourceNode: ProseMirrorNode,
  insertPos: number,
  insertedNode: ProseMirrorNode,
): Transaction {
  const replacement = emptySourceParentReplacement(tr.doc, sourcePos);
  if (replacement) {
    tr.replaceWith(sourcePos, sourcePos + sourceNode.nodeSize, replacement);
  } else {
    tr.delete(sourcePos, sourcePos + sourceNode.nodeSize);
  }
  tr.insert(tr.mapping.map(insertPos, insertPos <= sourcePos ? -1 : 1), insertedNode);
  return tr;
}

function deleteAndReplace(
  tr: Transaction,
  sourcePos: number,
  sourceNode: ProseMirrorNode,
  targetPos: number,
  targetNode: ProseMirrorNode,
  insertedNode: ProseMirrorNode,
): Transaction | null {
  const replacement = emptySourceParentReplacement(tr.doc, sourcePos);
  if (replacement) {
    tr.replaceWith(sourcePos, sourcePos + sourceNode.nodeSize, replacement);
  } else {
    tr.delete(sourcePos, sourcePos + sourceNode.nodeSize);
  }

  const mappedTargetPos = tr.mapping.map(targetPos, targetPos <= sourcePos ? -1 : 1);
  const mappedTargetNode = tr.doc.nodeAt(mappedTargetPos);
  if (!mappedTargetNode || mappedTargetNode.type !== targetNode.type) return null;

  tr.replaceWith(mappedTargetPos, mappedTargetPos + mappedTargetNode.nodeSize, insertedNode);
  return tr;
}

function emptyTargetPlaceholderForMove(
  targetPos: number,
  targetNode: ProseMirrorNode,
  sourceNode: ProseMirrorNode,
): { node: ProseMirrorNode; pos: number } | null {
  if (targetNode.childCount !== 1) return null;

  const placeholder = createEditableTextblock(targetNode.type.schema);
  if (!placeholder) return null;

  const child = targetNode.child(0);
  if (!child.eq(placeholder)) return null;
  if (!targetNode.canReplace(0, 1, Fragment.from(sourceNode))) return null;

  return { node: child, pos: targetPos + 1 };
}

function emptySourceParentReplacement(
  doc: ProseMirrorNode,
  sourcePos: number,
): ProseMirrorNode | null {
  const resolved = doc.resolve(sourcePos);
  const parent = resolved.parent;

  if (parent.childCount !== 1) return null;

  const paragraph = createEditableTextblock(doc.type.schema);
  if (!paragraph) return null;
  return parent.type.validContent(Fragment.from(paragraph)) ? paragraph : null;
}

function resolveKeyboardSiblingTarget(
  doc: ProseMirrorNode,
  sourceContext: MovementNodeContext,
  direction: KeyboardMovementDirection,
): MovementNodeContext | null {
  const parent = sourceContext.parent;
  const parentPos = sourceContext.parentPos;
  if (!parent || parentPos === null) return null;

  const targetIndex = direction === "backward" ? sourceContext.index - 1 : sourceContext.index + 1;
  if (targetIndex < 0 || targetIndex >= parent.childCount) return null;

  const targetPos = childPos(parent, parentPos, targetIndex);
  return resolveMovementNodeContext(doc, targetPos);
}

function childPos(parent: ProseMirrorNode, parentPos: number, childIndex: number): number {
  let pos = parentPos + 1;
  for (let index = 0; index < childIndex; index += 1) {
    pos += parent.child(index).nodeSize;
  }
  return pos;
}

function movementSourceKind(
  context: MovementNodeContext | null | undefined,
): "block" | "layout" | "section" {
  if (context?.nodeType.name === "layout") return "layout";
  if (context?.nodeType.name === "section") return "section";
  return "block";
}

function containedMovementSourceKind(
  context: MovementNodeContext | null | undefined,
): "category" | "choice" | "event" | "item" | "matching pair" | "sequencing item" {
  if (context?.nodeType.name === "categorise_bin") return "category";
  if (context?.nodeType.name === "matching_pair") return "matching pair";
  if (context?.nodeType.name === "selectable_choice") return "choice";
  if (context?.nodeType.name === "sequencing_item") return "sequencing item";
  if (context?.nodeType.name === "timeline_item") return "event";
  return "item";
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function findMovedSourcePos(doc: ProseMirrorNode, sourceNode: ProseMirrorNode): number | null {
  let found: number | null = null;

  doc.descendants((node, pos) => {
    if (node === sourceNode) {
      found = pos;
      return false;
    }
    return true;
  });

  return found;
}

function containsPosition(parentPos: number, parentNode: ProseMirrorNode, pos: number): boolean {
  return pos > parentPos && pos < parentPos + parentNode.nodeSize;
}
