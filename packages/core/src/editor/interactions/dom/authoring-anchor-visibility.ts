export interface VisibleAuthoringAnchorOptions {
  root?: Element | null;
}

export function resolveVisibleAuthoringAnchorRect(
  anchor: Element,
  options: VisibleAuthoringAnchorOptions = {},
): DOMRectReadOnly | null {
  const rect = anchor.getBoundingClientRect();
  if (!rect.width && !rect.height) return null;

  const originalRect = rectFromRect(rect);
  let visibleRect: RectLike | null = originalRect;
  const ownerWindow = anchor.ownerDocument.defaultView;
  if (ownerWindow) {
    visibleRect = intersectRects(visibleRect, {
      bottom: ownerWindow.innerHeight,
      left: 0,
      right: ownerWindow.innerWidth,
      top: 0,
    });
    if (!visibleRect) return null;
  }

  if (options.root) {
    visibleRect = intersectRects(visibleRect, rectFromRect(options.root.getBoundingClientRect()));
    if (!visibleRect) return null;
  }

  for (
    let ancestor = anchor.parentElement;
    ancestor && ancestor !== options.root;
    ancestor = ancestor.parentElement
  ) {
    if (!clipsOverflow(ancestor)) continue;
    visibleRect = intersectRects(visibleRect, rectFromRect(ancestor.getBoundingClientRect()));
    if (!visibleRect) return null;
  }

  if (rectsEqual(visibleRect, originalRect)) return rect;
  return domRectFromRectLike(visibleRect, ownerWindow);
}

interface RectLike {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

function rectFromRect(rect: DOMRectReadOnly): RectLike {
  return {
    bottom: rect.bottom,
    left: rect.left,
    right: rect.right,
    top: rect.top,
  };
}

function intersectRects(a: RectLike, b: RectLike): RectLike | null {
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  const left = Math.max(a.left, b.left);

  if (right <= left || bottom <= top) return null;
  return { bottom, left, right, top };
}

function rectsEqual(a: RectLike, b: RectLike): boolean {
  return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;
}

function domRectFromRectLike(rect: RectLike, ownerWindow: Window | null): DOMRectReadOnly {
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  const DOMRectConstructor =
    (ownerWindow as { DOMRect?: typeof DOMRect } | null)?.DOMRect ?? DOMRect;
  return new DOMRectConstructor(rect.left, rect.top, width, height);
}

function clipsOverflow(element: Element): boolean {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!style) return false;

  return (
    clipsOverflowValue(style.overflow) ||
    clipsOverflowValue(style.overflowX) ||
    clipsOverflowValue(style.overflowY)
  );
}

function clipsOverflowValue(value: string): boolean {
  return value === "auto" || value === "clip" || value === "hidden" || value === "scroll";
}
