import type { Editor } from "@tiptap/core";
import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Selection, type Transaction } from "@tiptap/pm/state";
import {
  MatchingPrivateAssessmentSchema,
  type AssessmentFeedbackContent,
} from "@scaffold/contracts";

import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { matchingPairContent } from "@/editor/assessment/matching/matching-fields-shared";

type MatchingMoveDirection = "up" | "down";
const SURFACE_MATCHING_QUESTION_NODE_TYPE = "surface_matching_question";

interface MatchingOwnerLocation {
  readonly node: ProseMirrorNode;
  readonly pos: number;
}

export function addMatchingPair(editor: Editor, groupPos: number): boolean {
  const group = editor.state.doc.nodeAt(groupPos);
  if (!group || group.type.name !== "matching_pairs_group") return false;
  const pair = editor.schema.nodeFromJSON({
    type: "matching_pair",
    attrs: { id: createEmbeddedNodeId() },
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
  const owner = findMatchingOwner(editor.state.doc, pairPos);
  if (!owner) return false;
  const assessment = MatchingPrivateAssessmentSchema.parse(owner.node.attrs["assessment"] ?? {});
  const feedbackByItemId = { ...assessment.feedbackByItemId };
  if (feedback) feedbackByItemId[itemId] = feedback;
  else delete feedbackByItemId[itemId];
  const tr = editor.state.tr.setNodeMarkup(owner.pos, undefined, {
    ...owner.node.attrs,
    assessment: { ...assessment, feedbackByItemId },
  });
  editor.view.dispatch(tr);
  return true;
}

/** Keeps pair identities and item-keyed feedback aligned in one history step. */
export function synchronizeMatchingAssessmentsInTransaction(tr: Transaction): Transaction {
  const owners: MatchingOwnerLocation[] = [];
  tr.doc.descendants((node, pos) => {
    if (!isMatchingAssessmentOwner(node)) return true;
    owners.push({ node, pos });
    return false;
  });

  for (const owner of owners) {
    const assessment = MatchingPrivateAssessmentSchema.parse(owner.node.attrs["assessment"] ?? {});
    const group = directGroup(owner);
    if (!group) continue;
    const feedbackByItemId: Record<string, AssessmentFeedbackContent> = {};
    const seenItemIds = new Set<string>();
    const seenTargetIds = new Set<string>();

    group.node.forEach((pair) => {
      if (pair.type.name !== "matching_pair") return;
      const item = directChild(pair, "matching_item");
      const target = directChild(pair, "matching_target");
      const itemId = item ? stringAttr(item, "id") : "";
      const targetId = target ? stringAttr(target, "id") : "";
      const keepItemId = itemId.trim().length > 0 && !seenItemIds.has(itemId);
      const keepTargetId = targetId.trim().length > 0 && !seenTargetIds.has(targetId);
      if (!keepItemId || !keepTargetId) return;
      seenItemIds.add(itemId);
      seenTargetIds.add(targetId);
      const feedback = assessment.feedbackByItemId[itemId];
      if (feedback) feedbackByItemId[itemId] = feedback;
    });

    const feedbackIds = Object.keys(assessment.feedbackByItemId);
    const changed =
      feedbackIds.length !== Object.keys(feedbackByItemId).length ||
      feedbackIds.some((id) => feedbackByItemId[id] !== assessment.feedbackByItemId[id]);
    if (!changed) continue;
    const currentOwner = tr.doc.nodeAt(owner.pos);
    if (!currentOwner || !isMatchingAssessmentOwner(currentOwner)) continue;
    tr.setNodeMarkup(owner.pos, undefined, {
      ...currentOwner.attrs,
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

function directGroup(owner: MatchingOwnerLocation): { node: ProseMirrorNode; pos: number } | null {
  let group: { node: ProseMirrorNode; pos: number } | null = null;
  owner.node.forEach((child, offset) => {
    if (child.type.name === "matching_pairs_group") {
      group = { node: child, pos: owner.pos + 1 + offset };
    }
  });
  return group;
}

function findMatchingOwner(doc: ProseMirrorNode, pos: number): MatchingOwnerLocation | null {
  try {
    const resolved = doc.resolve(pos);
    for (let depth = resolved.depth; depth > 0; depth -= 1) {
      const node = resolved.node(depth);
      if (isMatchingAssessmentOwner(node)) return { node, pos: resolved.before(depth) };
    }
  } catch {
    return null;
  }
  return null;
}

function isMatchingAssessmentOwner(node: ProseMirrorNode): boolean {
  return node.type.name === "matching" || node.type.name === SURFACE_MATCHING_QUESTION_NODE_TYPE;
}

function stringAttr(node: ProseMirrorNode, name: string): string {
  return typeof node.attrs[name] === "string" ? node.attrs[name] : "";
}

function directChild(node: ProseMirrorNode, typeName: string): ProseMirrorNode | null {
  let child: ProseMirrorNode | null = null;
  node.forEach((candidate) => {
    if (!child && candidate.type.name === typeName) child = candidate;
  });
  return child;
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
