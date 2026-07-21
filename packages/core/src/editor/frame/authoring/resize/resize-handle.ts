import type { ResizableNodeViewDirection } from "@tiptap/core";

import {
  AuthoringChromeKind,
  AUTHORING_CHROME_ATTR,
  AUTHORING_RESIZE_HANDLE_ATTR,
} from "../../../interactions/dom/authoring-chrome";

export const DEFAULT_RESIZE_HANDLE_DIRECTIONS: ResizableNodeViewDirection[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
  "right",
];

const RESIZE_HANDLE_DESCRIPTION = "Drag to resize this block.";
const RESIZE_HANDLE_DESCRIPTION_ID = "scaffold-resize-handle-description";

const RESIZE_HANDLE_LABEL_BY_DIRECTION: Partial<Record<ResizableNodeViewDirection, string>> = {
  bottom: "Resize block from bottom edge",
  "bottom-left": "Resize block from bottom-left corner",
  "bottom-right": "Resize block from bottom-right corner",
  left: "Resize block from left edge",
  right: "Resize block from right edge",
  top: "Resize block from top edge",
  "top-left": "Resize block from top-left corner",
  "top-right": "Resize block from top-right corner",
};

export function resizeHandleAccessibleLabel(direction: ResizableNodeViewDirection): string {
  return RESIZE_HANDLE_LABEL_BY_DIRECTION[direction] ?? "Resize block";
}

export function resizeHandleAccessibleDescription(): string {
  return RESIZE_HANDLE_DESCRIPTION;
}

export function createResizeHandle(direction: ResizableNodeViewDirection): HTMLElement {
  const handle = document.createElement("button");
  const descriptionId = ensureResizeHandleDescriptionElement(document);

  handle.type = "button";
  handle.contentEditable = "false";
  handle.setAttribute(AUTHORING_RESIZE_HANDLE_ATTR, direction);
  handle.setAttribute(AUTHORING_CHROME_ATTR, AuthoringChromeKind.Resize);
  handle.setAttribute("aria-label", resizeHandleAccessibleLabel(direction));
  handle.setAttribute("aria-describedby", descriptionId);
  handle.style.position = "absolute";
  handle.style.zIndex = "1";
  handle.style.width = "24px";
  handle.style.height = "24px";
  handle.style.border = "0";
  handle.style.borderRadius = "9999px";
  handle.style.background = "transparent";
  handle.style.boxShadow = "none";
  handle.style.padding = "0";

  if (direction === "top-left") {
    handle.style.left = "0";
    handle.style.top = "0";
    handle.style.transform = "translate(-50%, -50%)";
    handle.style.cursor = "nwse-resize";
    return handle;
  }

  if (direction === "top-right") {
    handle.style.right = "0";
    handle.style.top = "0";
    handle.style.transform = "translate(50%, -50%)";
    handle.style.cursor = "nesw-resize";
    return handle;
  }

  if (direction === "bottom-left") {
    handle.style.left = "0";
    handle.style.bottom = "0";
    handle.style.transform = "translate(-50%, 50%)";
    handle.style.cursor = "nesw-resize";
    return handle;
  }

  if (direction === "left") {
    handle.style.left = "0";
    handle.style.top = "50%";
    handle.style.transform = "translate(-50%, -50%)";
    handle.style.cursor = "ew-resize";
    return handle;
  }

  if (direction === "right") {
    handle.style.right = "0";
    handle.style.top = "50%";
    handle.style.transform = "translate(50%, -50%)";
    handle.style.cursor = "ew-resize";
    return handle;
  }

  if (direction === "bottom-right") {
    handle.style.right = "0";
    handle.style.bottom = "0";
    handle.style.transform = "translate(50%, 50%)";
    handle.style.cursor = "nwse-resize";
    return handle;
  }

  return handle;
}

export function isResizeHandleEvent(event: Event): boolean {
  return (
    event.target instanceof Element &&
    Boolean(event.target.closest(`[${AUTHORING_RESIZE_HANDLE_ATTR}]`))
  );
}

function ensureResizeHandleDescriptionElement(ownerDocument: Document): string {
  const existing = ownerDocument.getElementById(RESIZE_HANDLE_DESCRIPTION_ID);
  if (existing) return existing.id;

  const description = ownerDocument.createElement("span");
  description.id = RESIZE_HANDLE_DESCRIPTION_ID;
  description.textContent = RESIZE_HANDLE_DESCRIPTION;
  description.setAttribute("data-authoring-resize-handle-description", "");
  description.hidden = true;
  description.style.position = "absolute";
  description.style.width = "1px";
  description.style.height = "1px";
  description.style.padding = "0";
  description.style.margin = "-1px";
  description.style.overflow = "hidden";
  description.style.clip = "rect(0, 0, 0, 0)";
  description.style.whiteSpace = "nowrap";
  description.style.border = "0";

  (ownerDocument.body ?? ownerDocument.documentElement).append(description);
  return description.id;
}
