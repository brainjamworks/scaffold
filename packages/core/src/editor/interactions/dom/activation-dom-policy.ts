import {
  AUTHORING_MOVE_HANDLE_ATTR,
  AUTHORING_RESIZE_HANDLE_ATTR,
  isAuthoringChromeTarget,
} from "./authoring-chrome";
import { AUTHORING_FRAME_ATTR, AUTHORING_FRAME_EDITABLE_ATTR } from "./authoring-frame";

export { isAuthoringChromeTarget };

const IGNORED_INTERACTIVE_SELECTOR = [
  "button",
  "a[href]",
  "input",
  "select",
  "textarea",
  '[role="button"]',
  '[role="checkbox"]',
  '[role="combobox"]',
  '[role="dialog"]',
  '[role="link"]',
  '[role="listbox"]',
  '[role="menu"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="radio"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="switch"]',
  '[role="tab"]',
  `[${AUTHORING_MOVE_HANDLE_ATTR}]`,
  `[${AUTHORING_RESIZE_HANDLE_ATTR}]`,
  "[data-no-select]",
].join(", ");

export function isPlainPrimaryMouseDown(
  event: Pick<MouseEvent, "altKey" | "button" | "ctrlKey" | "metaKey" | "shiftKey">,
): boolean {
  return event.button === 0 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

export function isIgnoredInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (isAuthoringChromeTarget(target)) return true;
  return Boolean(target.closest(IGNORED_INTERACTIVE_SELECTOR));
}

export function isAuthoredEditableTarget(target: EventTarget | null, editorRoot: Element): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('[contenteditable="false"]')) return false;
  if (target.hasAttribute(AUTHORING_FRAME_ATTR)) return false;
  if (target.closest(`[${AUTHORING_FRAME_EDITABLE_ATTR}]`)) return true;

  const editableHost = target.closest('[contenteditable="true"]');
  if (editableHost && editableHost !== editorRoot) return true;

  return isNestedNodeViewContentTarget(target);
}

function isNestedNodeViewContentTarget(target: Element): boolean {
  const content = target.closest("[data-node-view-content], [data-node-view-content-react]");
  if (!content) return false;
  if (target === content) return false;

  const closestFrame = target.closest(`[${AUTHORING_FRAME_ATTR}]`);
  if (closestFrame) {
    return closestFrame.contains(content);
  }

  const surfaceContent = target.closest("[data-surface-content]");
  if (!surfaceContent) return true;

  if (content !== surfaceContent && content.parentElement !== surfaceContent) {
    return true;
  }

  // Direct surface content: authored textblocks (paragraphs, headings) are
  // editable content, while the content container itself is blank structural
  // surface space and framed children own their own activation.
  if (target === surfaceContent) return false;

  return true;
}
