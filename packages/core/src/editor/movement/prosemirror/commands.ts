import type { Editor } from "@tiptap/core";
import type { EmbeddedNodeId } from "@scaffold/contracts";
import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";

import { getScaffoldCapabilitiesForEditor } from "@/composition/extensions/scaffold-capabilities-storage";
import {
  authorizeExplicitLayerStructuralSteps,
  readLayerEditingContextForState,
  resolveLayerTargetAtPosition,
  validateImplicitLayerEditRange,
  validateLayerContentPlacement,
  type LayerEditingContext,
} from "@/document/authoring/layers/layer-editing-boundaries";
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
  resolveLayerMovementDestination,
  resolveMovementNodeContext,
  validateLayerMovementEndpoint,
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

  const before = editor.state.doc;
  editor.view.dispatch(tr.scrollIntoView());
  return !editor.state.doc.eq(before);
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
  const layoutDefinitions = documentContainsLayer(doc)
    ? getScaffoldCapabilitiesForEditor(editor).layouts.registry
    : null;
  const layerEditingContext = layoutDefinitions
    ? readLayerEditingContextForState(editor.state, layoutDefinitions, blockDefinitions)
    : null;
  const movementPolicy = createStructureMovementPolicy(editor.schema, blockDefinitions);
  const sourceContext = resolveMovementNodeContext(doc, sourcePos);

  if (!sourceNode || !targetNode) return null;
  if (doc.nodeAt(targetPos) !== targetNode) return null;
  if (sourcePos === targetPos) return null;
  if (!canStartStructureMovement(movementPolicy, sourceContext)) return null;
  if (!canMoveSurfaceStructureNode(doc, sourcePos, surfaceVariants)) return null;
  if (containsPosition(sourcePos, sourceNode, targetPos)) return null;
  if (!canApplyStructureMovementBoundary(doc, sourcePos, targetPos)) return null;
  if (layerEditingContext) {
    const sourceBoundary = validateLayerMovementEndpoint({
      ...layerEditingContext,
      doc,
      from: sourcePos,
      to: sourcePos,
    });
    if (sourceBoundary) return null;
  } else if (
    layoutDefinitions &&
    resolveLayerTargetAtPosition({ doc, pos: sourcePos, layoutDefinitions })
  ) {
    throw new Error("Layer-aware movement requires the document authoring lifecycle.");
  }

  const resolvedDirectTarget = isDirectMoveIntent(intent)
    ? resolveDirectMoveTarget(doc, targetNode, targetPos, intent, layerEditingContext)
    : null;
  if (isDirectMoveIntent(intent) && !resolvedDirectTarget) return null;

  const sideTarget = isSideMovementIntent(intent) ? gridSideTarget(editor, intent) : null;
  if (isSideMovementIntent(intent) && !sideTarget) return null;
  if (sideTarget) {
    if (layerEditingContext) {
      const destinationBoundary = validateLayerMovementEndpoint({
        ...layerEditingContext,
        doc,
        from: sideTarget.pos,
        to: sideTarget.pos,
      });
      if (destinationBoundary) return null;
    } else if (
      layoutDefinitions &&
      resolveLayerTargetAtPosition({ doc, pos: sideTarget.pos, layoutDefinitions })
    ) {
      throw new Error("Layer-aware movement requires the document authoring lifecycle.");
    }
  }

  const boundedMovePlacement = isDirectMoveIntent(intent)
    ? resolveBoundedMovePlacementForIntent(
        editor,
        sourceNode,
        resolvedDirectTarget!.node,
        resolvedDirectTarget!.pos,
        intent,
        blockDefinitions,
      )
    : true;

  if (isDirectMoveIntent(intent)) {
    const destinationRange = directMoveDestinationRange(
      resolvedDirectTarget!.node,
      resolvedDirectTarget!.pos,
      intent,
      sourceNode,
    );
    if (
      !allowsLayerMoveDestination({
        blockDefinitions,
        doc,
        from: destinationRange.from,
        to: destinationRange.to,
        layerEditingContext,
        layoutDefinitions,
        sourceNode,
      })
    ) {
      return null;
    }
  }

  let tr: Transaction | null;
  try {
    tr = isDirectMoveIntent(intent)
      ? buildDirectMoveTransaction(
          editor,
          sourcePos,
          sourceNode,
          resolvedDirectTarget!.node,
          resolvedDirectTarget!.pos,
          intent,
          boundedMovePlacement,
          surfaceVariants,
        )
      : isSideMovementIntent(intent)
        ? buildGridSideMovementTransaction(editor, sourcePos, sourceNode, intent, sideTarget!)
        : null;
  } catch {
    return null;
  }
  if (!tr || tr.doc.eq(editor.state.doc)) return null;

  tr.doc.check();
  if (isSideMovementIntent(intent)) {
    authorizeExplicitLayerStructuralSteps(tr, {
      fromStep: 0,
      rootIds: sideMovementAuthorizationRootIds(
        doc,
        tr.doc,
        sourceNode,
        sourcePos,
        sideTarget!,
        layoutDefinitions,
      ),
    });
  } else if (containsLayer(sourceNode)) {
    const sourceOwnerId = layoutDefinitions
      ? resolveLayerTargetAtPosition({ doc, pos: sourcePos, layoutDefinitions })?.ownerSlot
          .logicalOwner.id
      : null;
    authorizeExplicitLayerStructuralSteps(tr, {
      fromStep: 0,
      rootIds: [requireStableNodeId(sourceNode), ...(sourceOwnerId ? [sourceOwnerId] : [])],
    });
  }
  return tr;
}

