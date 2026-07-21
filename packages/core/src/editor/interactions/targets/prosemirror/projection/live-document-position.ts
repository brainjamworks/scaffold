import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";

export function findLiveDocumentNodeAtPos(
  state: EditorState,
  pos: number,
): { node: ProseMirrorNode; pos: number } | null {
  if (!isLiveDocumentNodePosition(state, pos)) return null;

  const node = state.doc.nodeAt(pos);
  return node ? { node, pos } : null;
}

export function resolveLiveDocumentPosition(state: EditorState, pos: number): ResolvedPos | null {
  if (!isResolvableDocumentPosition(state, pos)) return null;

  return state.doc.resolve(pos);
}

function isLiveDocumentNodePosition(state: EditorState, pos: number): boolean {
  return Number.isInteger(pos) && pos >= 0 && pos < state.doc.content.size;
}

function isResolvableDocumentPosition(state: EditorState, pos: number): boolean {
  return Number.isInteger(pos) && pos >= 0 && pos <= state.doc.content.size;
}
