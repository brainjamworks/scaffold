import type { Editor } from "@tiptap/core";
import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Selection, type Transaction } from "@tiptap/pm/state";
import {
  MatchingPrivateAssessmentSchema,
  type AssessmentFeedbackContent,
} from "@scaffold/contracts";

import { createStableId } from "@/document/model/identity/stable-ids";
import { matchingPairContent } from "./matching-fields-shared";

type MatchingMoveDirection = "up" | "down";

interface MatchingBlockLocation {
  readonly node: ProseMirrorNode;
  readonly pos: number;
}

export function addMatchingPair(editor: Editor, groupPos: number): boolean {
  const group = editor.state.doc.nodeAt(groupPos);
  if (!group || group.type.name !== "matching_pairs_group") return false;
  const pair = editor.schema.nodeFromJSON({
    type: "matching_pair",
    attrs: { itemId: createStableId(), targetId: createStableId() },
    content: matchingPairContent(),
  });
  const insertPos = groupPos + group.nodeSize - 1;
  const tr = editor.state.tr.insert(insertPos, pair);
  synchronizeMatchingAssessmentsInTransaction(tr);
  setSelectionNear(tr, insertPos + 2);
  editor.view.dispatch(tr.scrollIntoView());
  editor.view.focus();
  return true;
}

export function canDeleteMatchingPair(editor: Editor, pairPos: number): boolean {
  try {
    const pair = editor.state.doc.nodeAt(pairPos);
    const $pair = editor.state.doc.resolve(pairPos);
    return Boolean(
      pair?.type.name === "matching_pair" &&
      $pair.parent.type.name === "matching_pairs_group" &&
      $pair.parent.childCount > 1,
    );
  } catch {
    return false;
  }
}

export function deleteMatchingPair(editor: Editor, pairPos: number): boolean {
  if (!canDeleteMatchingPair(editor, pairPos)) return false;
  const pair = editor.state.doc.nodeAt(pairPos);
  if (!pair) return false;
  const tr = editor.state.tr.delete(pairPos, pairPos + pair.nodeSize);
  synchronizeMatchingAssessmentsInTransaction(tr);
  setSelectionNear(tr, pairPos);
  editor.view.dispatch(tr.scrollIntoView());
  editor.view.focus();
  return true;
}

export function moveMatchingPair(
  editor: Editor,
  pairPos: number,
  direction: MatchingMoveDirection,
): boolean {
  const target = matchingMoveTarget(editor, pairPos, direction);
  if (!target) return false;
  const tr = editor.state.tr.replaceWith(target.from, target.to, Fragment.fromArray(target.nodes));
  synchronizeMatchingAssessmentsInTransaction(tr);
  setSelectionNear(
    tr,
    direction === "up" ? target.from + 2 : target.to - target.nodes[1]!.nodeSize + 2,
  );
  editor.view.dispatch(tr.scrollIntoView());
  editor.view.focus();
  return true;
}

export function setMatchingPairFeedback(
  editor: Editor,
  pairPos: number,
  itemId: string,
  feedback: AssessmentFeedbackContent | null,
): boolean {
  if (!itemId.trim()) return false;
  const block = findMatchingBlock(editor.state.doc, pairPos);
  if (!block) return false;
  const assessment = MatchingPrivateAssessmentSchema.parse(block.node.attrs["assessment"] ?? {});
  const feedbackByItemId = { ...assessment.feedbackByItemId };
  if (feedback) feedbackByItemId[itemId] = feedback;
  else delete feedbackByItemId[itemId];
  const tr = editor.state.tr.setNodeMarkup(block.pos, undefined, {
    ...block.node.attrs,
    assessment: { ...assessment, feedbackByItemId },
  });
  editor.view.dispatch(tr);
  return true;
}