function resolveDirectMoveTarget(
  doc: ProseMirrorNode,
  targetNode: ProseMirrorNode,
  targetPos: number,
  intent: DirectMoveIntent,
  layerEditingContext: LayerEditingContext | null,
): { readonly node: ProseMirrorNode; readonly pos: number } | null {
  if (!(intent instanceof InsertInsideTarget) || !isLayerLogicalOwner(targetNode)) {
    return { node: targetNode, pos: targetPos };
  }
  if (!mayHaveOwnedLayerComposition(targetNode)) {
    return { node: targetNode, pos: targetPos };
  }
  if (!layerEditingContext) {
    throw new Error("Layer-aware movement requires the document authoring lifecycle.");
  }
  const ownerId = requireStableNodeId(targetNode);
  const destination = resolveLayerMovementDestination({
    ...layerEditingContext,
    doc,
    ownerId,
  });
  if (destination.status === "error") return null;
  return { node: destination.value.layer, pos: destination.value.pos };
}

function allowsLayerMoveDestination({
  blockDefinitions,
  doc,
  from,
  to,
  layerEditingContext,
  layoutDefinitions,
  sourceNode,
}: {
  readonly blockDefinitions: BlockDefinitionLookup;
  readonly doc: ProseMirrorNode;
  readonly from: number;
  readonly to: number;
  readonly layerEditingContext: LayerEditingContext | null;
  readonly layoutDefinitions: LayoutRegistry | null;
  readonly sourceNode: ProseMirrorNode;
}): boolean {
  if (!layerEditingContext) {
    if (layoutDefinitions && resolveLayerTargetAtPosition({ doc, pos: from, layoutDefinitions })) {
      throw new Error("Layer-aware movement requires the document authoring lifecycle.");
    }
    return true;
  }
  if (!layoutDefinitions) {
    throw new Error("Layer editing context is missing Layout definitions.");
  }

  const boundary = validateImplicitLayerEditRange({
    ...layerEditingContext,
    doc,
    from,
    to,
  });
  if (boundary.status === "error") return false;
  const target = boundary.value.at(-1);
  if (!target) return true;
  return (
    validateLayerContentPlacement({
      target,
      contentType: sourceNode.type.name,
      contentIsFillOccupant: isFillOccupantNode(sourceNode, blockDefinitions, layoutDefinitions),
      existingChildIsFillOccupant: (child) =>
        isFillOccupantNode(child, blockDefinitions, layoutDefinitions),
      from,
      to,
    }).status === "ready"
  );
}

