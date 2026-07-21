import type { Placement } from "@floating-ui/dom";
import type { CSSProperties } from "react";

import { createVirtualFloatingAnchor, type FloatingAnchorOptions } from "./floating-anchor";

export type StructuralFloatingPlacement =
  | "middle-left"
  | "middle-right"
  | "top-center"
  | "top-right";

export type StructuralFloatingAlignment = "point" | "centered-on-point" | "end-before-point";

export interface StructuralFloatingGeometry {
  alignment?: StructuralFloatingAlignment;
  blockOffset?: number;
  inlineOffset?: number;
  placement?: StructuralFloatingPlacement;
}

export interface StructuralFloatingTriggerSize {
  height: number;
  width: number;
}

export const STRUCTURAL_FLOATING_POINT_PLACEMENT: Placement = "bottom-start";

export function createStructuralFloatingAnchor(
  frameElement: Element | null,
  geometry: StructuralFloatingGeometry,
  options: FloatingAnchorOptions = {},
) {
  if (!frameElement) return null;

  return createVirtualFloatingAnchor({
    contextElement: frameElement,
    getBoundingClientRect: () =>
      resolveStructuralFloatingPointRect(frameElement.getBoundingClientRect(), geometry),
    visibilityElement: frameElement,
    ...(options.root !== undefined ? { root: options.root } : {}),
  });
}

export function resolveStructuralFloatingPointRect(
  frameRect: DOMRectReadOnly,
  geometry: StructuralFloatingGeometry,
): DOMRectReadOnly {
  const point = resolveStructuralFloatingPoint(frameRect, geometry);
  return domRectFromPoint(frameRect, point.x, point.y);
}

export function resolveStructuralFloatingTriggerRect({
  frameRect,
  geometry,
  size,
}: {
  frameRect: DOMRectReadOnly;
  geometry: StructuralFloatingGeometry;
  size: StructuralFloatingTriggerSize;
}): DOMRectReadOnly {
  const point = resolveStructuralFloatingPoint(frameRect, geometry);
  const alignment = geometry.alignment ?? "point";
  let left = point.x;
  let top = point.y;

  switch (alignment) {
    case "centered-on-point":
      left -= size.width / 2;
      top -= size.height / 2;
      break;
    case "end-before-point":
      left -= size.width;
      top -= size.height / 2;
      break;
    case "point":
      break;
  }

  return domRectFromRectLike(frameRect, {
    bottom: top + size.height,
    left,
    right: left + size.width,
    top,
  });
}

export function resolveStructuralFloatingContentStyle(
  geometry: StructuralFloatingGeometry,
): CSSProperties | undefined {
  const transform = structuralFloatingTransformForAlignment(geometry.alignment);
  return transform ? { transform } : undefined;
}

export function structuralFloatingTransformForAlignment(
  alignment: StructuralFloatingAlignment | undefined,
): string | undefined {
  switch (alignment ?? "point") {
    case "centered-on-point":
      return "translate(-50%, -50%)";
    case "end-before-point":
      return "translate(-100%, -50%)";
    case "point":
      return undefined;
  }
}

function resolveStructuralFloatingPoint(
  frameRect: DOMRectReadOnly,
  geometry: StructuralFloatingGeometry,
): { x: number; y: number } {
  const blockOffset = geometry.blockOffset ?? 0;
  const inlineOffset = geometry.inlineOffset ?? 0;

  switch (geometry.placement ?? "top-right") {
    case "middle-left":
      return {
        x: frameRect.left + inlineOffset,
        y: frameRect.top + frameRect.height / 2 + blockOffset,
      };
    case "middle-right":
      return {
        x: frameRect.right + inlineOffset,
        y: frameRect.top + frameRect.height / 2 + blockOffset,
      };
    case "top-center":
      return {
        x: frameRect.left + frameRect.width / 2 + inlineOffset,
        y: frameRect.top + blockOffset,
      };
    case "top-right":
      return {
        x: frameRect.right + inlineOffset,
        y: frameRect.top + blockOffset,
      };
  }
}

function domRectFromPoint(sourceRect: DOMRectReadOnly, x: number, y: number): DOMRectReadOnly {
  return new (domRectConstructorFor(sourceRect))(x, y, 0, 0);
}

function domRectFromRectLike(
  sourceRect: DOMRectReadOnly,
  rect: { bottom: number; left: number; right: number; top: number },
): DOMRectReadOnly {
  return new (domRectConstructorFor(sourceRect))(
    rect.left,
    rect.top,
    rect.right - rect.left,
    rect.bottom - rect.top,
  );
}

function domRectConstructorFor(sourceRect: DOMRectReadOnly): typeof DOMRect {
  if (typeof DOMRect === "undefined") {
    return sourceRect.constructor as typeof DOMRect;
  }
  return sourceRect instanceof DOMRect ? (sourceRect.constructor as typeof DOMRect) : DOMRect;
}
