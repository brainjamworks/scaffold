import type { Editor } from "@tiptap/core";

import {
  setNodeSelectionInTransaction,
  setTextSelectionNearInTransaction,
} from "./selection-transactions";

export function focusTextSelectionNear(
  editor: Editor,
  pos: number,
  options: { bias?: number; scrollIntoView?: boolean } = {},
): boolean {
  const tr = editor.state.tr;
  if (!setTextSelectionNearInTransaction(tr, pos, options.bias ?? 1)) {
    return false;
  }

  editor.view.dispatch(options.scrollIntoView === false ? tr : tr.scrollIntoView());
  editor.view.focus();
  return true;
}

export function selectNodeAt(
  editor: Editor,
  pos: number,
  options: { focus?: boolean; scrollIntoView?: boolean } = {},
): boolean {
  const tr = editor.state.tr;
  if (!setNodeSelectionInTransaction(tr, pos)) return false;

  editor.view.dispatch(options.scrollIntoView === false ? tr : tr.scrollIntoView());
  if (options.focus === true) {
    editor.view.focus();
  }
  return true;
}
