import type { Editor } from "@tiptap/core";

import { isValidEditorDocPos } from "./document-position";

export function safeGetPos(getPos: () => number | undefined): number | undefined {
  try {
    return getPos();
  } catch {
    return undefined;
  }
}

export function currentNodeViewPos(
  editor: Editor,
  getPos: () => number | undefined,
  typeName: string,
): number | null {
  const pos = safeGetPos(getPos);
  if (!isValidEditorDocPos(editor, pos)) return null;
  const node = editor.state.doc.nodeAt(pos);
  return node?.type.name === typeName ? pos : null;
}
