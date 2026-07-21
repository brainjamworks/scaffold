import type { Editor } from "@tiptap/core";

import { isEditorResizeGestureActive } from "@/editor/interactions/gesture/editor-resize-gesture";
import { isNodeSelection, isTextSelection } from "@/editor/selection/selection-facts";

export interface RichTextBubbleVisibilityInput {
  editor: Editor;
  state: Editor["state"];
}

const EDITABLE_RICH_TEXT_ATOM_NODES = new Set(["inlineIcon", "vocabTerm"]);

export function shouldShowRichTextBubbleMenu({
  editor,
  state,
}: RichTextBubbleVisibilityInput): boolean {
  if (!editor.isEditable) return false;
  if (isEditorResizeGestureActive(editor)) return false;

  const { selection } = state;
  if (isTextSelection(selection)) return !selection.empty;
  if (isNodeSelection(selection)) {
    return EDITABLE_RICH_TEXT_ATOM_NODES.has(selection.node.type.name);
  }

  return false;
}
