import type { Editor } from "@tiptap/core";
import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";

import { getScaffoldCapabilitiesForEditor } from "@/composition/extensions/scaffold-capabilities-storage";
import { createEditableTextblock } from "@/document/model/content-model/editable-region";
import { buildGridBesideDropTransaction } from "@/editor/arrangements/grid/model/grid-drop-rules";
import type { LayoutRegistry } from "@/editor/arrangements/layout/model/layout-registry";
import {
  allowsBoundedContainerRootInsertionAtPosition,
  isActiveBoundedContainerAtPosition,
  isFillOccupantNode,
  type BoundedContainerType,
} from "@/editor/bounded-containers/model/bounded-container-placement";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import {
  canMoveSiblingNodeTo,
  moveSiblingNodeTo,
} from "@/editor/prosemirror/move-sibling/move-sibling-node";
import {
  canInsertSurfaceStructureChild,
  canMoveSurfaceStructureNode,
} from "@/editor/surfaces/model/policies/surface-movement-policy";
import { allowsSurfaceRootInsertion } from "@/editor/surfaces/model/policies/surface-root-insertion-policy";
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
  canStartStructureMovement,
  createStructureMovementPolicy,
  resolveMovementNodeContext,
} from "../model/movement-policy";

type DirectMoveIntent = InsertBeforeTarget | InsertAfterTarget | InsertInsideTarget;
type ContainedMoveIntent = MoveContainedBeforeTarget | MoveContainedAfterTarget;

type GridSide = "left" | "right";

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
          blockDefinitions,
          surfaceVariants,
        )
      : isSideMovementIntent(intent)
        ? buildGridSideMovementTransaction(editor, sourcePos, sourceNode, intent)
        : null;

    if (!tr || tr.doc.eq(editor.state.doc)) return null;

    tr.doc.check();
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
  blockDefinitions: BlockDefinitionLookup,
  surfaceVariants: SurfaceVariantLookup,
): Transaction | null {
  if (
    !canInsertForMove(
      editor,
      sourceNode,
      targetNode,
      intent,
      blockDefinitions,
      surfaceVariants,
    )
  ) {
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
  blockDefinitions: BlockDefinitionLookup,
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
    if (
      !allowsBoundedMovePlacementForTarget(
        editor,
        sourceNode,
        targetNode,
        intent.target.pos,
        blockDefinitions,
      )
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

  const parentPos = targetResolved.depth > 0 ? targetResolved.before(targetResolved.depth) : 0;
  if (
    !allowsBoundedMovePlacementForTarget(
      editor,
      sourceNode,
      parent,
      parentPos,
      blockDefinitions,
    )
  ) {
    return false;
  }

  const targetIndex = targetResolved.index();
  const insertIndex = intent instanceof InsertBeforeTarget ? targetIndex : targetIndex + 1;
  return targetResolved.parent.canReplace(insertIndex, insertIndex, fragment);
}

function allowsBoundedMovePlacementForTarget(
  editor: Editor,
  sourceNode: ProseMirrorNode,
  targetNode: ProseMirrorNode,
  targetPos: number,
  blockDefinitions: BlockDefinitionLookup,
): boolean {
  if (!mayBeBoundedMoveTarget(targetNode, blockDefinitions)) return true;

  return allowsBoundedMovePlacement({
    blockDefinitions,
    doc: editor.state.doc,
    layoutDefinitions: getScaffoldCapabilitiesForEditor(editor).layouts.registry,
    sourceNode,
    targetNode,
    targetPos,
  });
}

function mayBeBoundedMoveTarget(
  node: ProseMirrorNode,
  blockDefinitions: BlockDefinitionLookup,
): boolean {
  return (
    isBoundedContainerType(node.type.name) ||
    blockDefinitions.getByNodeType(node.type.name)?.stagedBoundedHost !== undefined
  );
}

function allowsBoundedMovePlacement({
  blockDefinitions,
  doc,
  layoutDefinitions,
  sourceNode,
  targetNode,
  targetPos,
}: {
  blockDefinitions: BlockDefinitionLookup;
  doc: ProseMirrorNode;
  layoutDefinitions: LayoutRegistry;
  sourceNode: ProseMirrorNode;
  targetNode: ProseMirrorNode;
  targetPos: number;
}): boolean {
  if (
    !allowsBoundedContainerRootInsertionAtPosition({
      blockDefinitions,
      doc,
      layoutDefinitions,
      pos: targetPos,
    })
  ) {
    return false;
  }

  if (!isFillOccupantNode(sourceNode, blockDefinitions, layoutDefinitions)) return true;
  if (!isBoundedContainerType(targetNode.type.name)) return true;
  if (
    !isActiveBoundedContainerAtPosition({
      blockDefinitions,
      containerType: targetNode.type.name,
      doc,
      layoutDefinitions,
      pos: targetPos,
    })
  ) {
    return true;
  }

  return (
    targetNode.childCount === 1 &&
    targetNode.firstChild?.type.name === "paragraph" &&
    targetNode.firstChild.content.size === 0
  );
}

function isBoundedContainerType(nodeType: string): nodeType is BoundedContainerType {
  return nodeType === "cell" || nodeType === "region" || nodeType === "section";
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

function containsPosition(parentPos: number, parentNode: ProseMirrorNode, pos: number): boolean {
  return pos > parentPos && pos < parentPos + parentNode.nodeSize;
}
