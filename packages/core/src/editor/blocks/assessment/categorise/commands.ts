import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Selection, type Transaction } from "@tiptap/pm/state";
import {
  CategorisePrivateAssessmentSchema,
  type AssessmentFeedbackContent,
} from "@scaffold/contracts";

import { createStableId } from "@/document/model/identity/stable-ids";

import { fieldContent } from "./categorise-fields-shared";

interface CategoriseBlockLocation {
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
    attrs: { id: createStableId() },
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
    attrs: { id: createStableId() },
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
  const itemCount = countCategoriseItems(findCategoriseBlock(editor.state.doc, categoryPos)?.node);
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
  const block = findCategoriseBlock(editor.state.doc, itemPos);
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
  const block = findCategoriseBlock(editor.state.doc, itemPos);
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

/**
 * Keeps stable identities and item-keyed private feedback synchronized in the same transaction
 * as every visible Categorise document mutation, including neutral contained category movement.
 */
export function synchronizeCategoriseAssessmentsInTransaction(tr: Transaction): Transaction {
  const blocks: CategoriseBlockLocation[] = [];
  tr.doc.descendants((node, pos) => {
    if (node.type.name !== "categorise") return true;
    blocks.push({ node, pos });
    return false;
  });

  for (const block of blocks) {
    repairCategoryIds(tr, block);
    repairItemIdsAndFeedback(tr, block);
  }
  return tr;
}

function repairCategoryIds(tr: Transaction, block: CategoriseBlockLocation): void {
  const seen = new Set<string>();
  for (const category of categoriesIn(block)) {
    const originalId = stringId(category.node);
    if (originalId.trim() && !seen.has(originalId)) {
      seen.add(originalId);
      continue;
    }
    const id = createStableId();
    seen.add(id);
    tr.setNodeMarkup(category.pos, undefined, { ...category.node.attrs, id });
  }
}

function repairItemIdsAndFeedback(tr: Transaction, block: CategoriseBlockLocation): void {
  const assessment = CategorisePrivateAssessmentSchema.parse(block.node.attrs["assessment"] ?? {});
  const feedbackByItemId: Record<string, AssessmentFeedbackContent> = {};
  const seen = new Set<string>();

  for (const category of categoriesIn(block)) {
    category.itemsGroup.forEach((item, offset) => {
      if (item.type.name !== "categorise_item") return;
      const itemPos = category.itemsGroupPos + 1 + offset;
      const originalId = stringId(item);
      const canKeepId = originalId.trim().length > 0 && !seen.has(originalId);
      const itemId = canKeepId ? originalId : createStableId();
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
  if (!currentBlock || currentBlock.type.name !== "categorise") return;
  tr.setNodeMarkup(block.pos, undefined, {
    ...currentBlock.attrs,
    assessment: { ...assessment, feedbackByItemId },
  });
}

function categoriesIn(block: CategoriseBlockLocation): CategoryLocation[] {
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
  const block = findCategoriseBlock(doc, pos);
  return block ? (categoriesIn(block).find((category) => category.pos === pos) ?? null) : null;
}

function categoryContaining(
  block: CategoriseBlockLocation,
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

function findCategoriseBlock(doc: ProseMirrorNode, pos: number): CategoriseBlockLocation | null {
  try {
    const $pos = doc.resolve(pos);
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      const node = $pos.node(depth);
      if (node.type.name === "categorise") return { node, pos: $pos.before(depth) };
    }
  } catch {
    return null;
  }
  return null;
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
