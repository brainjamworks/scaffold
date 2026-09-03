import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Selection, type Transaction } from "@tiptap/pm/state";
import {
  CategorisePrivateAssessmentSchema,
  type AssessmentFeedbackContent,
} from "@scaffold/contracts";

import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import {
  MoveContainedAfterTarget,
  MoveContainedBeforeTarget,
  type AnyMovementIntent,
} from "@/editor/movement/model/movement-intents";
import type { MovementNodeContext } from "@/editor/movement/model/movement-policy";

import { fieldContent } from "@/editor/assessment/categorise/categorise-fields-shared";

const SURFACE_CATEGORISE_QUESTION_NODE_TYPE = "surface_categorise_question";

interface CategoriseOwnerLocation {
  readonly node: ProseMirrorNode;
  readonly pos: number;
}

interface CategoryLocation {
  readonly node: ProseMirrorNode;
  readonly pos: number;
  readonly itemsGroup: ProseMirrorNode;
  readonly itemsGroupPos: number;
}

export function addCategoriseCategory(editor: Editor, binsGroupPos: number): boolean {
  const group = editor.state.doc.nodeAt(binsGroupPos);
  if (!group || group.type.name !== "categorise_bins_group") return false;
  const category = editor.schema.nodeFromJSON({
    type: "categorise_bin",
    attrs: { id: createEmbeddedNodeId() },
    content: [
      { type: "categorise_bin_title", content: fieldContent() },
      { type: "categorise_items_group" },
    ],
  });
  const tr = editor.state.tr.insert(binsGroupPos + group.nodeSize - 1, category);
  synchronizeCategoriseAssessmentsInTransaction(tr);
  editor.view.dispatch(tr.scrollIntoView());
  editor.view.focus();
  return true;
}

export function addCategoriseItem(editor: Editor, itemsGroupPos: number): boolean {
  const group = editor.state.doc.nodeAt(itemsGroupPos);
  if (!group || group.type.name !== "categorise_items_group") return false;
  const item = editor.schema.nodeFromJSON({
    type: "categorise_item",
    attrs: { id: createEmbeddedNodeId() },
    content: [{ type: "categorise_item_body", content: fieldContent() }],
  });
  const insertPos = itemsGroupPos + group.nodeSize - 1;
  const tr = editor.state.tr.insert(insertPos, item);
  synchronizeCategoriseAssessmentsInTransaction(tr);
  setSelectionNear(tr, insertPos + 2);
  editor.view.dispatch(tr.scrollIntoView());
  editor.view.focus();
  return true;
}

export function canDeleteCategoriseCategory(editor: Editor, categoryPos: number): boolean {
  const location = categoryAt(editor.state.doc, categoryPos);
  if (!location) return false;
  const $category = editor.state.doc.resolve(categoryPos);
  if ($category.parent.type.name !== "categorise_bins_group") return false;
  const itemCount = countCategoriseItems(findCategoriseOwner(editor.state.doc, categoryPos)?.node);
  return $category.parent.childCount > 2 && itemCount - location.itemsGroup.childCount >= 1;
}

export function deleteCategoriseCategory(editor: Editor, categoryPos: number): boolean {
  if (!canDeleteCategoriseCategory(editor, categoryPos)) return false;
  const category = editor.state.doc.nodeAt(categoryPos);
  if (!category) return false;
  const tr = editor.state.tr.delete(categoryPos, categoryPos + category.nodeSize);
  synchronizeCategoriseAssessmentsInTransaction(tr);
  editor.view.dispatch(tr.scrollIntoView());
  editor.view.focus();
  return true;
}

export function canDeleteCategoriseItem(editor: Editor, itemPos: number): boolean {
  const item = editor.state.doc.nodeAt(itemPos);
  if (!item || item.type.name !== "categorise_item") return false;
  const block = findCategoriseOwner(editor.state.doc, itemPos);
  return countCategoriseItems(block?.node) > 1;
}

export function deleteCategoriseItem(editor: Editor, itemPos: number): boolean {
  if (!canDeleteCategoriseItem(editor, itemPos)) return false;
  const item = editor.state.doc.nodeAt(itemPos);
  if (!item) return false;
  const tr = editor.state.tr.delete(itemPos, itemPos + item.nodeSize);
  synchronizeCategoriseAssessmentsInTransaction(tr);
  editor.view.dispatch(tr.scrollIntoView());
  editor.view.focus();
  return true;
}

