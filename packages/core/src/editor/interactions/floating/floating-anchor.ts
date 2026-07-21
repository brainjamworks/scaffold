import { resolveVisibleAuthoringAnchorRect } from "@/editor/interactions/dom/authoring-anchor-visibility";
import type { VisibleAuthoringAnchorOptions } from "@/editor/interactions/dom/authoring-anchor-visibility";

export interface FloatingVirtualReference {
  contextElement?: Element;
  getBoundingClientRect: () => DOMRectReadOnly;
  getClientRects?: () => DOMRectReadOnly[];
}

export interface FloatingAnchorSnapshot {
  rect: DOMRectReadOnly;
  reference: Element | FloatingVirtualReference;
  visibleRect: DOMRectReadOnly;
}

export type FloatingAnchor = ElementFloatingAnchor | VirtualFloatingAnchor;

export interface ElementFloatingAnchor {
  element: Element | null;
  kind: "element";
  root?: Element | null;
}

export interface VirtualFloatingAnchor {
  getBoundingClientRect: () => DOMRectReadOnly | null;
  kind: "virtual";
  contextElement?: Element | null;
  root?: Element | null;
  visibilityElement?: Element | null;
}

export interface FloatingAnchorOptions {
  root?: Element | null;
}

export interface VirtualFloatingAnchorInput extends FloatingAnchorOptions {
  contextElement?: Element | null;
  getBoundingClientRect: () => DOMRectReadOnly | null;
  visibilityElement?: Element | null;
}

export function createElementFloatingAnchor(
  element: Element | null,
  options: FloatingAnchorOptions = {},
): ElementFloatingAnchor {
  return {
    element,
    kind: "element",
    ...(options.root !== undefined ? { root: options.root } : {}),
  };
}

export function createVirtualFloatingAnchor(
  input: VirtualFloatingAnchorInput,
): VirtualFloatingAnchor {
  return {
    getBoundingClientRect: input.getBoundingClientRect,
    kind: "virtual",
    ...(input.contextElement !== undefined ? { contextElement: input.contextElement } : {}),
    ...(input.root !== undefined ? { root: input.root } : {}),
    ...(input.visibilityElement !== undefined
      ? { visibilityElement: input.visibilityElement }
      : {}),
  };
}

export function resolveFloatingAnchorSnapshot(
  anchor: FloatingAnchor | null | undefined,
): FloatingAnchorSnapshot | null {
  if (!anchor) return null;

  if (anchor.kind === "element") {
    return resolveElementFloatingAnchorSnapshot(anchor);
  }

  return resolveVirtualFloatingAnchorSnapshot(anchor);
}

export function resolveFloatingAnchorReference(
  anchor: FloatingAnchor | null | undefined,
): Element | FloatingVirtualReference | null {
  if (!anchor) return null;

  if (anchor.kind === "element") {
    return anchor.element?.isConnected ? anchor.element : null;
  }

  return resolveVirtualFloatingAnchorReference(anchor);
}

function resolveElementFloatingAnchorSnapshot(
  anchor: ElementFloatingAnchor,
): FloatingAnchorSnapshot | null {
  if (!anchor.element?.isConnected) return null;

  const rawRect = anchor.element.getBoundingClientRect();
  const visibleRect = resolveVisibleAuthoringAnchorRect(
    anchor.element,
    visibleAuthoringAnchorOptions(anchor.root),
  );
  if (!visibleRect) return null;

  return {
    rect: rawRect,
    reference: anchor.element,
    visibleRect,
  };
}

function resolveVirtualFloatingAnchorSnapshot(
  anchor: VirtualFloatingAnchor,
): FloatingAnchorSnapshot | null {
  if (anchor.contextElement && !anchor.contextElement.isConnected) return null;
  if (anchor.visibilityElement && !anchor.visibilityElement.isConnected) return null;

  const rawRect = anchor.getBoundingClientRect();
  if (!rawRect) return null;
  if (isEmptyRect(rawRect) && !anchor.visibilityElement) return null;

  const visibleRect = resolveVirtualAnchorVisibleRect(anchor, rawRect);
  if (!visibleRect) return null;

  return {
    rect: rawRect,
    reference: createResolvedVirtualReference(anchor),
    visibleRect,
  };
}