/** Keeps pair identities and item-keyed feedback aligned in one history step. */
export function synchronizeMatchingAssessmentsInTransaction(tr: Transaction): Transaction {
  const blocks: MatchingBlockLocation[] = [];
  tr.doc.descendants((node, pos) => {
    if (node.type.name !== "matching") return true;
    blocks.push({ node, pos });
    return false;
  });

  for (const block of blocks) {
    const assessment = MatchingPrivateAssessmentSchema.parse(block.node.attrs["assessment"] ?? {});
    const group = directGroup(block);
    if (!group) continue;
    const feedbackByItemId: Record<string, AssessmentFeedbackContent> = {};
    const seenItemIds = new Set<string>();
    const seenTargetIds = new Set<string>();

    group.node.forEach((pair, offset) => {
      if (pair.type.name !== "matching_pair") return;
      const pairPos = group.pos + 1 + offset;
      const originalItemId = stringAttr(pair, "itemId");
      const originalTargetId = stringAttr(pair, "targetId");
      const keepItemId = originalItemId.trim().length > 0 && !seenItemIds.has(originalItemId);
      const keepTargetId =
        originalTargetId.trim().length > 0 && !seenTargetIds.has(originalTargetId);
      const itemId = keepItemId ? originalItemId : createStableId();
      const targetId = keepTargetId ? originalTargetId : createStableId();
      seenItemIds.add(itemId);
      seenTargetIds.add(targetId);
      if (itemId !== originalItemId || targetId !== originalTargetId) {
        tr.setNodeMarkup(pairPos, undefined, { ...pair.attrs, itemId, targetId });
      }
      if (keepItemId) {
        const feedback = assessment.feedbackByItemId[originalItemId];
        if (feedback) feedbackByItemId[itemId] = feedback;
      }
    });

    const feedbackIds = Object.keys(assessment.feedbackByItemId);
    const changed =
      feedbackIds.length !== Object.keys(feedbackByItemId).length ||
      feedbackIds.some((id) => feedbackByItemId[id] !== assessment.feedbackByItemId[id]);
    if (!changed) continue;
    const currentBlock = tr.doc.nodeAt(block.pos);
    if (!currentBlock || currentBlock.type.name !== "matching") continue;
    tr.setNodeMarkup(block.pos, undefined, {
      ...currentBlock.attrs,
      assessment: { ...assessment, feedbackByItemId },
    });
  }
  return tr;
}

function matchingMoveTarget(editor: Editor, pos: number, direction: MatchingMoveDirection) {
  try {
    const resolved = editor.state.doc.resolve(pos);
    const parent = resolved.parent;
    const index = resolved.index();
    const node = parent.child(index);
    if (node.type.name !== "matching_pair" || parent.type.name !== "matching_pairs_group") {
      return null;
    }
    if (direction === "up") {
      if (index <= 0) return null;
      const previous = parent.child(index - 1);
      return { from: pos - previous.nodeSize, to: pos + node.nodeSize, nodes: [node, previous] };
    }
    if (index >= parent.childCount - 1) return null;
    const next = parent.child(index + 1);
    return { from: pos, to: pos + node.nodeSize + next.nodeSize, nodes: [next, node] };
  } catch {
    return null;
  }
}

function directGroup(block: MatchingBlockLocation): { node: ProseMirrorNode; pos: number } | null {
  let group: { node: ProseMirrorNode; pos: number } | null = null;
  block.node.forEach((child, offset) => {
    if (child.type.name === "matching_pairs_group") {
      group = { node: child, pos: block.pos + 1 + offset };
    }
  });
  return group;
}

function findMatchingBlock(doc: ProseMirrorNode, pos: number): MatchingBlockLocation | null {
  try {
    const resolved = doc.resolve(pos);
    for (let depth = resolved.depth; depth > 0; depth -= 1) {
      const node = resolved.node(depth);
      if (node.type.name === "matching") return { node, pos: resolved.before(depth) };
    }
  } catch {
    return null;
  }
  return null;
}

function stringAttr(node: ProseMirrorNode, name: string): string {
  return typeof node.attrs[name] === "string" ? node.attrs[name] : "";
}

function setSelectionNear(tr: Transaction, pos: number): void {
  try {
    tr.setSelection(
      Selection.near(tr.doc.resolve(Math.max(0, Math.min(pos, tr.doc.content.size)))),
    );
  } catch {
    // The structural edit remains valid if a schema-specific selection cannot be restored.
  }
}
