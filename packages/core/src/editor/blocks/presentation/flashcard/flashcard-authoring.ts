import type { Editor } from "@tiptap/core";

import { moveSiblingNodeTo } from "@/editor/prosemirror/move-sibling/move-sibling-node";
import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";

import { FLASHCARD_NODE } from "./content";
import { readNodeViewPos } from "./flashcard-node-view";

export function reorderFlashcardCard({
  editor,
  getPos,
  sourceId,
  targetId,
}: {
  readonly editor: Editor;
  readonly getPos: (() => number | undefined) | undefined;
  readonly sourceId: string;
  readonly targetId: string;
}): boolean {
  const deckPos = getPos ? readNodeViewPos(getPos) : null;
  if (!isValidEditorDocPos(editor, deckPos) || sourceId === targetId) return false;
  const deck = editor.state.doc.nodeAt(deckPos);
  if (!deck || deck.type.name !== FLASHCARD_NODE) return false;

  let sourceIndex = -1;
  let targetIndex = -1;
  let sourcePos = deckPos + 1;
  let targetPos = deckPos + 1;
  let childPos = deckPos + 1;
  for (let index = 0; index < deck.childCount; index += 1) {
    const card = deck.child(index);
    if (card.attrs["id"] === sourceId) {
      sourceIndex = index;
      sourcePos = childPos;
    }
    if (card.attrs["id"] === targetId) {
      targetIndex = index;
      targetPos = childPos;
    }
    childPos += card.nodeSize;
  }
  if (sourceIndex < 0 || targetIndex < 0) return false;

  return moveSiblingNodeTo(
    editor,
    sourcePos,
    targetPos,
    sourceIndex < targetIndex ? "after" : "before",
  );
}
