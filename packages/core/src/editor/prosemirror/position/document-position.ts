import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

export function isValidDocPos(doc: ProseMirrorNode, pos: number | null | undefined): pos is number {
  return typeof pos === "number" && Number.isInteger(pos) && pos >= 0 && pos <= doc.content.size;
}

export function isValidEditorDocPos(editor: Editor, pos: number | null | undefined): pos is number {
  return isValidDocPos(editor.state.doc, pos);
}
