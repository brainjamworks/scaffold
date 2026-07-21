import { zIndex } from "@/ui/overlays/z-index";

export interface BubbleVirtualElement {
  contextElement: Element;
  getBoundingClientRect: () => DOMRect;
  getClientRects: () => DOMRect[];
}

export function createBubbleVirtualElement(anchor: Element | null): BubbleVirtualElement | null {
  if (!anchor) return null;

  return {
    contextElement: anchor,
    getBoundingClientRect: () => anchor.getBoundingClientRect(),
    getClientRects: () => [anchor.getBoundingClientRect()],
  };
}

export function createBubbleVirtualElementFromRect({
  contextElement,
  getBoundingClientRect,
}: {
  contextElement: Element | null;
  getBoundingClientRect: () => DOMRectReadOnly | null;
}): BubbleVirtualElement | null {
  if (!contextElement) return null;

  const readRect = () => {
    const rect = getBoundingClientRect();
    return rect ? domRectFromRectLike(rect) : new DOMRect();
  };

  return {
    contextElement,
    getBoundingClientRect: readRect,
    getClientRects: () => [readRect()],
  };
}

export function resolveNodeViewAnchorElement(dom: Element, selectors: string): Element {
  if (dom.matches(selectors)) return dom;
  return dom.querySelector(selectors) ?? dom;
}

export function findDataAnchorElement(
  attribute: string,
  anchorId: string | undefined,
): Element | null {
  if (!anchorId || typeof document === "undefined") return null;

  for (const element of document.querySelectorAll(`[${attribute}]`)) {
    if (element.getAttribute(attribute) === anchorId) return element;
  }

  return null;
}

export function syncBubbleFloatingRoot(element: HTMLElement) {
  syncBubbleFloatingRootAtZIndex(element, zIndex.editorBubble);
}

export function setBubblePlacementReady(element: HTMLElement, ready: boolean): void {
  element.dataset.scaffoldBubblePlacementReady = ready ? "true" : "false";
  element.style.pointerEvents = ready ? "auto" : "none";
  element.style.visibility = ready ? "visible" : "hidden";
}

export function syncBubbleFloatingRootAtZIndex(element: HTMLElement, zIndexValue: number) {
  const candidates = [element, findFloatingPositionedAncestor(element)].filter(
    (candidate): candidate is HTMLElement => candidate instanceof HTMLElement,
  );

  for (const candidate of candidates) {
    candidate.style.zIndex = String(zIndexValue);
    candidate.style.overflow = "visible";
  }
}

function findFloatingPositionedAncestor(element: HTMLElement): HTMLElement | null {
  let current = element.parentElement;
  const ownerBody = element.ownerDocument.body;

  while (current && current !== ownerBody) {
    if (current.hasAttribute("data-scaffold-overlay-host")) return null;
    const position = current.style.position || getComputedStyle(current).position;
    if (position === "fixed" || position === "absolute") return current;
    current = current.parentElement;
  }

  return null;
}

function domRectFromRectLike(rect: DOMRectReadOnly): DOMRect {
  return new DOMRect(rect.left, rect.top, rect.width, rect.height);
}