export function reassignCategoriseItem(
  editor: Editor,
  itemPos: number,
  targetCategoryId: string,
): boolean {
  const item = editor.state.doc.nodeAt(itemPos);
  if (!item || item.type.name !== "categorise_item" || !targetCategoryId.trim()) return false;
  const block = findCategoriseOwner(editor.state.doc, itemPos);
  if (!block) return false;
  const sourceCategory = categoryContaining(block, itemPos);
  const targetCategory = categoriesIn(block).find(
    ({ node }) => node.attrs["id"] === targetCategoryId,
  );
  if (!sourceCategory || !targetCategory || sourceCategory.pos === targetCategory.pos) return false;

  const targetInsertPos = targetCategory.itemsGroupPos + targetCategory.itemsGroup.nodeSize - 1;
  const tr = editor.state.tr.delete(itemPos, itemPos + item.nodeSize);
  const mappedInsertPos = tr.mapping.map(targetInsertPos);
  tr.insert(mappedInsertPos, item);
  synchronizeCategoriseAssessmentsInTransaction(tr);
  setSelectionNear(tr, mappedInsertPos + 2);
  editor.view.dispatch(tr.scrollIntoView());
  editor.view.focus();
  return true;
}

export function canTargetCategoriseItemMovement(
  source: MovementNodeContext,
  target: MovementNodeContext,
): boolean {
  if (source.nodeType.name !== "categorise_item" || source.pos === target.pos) return false;
  if (target.nodeType.name !== "categorise_item" && target.nodeType.name !== "categorise_bin") {
    return false;
  }
  const sourceOwner = movementCategoriseOwner(source);
  const targetOwner = movementCategoriseOwner(target);
  return Boolean(
    sourceOwner &&
    targetOwner &&
    sourceOwner.pos === targetOwner.pos &&
    sourceOwner.node === targetOwner.node,
  );
}

export function canApplyCategoriseItemMovement(
  editor: Editor,
  source: MovementNodeContext,
  intent: AnyMovementIntent,
): boolean {
  return categoriseItemMovementIsApplicable(editor.state.doc, source.pos, intent);
}

export function canNavigateCategoriseItemMovement(
  _source: MovementNodeContext,
  current: MovementNodeContext,
  target: MovementNodeContext,
  direction: "down" | "left" | "right" | "up",
): boolean {
  if (direction === "up" || direction === "down") {
    return target.nodeType.name === "categorise_item" && target.parentPos === current.parentPos;
  }
  const currentCategory = movementCategory(current);
  const targetCategory = movementCategory(target);
  if (!currentCategory || !targetCategory) return false;
  const destinationIndex = currentCategory.index + (direction === "left" ? -1 : 1);
  return targetCategory.index === destinationIndex;
}

