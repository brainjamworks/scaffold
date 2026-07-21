import type { EditorView } from "@tiptap/pm/view";

import {
  AUTHORING_CHROME_ATTR,
  AuthoringChromeKind,
} from "@/editor/interactions/dom/authoring-chrome";

import { isNodeSelection } from "./selection-facts";

const NATIVE_DRAG_HANDLE_SELECTOR = [
  `[${AUTHORING_CHROME_ATTR}="${AuthoringChromeKind.Handle}"]`,
  "[data-drag-handle]",
].join(",");

/**
 * Blocks native browser drag of an object-selected block body. Deliberate
 * drags still start from explicit handles matched by the handle selector.
 */
export function preventNativeSelectedBlockDragStart(view: EditorView, event: DragEvent): boolean {
  const { selection } = view.state;
  if (!isNodeSelection(selection)) return false;
  if (!(event.target instanceof Element)) return false;
  if (event.target.closest(NATIVE_DRAG_HANDLE_SELECTOR)) return false;

  const selectedDom = view.nodeDOM(selection.from);
  if (!(selectedDom instanceof Element)) return false;
  if (event.target !== selectedDom && !selectedDom.contains(event.target)) {
    return false;
  }

  event.preventDefault();
  event.stopPropagation();
  return true;
}
