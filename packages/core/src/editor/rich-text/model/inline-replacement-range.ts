import type { Editor } from "@tiptap/core";

import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";

export function isInlineReplacementRange(editor: Editor, from: number, to: number): boolean {
  if (!isValidEditorDocPos(editor, from) || !isValidEditorDocPos(editor, to) || to < from) {
    return false;
  }

  const $from = editor.state.doc.resolve(from);
  const $to = editor.state.doc.resolve(to);
  if (!$from.parent.inlineContent || !$to.parent.inlineContent) return false;

  return $from.parent === $to.parent;
}