export function applyCategoriseItemMovement(
  editor: Editor,
  source: MovementNodeContext,
  intent: AnyMovementIntent,
): boolean {
  const tr = buildCategoriseItemMovementTransaction(editor, source.pos, intent);
  if (!tr) return false;
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

export function describeCategoriseItemMovementDestination(
  editor: Editor,
  source: MovementNodeContext,
  intent: AnyMovementIntent,
): string | null {
  const target = categoriseItemMovementTarget(editor.state.doc, intent);
  if (!target) return null;
  const category = target.category;
  const categoryLabel = category.node.firstChild?.textContent.trim() || "unnamed category";
  if (target.targetNode.type.name === "categorise_bin") {
    return `category ${categoryLabel}, at the end`;
  }
  const targetIndex = target.category.itemsGroup.childBefore(
    target.targetPos - target.category.itemsGroupPos - 1,
  ).index;
  let destinationIndex = targetIndex + (intent instanceof MoveContainedAfterTarget ? 1 : 0);
  if (source.parentPos === target.category.itemsGroupPos && source.index < destinationIndex) {
    destinationIndex -= 1;
  }
  const position = destinationIndex + 1;
  return `category ${categoryLabel}, position ${position}`;
}

function buildCategoriseItemMovementTransaction(
  editor: Editor,
  sourcePos: number,
  intent: AnyMovementIntent,
): Transaction | null {
  if (
    !(intent instanceof MoveContainedBeforeTarget) &&
    !(intent instanceof MoveContainedAfterTarget)
  ) {
    return null;
  }
  if (!categoriseItemMovementIsApplicable(editor.state.doc, sourcePos, intent)) return null;
  const sourceNode = editor.state.doc.nodeAt(sourcePos);
  if (!sourceNode || sourceNode.type.name !== "categorise_item") return null;
  const sourceBlock = findCategoriseOwner(editor.state.doc, sourcePos);
  const target = categoriseItemMovementTarget(editor.state.doc, intent);
  if (!sourceBlock || !target || sourceBlock.pos !== target.block.pos) return null;
  if (target.targetPos === sourcePos) return null;

  const insertPos =
    target.targetNode.type.name === "categorise_bin"
      ? target.category.itemsGroupPos + target.category.itemsGroup.nodeSize - 1
      : intent instanceof MoveContainedBeforeTarget
        ? target.targetPos
        : target.targetPos + target.targetNode.nodeSize;

  try {
    const tr = editor.state.tr.delete(sourcePos, sourcePos + sourceNode.nodeSize);
    const mappedInsertPos = tr.mapping.map(insertPos);
    tr.insert(mappedInsertPos, sourceNode);
    if (tr.doc.eq(editor.state.doc)) return null;
    synchronizeCategoriseAssessmentsInTransaction(tr);
    tr.doc.check();
    return tr;
  } catch {
    return null;
  }
}

function categoriseItemMovementIsApplicable(
  doc: ProseMirrorNode,
  sourcePos: number,
  intent: AnyMovementIntent,
): boolean {
  if (
    !(intent instanceof MoveContainedBeforeTarget) &&
    !(intent instanceof MoveContainedAfterTarget)
  ) {
    return false;
  }
  const sourceNode = doc.nodeAt(sourcePos);
  const sourceBlock = findCategoriseOwner(doc, sourcePos);
  const target = categoriseItemMovementTarget(doc, intent);
  if (
    !sourceNode ||
    sourceNode.type.name !== "categorise_item" ||
    !sourceBlock ||
    !target ||
    sourceBlock.pos !== target.block.pos ||
    target.targetPos === sourcePos
  ) {
    return false;
  }
  const sourceCategory = categoryContaining(sourceBlock, sourcePos);
  if (!sourceCategory) return false;
  const sourceIndex = doc.resolve(sourcePos).index();
  if (target.targetNode.type.name === "categorise_bin") {
    return (
      sourceCategory.pos !== target.category.pos ||
      sourceIndex !== sourceCategory.itemsGroup.childCount - 1
    );
  }
  if (sourceCategory.pos !== target.category.pos) return true;
  const targetIndex = doc.resolve(target.targetPos).index();
  return intent instanceof MoveContainedBeforeTarget
    ? sourceIndex !== targetIndex - 1
    : sourceIndex !== targetIndex + 1;
}

function categoriseItemMovementTarget(
  doc: ProseMirrorNode,
  intent: AnyMovementIntent,
): Readonly<{
  block: CategoriseOwnerLocation;
  category: CategoryLocation;
  targetNode: ProseMirrorNode;
  targetPos: number;
}> | null {
  if (
    !(intent instanceof MoveContainedBeforeTarget) &&
    !(intent instanceof MoveContainedAfterTarget)
  ) {
    return null;
  }
  const targetPos = intent.target.pos;
  const targetNode = doc.nodeAt(targetPos);
  if (!targetNode) return null;
  const block = findCategoriseOwner(doc, targetPos);
  if (!block) return null;
  const category =
    targetNode.type.name === "categorise_bin"
      ? categoryAt(doc, targetPos)
      : targetNode.type.name === "categorise_item"
        ? categoryContaining(block, targetPos)
        : null;
  return category ? { block, category, targetNode, targetPos } : null;
}

function movementAncestor(
  context: MovementNodeContext,
  nodeTypeName: string,
): MovementNodeContext["ancestors"][number] | null {
  return (
    [...context.ancestors].reverse().find((ancestor) => ancestor.nodeType.name === nodeTypeName) ??
    null
  );
}

function movementCategory(context: MovementNodeContext): Readonly<{ index: number }> | null {
  if (context.nodeType.name === "categorise_bin") {
    return { index: context.index };
  }
  const ancestor = movementAncestor(context, "categorise_bin");
  return ancestor ? { index: ancestor.index } : null;
}

/**
 * Keeps stable identities and item-keyed private feedback synchronized in the same transaction
 * as every visible Categorise document mutation, including neutral contained category movement.
 */
export function synchronizeCategoriseAssessmentsInTransaction(tr: Transaction): Transaction {
  const blocks: CategoriseOwnerLocation[] = [];
  tr.doc.descendants((node, pos) => {
    if (!isCategoriseAssessmentOwner(node)) return true;
    blocks.push({ node, pos });
    return false;
  });

  for (const block of blocks) {
    repairCategoryIds(tr, block);
    repairItemIdsAndFeedback(tr, block);
  }
  return tr;
}

function repairCategoryIds(tr: Transaction, block: CategoriseOwnerLocation): void {
  const seen = new Set<string>();
  for (const category of categoriesIn(block)) {
    const originalId = stringId(category.node);
    if (originalId.trim() && !seen.has(originalId)) {
      seen.add(originalId);
      continue;
    }
    const id = createEmbeddedNodeId();
    seen.add(id);
    tr.setNodeMarkup(category.pos, undefined, { ...category.node.attrs, id });
  }
}

function repairItemIdsAndFeedback(tr: Transaction, block: CategoriseOwnerLocation): void {
  const assessment = CategorisePrivateAssessmentSchema.parse(block.node.attrs["assessment"] ?? {});
  const feedbackByItemId: Record<string, AssessmentFeedbackContent> = {};
  const seen = new Set<string>();

  for (const category of categoriesIn(block)) {
    category.itemsGroup.forEach((item, offset) => {
      if (item.type.name !== "categorise_item") return;
      const itemPos = category.itemsGroupPos + 1 + offset;
      const originalId = stringId(item);
      const canKeepId = originalId.trim().length > 0 && !seen.has(originalId);
      const itemId = canKeepId ? originalId : createEmbeddedNodeId();
      seen.add(itemId);
      if (itemId !== originalId) {
        tr.setNodeMarkup(itemPos, undefined, { ...item.attrs, id: itemId });
      }
      if (canKeepId) {
        const feedback = assessment.feedbackByItemId[originalId];
        if (feedback) feedbackByItemId[itemId] = feedback;
      }
    });
  }

  const feedbackIds = Object.keys(assessment.feedbackByItemId);
  const feedbackChanged =
    feedbackIds.length !== Object.keys(feedbackByItemId).length ||
    feedbackIds.some((id) => feedbackByItemId[id] !== assessment.feedbackByItemId[id]);
  if (!feedbackChanged) return;
  const currentBlock = tr.doc.nodeAt(block.pos);
  if (!currentBlock || !isCategoriseAssessmentOwner(currentBlock)) return;
  tr.setNodeMarkup(block.pos, undefined, {
    ...currentBlock.attrs,
    assessment: { ...assessment, feedbackByItemId },
  });
}

function categoriesIn(block: CategoriseOwnerLocation): CategoryLocation[] {
  const out: CategoryLocation[] = [];
  block.node.descendants((node, offset) => {
    if (node.type.name !== "categorise_bin") return true;
    const categoryPos = block.pos + 1 + offset;
    let itemsGroup: ProseMirrorNode | null = null;
    let itemsGroupOffset = 0;
    node.forEach((child, childOffset) => {
      if (child.type.name !== "categorise_items_group") return;
      itemsGroup = child;
      itemsGroupOffset = childOffset;
    });
    if (itemsGroup) {
      out.push({
        node,
        pos: categoryPos,
        itemsGroup,
        itemsGroupPos: categoryPos + 1 + itemsGroupOffset,
      });
    }
    return false;
  });
  return out;
}

function categoryAt(doc: ProseMirrorNode, pos: number): CategoryLocation | null {
  const block = findCategoriseOwner(doc, pos);
  return block ? (categoriesIn(block).find((category) => category.pos === pos) ?? null) : null;
}

function categoryContaining(
  block: CategoriseOwnerLocation,
  itemPos: number,
): CategoryLocation | null {
  return (
    categoriesIn(block).find(
      (category) =>
        itemPos > category.itemsGroupPos &&
        itemPos < category.itemsGroupPos + category.itemsGroup.nodeSize,
    ) ?? null
  );
}

function findCategoriseOwner(doc: ProseMirrorNode, pos: number): CategoriseOwnerLocation | null {
  try {
    const $pos = doc.resolve(pos);
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      const node = $pos.node(depth);
      if (isCategoriseAssessmentOwner(node)) return { node, pos: $pos.before(depth) };
    }
  } catch {
    return null;
  }
  return null;
}

function isCategoriseAssessmentOwner(node: ProseMirrorNode): boolean {
  return (
    node.type.name === "categorise" || node.type.name === SURFACE_CATEGORISE_QUESTION_NODE_TYPE
  );
}

function movementCategoriseOwner(context: MovementNodeContext) {
  return (
    movementAncestor(context, "categorise") ??
    movementAncestor(context, SURFACE_CATEGORISE_QUESTION_NODE_TYPE)
  );
}

function countCategoriseItems(block: ProseMirrorNode | undefined): number {
  if (!block) return 0;
  let count = 0;
  block.descendants((node) => {
    if (node.type.name === "categorise_item") count += 1;
  });
  return count;
}

function stringId(node: ProseMirrorNode): string {
  return typeof node.attrs["id"] === "string" ? node.attrs["id"] : "";
}

function setSelectionNear(tr: Transaction, pos: number): void {
  try {
    tr.setSelection(Selection.near(tr.doc.resolve(Math.min(pos, tr.doc.content.size))));
  } catch {
    // The edit remains valid if a schema-specific selection cannot be restored.
  }
}