function buildDirectMoveTransaction(
  editor: Editor,
  sourcePos: number,
  sourceNode: ProseMirrorNode,
  targetNode: ProseMirrorNode,
  targetPos: number,
  intent: DirectMoveIntent,
  boundedMovePlacement: boolean,
  surfaceVariants: SurfaceVariantLookup,
): Transaction | null {
  const insertPos =
    intent instanceof InsertBeforeTarget
      ? targetPos
      : intent instanceof InsertAfterTarget
        ? targetPos + targetNode.nodeSize
        : targetPos + targetNode.nodeSize - 1;
  const targetPlaceholder =
    intent instanceof InsertInsideTarget
      ? emptyTargetPlaceholderForMove(targetPos, targetNode, sourceNode)
      : null;
  if (
    !canInsertForMove(
      editor,
      sourceNode,
      targetNode,
      targetPos,
      intent,
      boundedMovePlacement,
      surfaceVariants,
    )
  ) {
    return null;
  }

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

function directMoveDestinationRange(
  targetNode: ProseMirrorNode,
  targetPos: number,
  intent: DirectMoveIntent,
  sourceNode: ProseMirrorNode,
): Readonly<{ from: number; to: number }> {
  const insertPos =
    intent instanceof InsertBeforeTarget
      ? targetPos
      : intent instanceof InsertAfterTarget
        ? targetPos + targetNode.nodeSize
        : targetPos + targetNode.nodeSize - 1;
  const placeholder =
    intent instanceof InsertInsideTarget
      ? emptyTargetPlaceholderForMove(targetPos, targetNode, sourceNode)
      : null;
  return Object.freeze({
    from: placeholder?.pos ?? insertPos,
    to: placeholder ? placeholder.pos + placeholder.node.nodeSize : insertPos,
  });
}

function canInsertForMove(
  editor: Editor,
  sourceNode: ProseMirrorNode,
  targetNode: ProseMirrorNode,
  targetPos: number,
  intent: DirectMoveIntent,
  boundedMovePlacement: boolean,
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
    if (!boundedMovePlacement) return false;
    return targetNode.canReplace(targetNode.childCount, targetNode.childCount, fragment);
  }

  const targetResolved = editor.state.doc.resolve(targetPos);
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

  if (!boundedMovePlacement) return false;

  const targetIndex = targetResolved.index();
  const insertIndex = intent instanceof InsertBeforeTarget ? targetIndex : targetIndex + 1;
  return targetResolved.parent.canReplace(insertIndex, insertIndex, fragment);
}

function resolveBoundedMovePlacementForIntent(
  editor: Editor,
  sourceNode: ProseMirrorNode,
  targetNode: ProseMirrorNode,
  targetPos: number,
  intent: DirectMoveIntent,
  blockDefinitions: BlockDefinitionLookup,
): boolean {
  if (intent instanceof InsertInsideTarget) {
    return allowsBoundedMovePlacementForTarget(
      editor,
      sourceNode,
      targetNode,
      targetPos,
      blockDefinitions,
    );
  }

  const targetParent = resolveMoveTargetParent(editor.state.doc, targetPos);
  if (!targetParent) return false;

  return allowsBoundedMovePlacementForTarget(
    editor,
    sourceNode,
    targetParent.node,
    targetParent.pos,
    blockDefinitions,
  );
}

