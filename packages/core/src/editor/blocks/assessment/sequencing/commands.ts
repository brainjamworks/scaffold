import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";

import {
  SequencingPrivateAssessmentSchema,
  type AssessmentFeedbackContent,
} from "@scaffold/contracts";

import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { isAssessmentQuestionNode } from "@/editor/blocks/assessment/shared/nodes/assessment-meta";
import { itemContent } from "@/editor/assessment/sequencing/sequencing-fields-shared";

interface SequencingBlockLocation {
  node: ProseMirrorNode;
  pos: number;
}

export function addSequencingItem(editor: Editor, groupPos: number): boolean {
  const group = editor.state.doc.nodeAt(groupPos);
  if (!group || group.type.name !== "sequencing_items_group") return false;

  const item = editor.schema.nodeFromJSON({
    type: "sequencing_item",
    attrs: { id: createEmbeddedNodeId() },
    content: itemContent(),
  });
  const tr = editor.state.tr.insert(groupPos + group.nodeSize - 1, item);
  synchronizeSequencingAssessmentsInTransaction(tr);
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

export function canDeleteSequencingItem(editor: Editor, itemPos: number): boolean {
  try {
    const $item = editor.state.doc.resolve(itemPos);
    const item = editor.state.doc.nodeAt(itemPos);
    return Boolean(
      item?.type.name === "sequencing_item" &&
      $item.parent.type.name === "sequencing_items_group" &&
      $item.parent.childCount > 2,
    );
  } catch {
    return false;
  }
}

export function deleteSequencingItem(editor: Editor, itemPos: number): boolean {
  if (!canDeleteSequencingItem(editor, itemPos)) return false;
  const item = editor.state.doc.nodeAt(itemPos);
  if (!item) return false;

  const tr = editor.state.tr.delete(itemPos, itemPos + item.nodeSize);
  synchronizeSequencingAssessmentsInTransaction(tr);
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

/** Keeps visible item order and keyed private state in the transaction that changed the document. */
export function synchronizeSequencingAssessmentsInTransaction(tr: Transaction): Transaction {
  const blocks: SequencingBlockLocation[] = [];
  tr.doc.descendants((node, pos) => {
    if (!isAssessmentQuestionNode(node) || !hasDirectSequencingItemsGroup(node)) return true;
    blocks.push({ node, pos });
    return false;
  });

  for (const { node: initialBlock, pos: blockPos } of blocks) {
    const assessment = SequencingPrivateAssessmentSchema.parse(
      initialBlock.attrs["assessment"] ?? {},
    );
    let groupLocation: { node: ProseMirrorNode; pos: number } | undefined;
    initialBlock.forEach((child, offset) => {
      if (child.type.name !== "sequencing_items_group") return;
      groupLocation = { node: child, pos: blockPos + 1 + offset };
    });
    if (!groupLocation) continue;
    const { node: group, pos: groupPos } = groupLocation;

    const itemIds: string[] = [];
    const feedbackByItemId: Record<string, AssessmentFeedbackContent> = {};
    const seen = new Set<string>();
    group.forEach((child, offset) => {
      if (child.type.name !== "sequencing_item") return;
      const originalId = typeof child.attrs["id"] === "string" ? child.attrs["id"] : "";
      const canKeepId = originalId.trim().length > 0 && !seen.has(originalId);
      const itemId = canKeepId ? originalId : createEmbeddedNodeId();
      itemIds.push(itemId);
      seen.add(itemId);

      if (itemId !== originalId) {
        tr.setNodeMarkup(groupPos + 1 + offset, undefined, {
          ...child.attrs,
          id: itemId,
        });
      }
      if (canKeepId) {
        const feedback = assessment.feedbackByItemId[originalId];
        if (feedback) feedbackByItemId[itemId] = feedback;
      }
    });

    const feedbackIds = Object.keys(assessment.feedbackByItemId);
    const assessmentChanged =
      !sameOrder(assessment.correctOrder, itemIds) ||
      feedbackIds.length !== Object.keys(feedbackByItemId).length ||
      feedbackIds.some((id) => feedbackByItemId[id] !== assessment.feedbackByItemId[id]);
    if (!assessmentChanged) continue;

    const block = tr.doc.nodeAt(blockPos);
    if (!block || !isAssessmentQuestionNode(block)) continue;
    tr.setNodeMarkup(blockPos, undefined, {
      ...block.attrs,
      assessment: {
        ...assessment,
        correctOrder: itemIds,
        feedbackByItemId,
      },
    });
  }
  return tr;
}

function hasDirectSequencingItemsGroup(node: ProseMirrorNode): boolean {
  for (let index = 0; index < node.childCount; index += 1) {
    if (node.child(index).type.name === "sequencing_items_group") return true;
  }
  return false;
}

function sameOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}