function resolveVirtualFloatingAnchorReference(
  anchor: VirtualFloatingAnchor,
): FloatingVirtualReference | null {
  if (anchor.contextElement && !anchor.contextElement.isConnected) return null;
  if (anchor.visibilityElement && !anchor.visibilityElement.isConnected) return null;

  const rawRect = anchor.getBoundingClientRect();
  if (!rawRect) return null;
  if (isEmptyRect(rawRect) && !anchor.visibilityElement) return null;

  return createResolvedVirtualReference(anchor);
}

function resolveVirtualAnchorVisibleRect(
  anchor: VirtualFloatingAnchor,
  rawRect: DOMRectReadOnly,
): DOMRectReadOnly | null {
  if (
    anchor.visibilityElement &&
    !resolveVisibleAuthoringAnchorRect(
      anchor.visibilityElement,
      visibleAuthoringAnchorOptions(anchor.root),
    )
  ) {
    return null;
  }

  if (isEmptyRect(rawRect)) return rawRect;

  return resolveVisibleVirtualRect(rawRect, anchor);
}

function visibleAuthoringAnchorOptions(
  root: Element | null | undefined,
): VisibleAuthoringAnchorOptions {
  return root === undefined ? {} : { root };
}

function createResolvedVirtualReference(anchor: VirtualFloatingAnchor): FloatingVirtualReference {
  return {
    ...(anchor.contextElement ? { contextElement: anchor.contextElement } : {}),
    getBoundingClientRect: () => anchor.getBoundingClientRect() ?? emptyVirtualRect(anchor),
    getClientRects: () => {
      const rect = anchor.getBoundingClientRect();
      return rect ? [rect] : [];
    },
  };
}

function resolveVisibleVirtualRect(
  rawRect: DOMRectReadOnly,
  anchor: VirtualFloatingAnchor,
): DOMRectReadOnly | null {
  let visibleRect: RectLike | null = rectFromRect(rawRect);
  const ownerWindow = ownerWindowForVirtualAnchor(anchor);
  if (ownerWindow) {
    visibleRect = intersectRects(visibleRect, {
      bottom: ownerWindow.innerHeight,
      left: 0,
      right: ownerWindow.innerWidth,
      top: 0,
    });
    if (!visibleRect) return null;
  }

  if (anchor.root) {
    visibleRect = intersectRects(visibleRect, rectFromRect(anchor.root.getBoundingClientRect()));
    if (!visibleRect) return null;
  }

  return rectsEqual(visibleRect, rectFromRect(rawRect))
    ? rawRect
    : domRectFromRectLike(visibleRect, ownerWindow);
}

function ownerWindowForVirtualAnchor(anchor: VirtualFloatingAnchor): Window | null {
  return (
    anchor.contextElement?.ownerDocument.defaultView ??
    anchor.visibilityElement?.ownerDocument.defaultView ??
    anchor.root?.ownerDocument.defaultView ??
    (typeof window === "undefined" ? null : window)
  );
}

function emptyVirtualRect(anchor: VirtualFloatingAnchor): DOMRectReadOnly {
  return domRectFromRectLike(
    {
      bottom: 0,
      left: 0,
      right: 0,
      top: 0,
    },
    ownerWindowForVirtualAnchor(anchor),
  );
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

function isEmptyRect(rect: DOMRectReadOnly): boolean {
  return rect.width === 0 && rect.height === 0;
}

function domRectFromRectLike(rect: RectLike, ownerWindow: Window | null): DOMRectReadOnly {
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  const DOMRectConstructor =
    (ownerWindow as { DOMRect?: typeof DOMRect } | null)?.DOMRect ?? DOMRect;
  return new DOMRectConstructor(rect.left, rect.top, width, height);
}