function resolveMoveTargetParent(
  doc: ProseMirrorNode,
  targetPos: number,
): { node: ProseMirrorNode; pos: number } | null {
  try {
    const resolved = doc.resolve(targetPos);
    return {
      node: resolved.parent,
      pos: resolved.depth > 0 ? resolved.before(resolved.depth) : 0,
    };
  } catch {
    return null;
  }
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
    node.type.name === "layer" ||
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
  const layerTarget = resolveLayerTargetAtPosition({ doc, pos: targetPos, layoutDefinitions });
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
  const boundedContainerType = layerTarget?.ownerSlot.logicalOwner.nodeType ?? targetNode.type.name;
  if (!isBoundedContainerType(boundedContainerType)) return true;
  if (
    !isActiveBoundedContainerAtPosition({
      blockDefinitions,
      containerType: boundedContainerType,
      doc,
      layoutDefinitions,
      pos: targetPos,
    })
  ) {
    return true;
  }

  return (
    (layerTarget?.layer ?? targetNode).childCount === 1 &&
    (layerTarget?.layer ?? targetNode).firstChild?.type.name === "paragraph" &&
    (layerTarget?.layer ?? targetNode).firstChild?.content.size === 0
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
  sideTarget: { readonly node: ProseMirrorNode; readonly pos: number },
): Transaction | null {
  const side = gridSideForIntent(intent);

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

function sideMovementAuthorizationRootIds(
  before: ProseMirrorNode,
  after: ProseMirrorNode,
  sourceNode: ProseMirrorNode,
  sourcePos: number,
  sideTarget: { readonly node: ProseMirrorNode; readonly pos: number },
  layoutDefinitions: LayoutRegistry | null,
): readonly EmbeddedNodeId[] {
  const ids = new Set<EmbeddedNodeId>([
    requireStableNodeId(sourceNode),
    requireStableNodeId(sideTarget.node),
  ]);
  const targetGrid = findAncestorAtPosition(before, sideTarget.pos, "grid");
  if (targetGrid) ids.add(requireStableNodeId(targetGrid));
  if (layoutDefinitions) {
    const sourceOwner = resolveLayerTargetAtPosition({
      doc: before,
      pos: sourcePos,
      layoutDefinitions,
    });
    const targetOwner = resolveLayerTargetAtPosition({
      doc: before,
      pos: sideTarget.pos,
      layoutDefinitions,
    });
    if (sourceOwner) ids.add(sourceOwner.ownerSlot.logicalOwner.id);
    if (targetOwner) ids.add(targetOwner.ownerSlot.logicalOwner.id);
  }

  const beforeIds = collectStableIds(before);
  after.descendants((node) => {
    if (node.type.name !== "grid") return true;
    const id = requireStableNodeId(node);
    if (!beforeIds.has(id)) ids.add(id);
    return true;
  });
  return Object.freeze([...ids]);
}

function findAncestorAtPosition(
  doc: ProseMirrorNode,
  pos: number,
  nodeType: string,
): ProseMirrorNode | null {
  const direct = doc.nodeAt(pos);
  if (direct?.type.name === nodeType) return direct;
  const resolved = doc.resolve(pos);
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    const node = resolved.node(depth);
    if (node.type.name === nodeType) return node;
  }
  return null;
}

function collectStableIds(doc: ProseMirrorNode): ReadonlySet<EmbeddedNodeId> {
  const ids = new Set<EmbeddedNodeId>();
  doc.descendants((node) => {
    const id = node.attrs["id"];
    if (typeof id === "string" && id.length > 0) ids.add(id as EmbeddedNodeId);
    return true;
  });
  return ids;
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
  if (child.type !== placeholder.type || child.content.size > 0) return null;
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

function isLayerLogicalOwner(node: ProseMirrorNode): boolean {
  return node.type.name === "region" || node.type.name === "cell" || node.type.name === "section";
}

function mayHaveOwnedLayerComposition(node: ProseMirrorNode): boolean {
  if (node.type.name === "region" || node.type.name === "cell") {
    return node.firstChild?.type.name === "layer";
  }
  if (node.type.name !== "section") return false;
  if (node.firstChild?.type.name === "layer") return true;
  for (let index = 0; index < node.childCount; index += 1) {
    const child = node.child(index);
    if (child.firstChild?.type.name === "layer") return true;
  }
  return false;
}

function containsLayer(node: ProseMirrorNode): boolean {
  let found = false;
  node.descendants((child) => {
    if (child.type.name !== "layer") return true;
    found = true;
    return false;
  });
  return found;
}

function requireStableNodeId(node: ProseMirrorNode): EmbeddedNodeId {
  const id = node.attrs["id"];
  if (typeof id !== "string" || id.length === 0) {
    throw new Error(`Structural node "${node.type.name}" has no stable identity.`);
  }
  return id as EmbeddedNodeId;
}

function documentContainsLayer(doc: ProseMirrorNode): boolean {
  let found = false;
  doc.descendants((node) => {
    if (node.type.name !== "layer") return true;
    found = true;
    return false;
  });
  return found;
}
