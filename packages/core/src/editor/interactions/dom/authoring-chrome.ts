import { isOverlayTargetOwnedBy } from "./overlay-ownership";

export const AUTHORING_CHROME_ATTR = "data-authoring-chrome";
export const AUTHORING_FRAME_RESIZE_MODE_ATTR = "data-authoring-frame-resize-mode";
export const AUTHORING_FRAME_WRAPPER_ATTR = "data-authoring-frame-wrapper";
export const AUTHORING_FRAME_WRAPPER_ACTIVE_ATTR = "data-authoring-frame-wrapper-active";
export const AUTHORING_MOVE_HANDLE_ATTR = "data-authoring-move-handle";
export const AUTHORING_MOVE_POS_ATTR = "data-authoring-move-pos";
export const AUTHORING_RESIZE_HANDLE_ATTR = "data-authoring-resize-handle";

export const AuthoringChromeKind = {
  Bubble: "bubble",
  Handle: "handle",
  Menu: "menu",
  Popover: "popover",
  Portal: "portal",
  Resize: "resize",
  Trigger: "trigger",
} as const;

export type AuthoringChromeKind = (typeof AuthoringChromeKind)[keyof typeof AuthoringChromeKind];

const AUTHORING_CHROME_SELECTOR = `[${AUTHORING_CHROME_ATTR}]`;

export function authoringChromeAttributes(
  kind: AuthoringChromeKind,
): Record<typeof AUTHORING_CHROME_ATTR, AuthoringChromeKind> {
  return { [AUTHORING_CHROME_ATTR]: kind };
}

export function isAuthoringChromeTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(AUTHORING_CHROME_SELECTOR));
}

export function isAuthoringChromeSessionActive(editorRoot: Element): boolean {
  const activeElement = editorRoot.ownerDocument.activeElement;
  return isOverlayTargetOwnedBy(editorRoot, activeElement);
}

export function shouldRenderAuthoringChrome(editorRoot: Element, active: boolean): boolean {
  return active && isAuthoringChromeSessionActive(editorRoot);
}
