import type { Editor } from "@tiptap/core";
import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";

export type SiblingMoveDirection = "up" | "down";
export type SiblingMovePlacement = "before" | "after";

export function canMoveSiblingNode(
  editor: Editor,
  pos: number,
  direction: SiblingMoveDirection,
): boolean {
  const target = getSiblingMoveTarget(editor, pos, direction);
  return target !== null;
}

export function moveSiblingNode(
  editor: Editor,
  pos: number,
  direction: SiblingMoveDirection,
): boolean {
  const target = getSiblingMoveTarget(editor, pos, direction);
  if (!target) return false;

  const { state, view } = editor;
  const tr = state.tr.replaceWith(target.from, target.to, Fragment.fromArray(target.nodes));
  view.dispatch(tr.scrollIntoView());
  return true;
}

export function canMoveSiblingNodeTo(
  editor: Editor,
  sourcePos: number,
  targetPos: number,
  placement: SiblingMovePlacement,
): boolean {
  return getTargetedSiblingMove(editor, sourcePos, targetPos, placement) !== null;
}

export function moveSiblingNodeTo(
  editor: Editor,
  sourcePos: number,
  targetPos: number,
  placement: SiblingMovePlacement,
): boolean {
  const target = getTargetedSiblingMove(editor, sourcePos, targetPos, placement);
  if (!target) return false;

  const { state, view } = editor;
  const tr = state.tr.replaceWith(target.from, target.to, Fragment.fromArray(target.nodes));
  view.dispatch(tr.scrollIntoView());
  return true;
}

function getSiblingMoveTarget(editor: Editor, pos: number, direction: SiblingMoveDirection) {
  const { doc } = editor.state;
  let resolved;
  try {
    resolved = doc.resolve(pos);
  } catch {
    return null;
  }

  const parent = resolved.parent;
  const index = resolved.index();
  const node = parent.child(index);

  if (direction === "up") {
    if (index <= 0) return null;
    const previous = parent.child(index - 1);
    return {
      from: pos - previous.nodeSize,
      to: pos + node.nodeSize,
      nodes: [node, previous],
    };
  }

  if (index >= parent.childCount - 1) return null;
  const next = parent.child(index + 1);
  return {
    from: pos,
    to: pos + node.nodeSize + next.nodeSize,
    nodes: [next, node],
  };
}

function getTargetedSiblingMove(
  editor: Editor,
  sourcePos: number,
  targetPos: number,
  placement: SiblingMovePlacement,
) {
  const source = resolveDirectChild(editor, sourcePos);
  const target = resolveDirectChild(editor, targetPos);
  if (!source || !target) return null;
  if (source.pos === target.pos) return null;
  if (source.parent !== target.parent) return null;
  if (source.parentPos !== target.parentPos) return null;

  if (placement === "before" && source.index === target.index - 1) {
    return null;
  }

  if (placement === "after" && source.index === target.index + 1) {
    return null;
  }

  const nodes: ProseMirrorNode[] = [];
  source.parent.forEach((child) => nodes.push(child));

  const [moved] = nodes.splice(source.index, 1);
  if (!moved) return null;

  let insertIndex = target.index;
  if (source.index < target.index) insertIndex -= 1;
  if (placement === "after") insertIndex += 1;

  nodes.splice(insertIndex, 0, moved);

  return {
    from: source.contentStart,
    nodes,
    to: source.contentEnd,
  };
}

function resolveDirectChild(editor: Editor, pos: number) {
  const { doc } = editor.state;

  try {
    const node = doc.nodeAt(pos);
    if (!node) return null;

    const resolved = doc.resolve(pos);
    if (resolved.depth < 1) return null;

    const parent = resolved.parent;
    const index = resolved.index();
    if (index >= parent.childCount) return null;
    if (parent.child(index) !== node) return null;

    const parentPos = resolved.before(resolved.depth);
    const contentStart = parentPos + 1;
    const contentEnd = contentStart + parent.content.size;

    return {
      contentEnd,
      contentStart,
      index,
      node,
      parent,
      parentPos,
      pos,
    };
  } catch {
    return null;
  }
}
