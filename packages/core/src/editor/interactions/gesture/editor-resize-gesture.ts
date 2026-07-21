import type { Editor } from "@tiptap/core";

export const RESIZE_GESTURE_ACTIVE_ATTR = "data-scaffold-resize-gesture-active";
export const RESIZE_GESTURE_ACTIVE_CHANGE_EVENT = "scaffold:resize-gesture-active-change";

export function isEditorResizeGestureActive(editor: Pick<Editor, "view">): boolean {
  return editor.view.dom.hasAttribute(RESIZE_GESTURE_ACTIVE_ATTR);
}

export function setEditorResizeGestureActive(editor: Pick<Editor, "view">, active: boolean): void {
  const wasActive = isEditorResizeGestureActive(editor);
  editor.view.dom.toggleAttribute(RESIZE_GESTURE_ACTIVE_ATTR, active);
  const isActive = isEditorResizeGestureActive(editor);
  if (wasActive === isActive) return;

  editor.view.dom.dispatchEvent(
    new CustomEvent(RESIZE_GESTURE_ACTIVE_CHANGE_EVENT, {
      bubbles: true,
      detail: { active: isActive },
    }),
  );
}
