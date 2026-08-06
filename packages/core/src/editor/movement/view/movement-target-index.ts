import {
  createClientRectSnapshot,
  type ClientRectSnapshot,
} from "@/editor/interactions/drag/model/coordinate-space";

import type { DropPoint } from "../model/geometry";
import type { MovementNodeContext } from "../model/movement-policy";
import {
  ContainedMovementTarget,
  createMovementTarget,
  movementTargetAxis,
  type AnyMovementTarget,
  type MovementTargetAxis,
  type MovementTargetRect,
} from "../model/movement-target";

export type MovementTargetKey = string;
export type MovementTargetKind = "contained" | "structure";

export interface MovementTargetDescriptor {
  readonly axis: MovementTargetAxis;
  readonly context: MovementNodeContext;
  readonly documentPosition: number;
  readonly element: Element;
  readonly key: MovementTargetKey;
  readonly kind: MovementTargetKind;
}

export interface TrackedScrollAncestor {
  readonly element: Element | Document;
  readonly measuredX: number;
  readonly measuredY: number;
}

export interface TrackedClientRect {
  readonly measuredRect: ClientRectSnapshot;
  readonly scrollAncestors: readonly TrackedScrollAncestor[];
}

export interface MovementTargetEntry {
  readonly descriptor: MovementTargetDescriptor;
  readonly rect: TrackedClientRect;
}

export interface MovementTargetQuerySource {
  readonly context: MovementNodeContext;
  readonly kind: MovementTargetKind;
}

export interface MovementTargetQueryResult {
  readonly key: MovementTargetKey;
  readonly placement: "after" | "before" | null;
  readonly target: AnyMovementTarget;
}

export type MovementScrollOffset = Readonly<{ x: number; y: number }>;
export type MovementScrollOffsets = ReadonlyMap<Element | Document, MovementScrollOffset>;

export interface MovementTargetIndexSnapshot {
  readonly documentRevision: number;
  readonly entries: readonly MovementTargetEntry[];
  readonly geometryRevision: number;
  query(point: DropPoint, source: MovementTargetQuerySource): MovementTargetQueryResult | null;
}

export type MovementIndexInvalidation =
  | "document-structure"
  | "element-disconnected"
  | "layout"
  | "resize"
  | "scroll";

export interface CreateMovementTargetIndexSnapshotInput {
  readonly documentRevision: number;
  readonly entries: readonly MovementTargetEntry[];
  readonly geometryRevision: number;
  readonly scrollOffsets?: MovementScrollOffsets;
}

interface MovementTargetMatch {
  readonly area: number;
  readonly depth: number;
  readonly distance: number;
  readonly exact: boolean;
  readonly key: MovementTargetKey;
  readonly priority: number;
  readonly target: AnyMovementTarget;
}

const MOVEMENT_TARGET_GUTTER_PX = 40;

export function measureMovementTargetEntries(
  descriptors: readonly MovementTargetDescriptor[],
): readonly MovementTargetEntry[] {
  const scrollability = new Map<Element, boolean>();
  const entries: MovementTargetEntry[] = [];

  for (const descriptor of descriptors) {
    if (!descriptor.element.isConnected) continue;
    const domRect = descriptor.element.getBoundingClientRect();
    const measuredRect = createClientRectSnapshot(
      domRect.left,
      domRect.top,
      domRect.width,
      domRect.height,
    );
    if (!measuredRect) continue;

    entries.push(
      Object.freeze({
        descriptor,
        rect: Object.freeze({
          measuredRect,
          scrollAncestors: Object.freeze(collectScrollAncestors(descriptor.element, scrollability)),
        }),
      }),
    );
  }

  return Object.freeze(entries);
}

export function readMovementScrollOffset(target: Element | Document): MovementScrollOffset {
  if (target.nodeType === 1) {
    const element = target as Element;
    return Object.freeze({ x: element.scrollLeft, y: element.scrollTop });
  }

  const ownerDocument = target as Document;
  const scrollingElement = ownerDocument.scrollingElement;
  const ownerWindow = ownerDocument.defaultView;
  return Object.freeze({
    x: scrollingElement?.scrollLeft ?? ownerWindow?.scrollX ?? 0,
    y: scrollingElement?.scrollTop ?? ownerWindow?.scrollY ?? 0,
  });
}

export function readMovementScrollOffsets(
  entries: readonly MovementTargetEntry[],
): ReadonlyMap<Element | Document, MovementScrollOffset> {
  const offsets = new Map<Element | Document, MovementScrollOffset>();
  for (const entry of entries) {
    for (const ancestor of entry.rect.scrollAncestors) {
      if (!offsets.has(ancestor.element)) {
        offsets.set(ancestor.element, readMovementScrollOffset(ancestor.element));
      }
    }
  }
  return offsets;
}

export function createMovementTargetIndexSnapshot({
  documentRevision,
  entries,
  geometryRevision,
  scrollOffsets = new Map(),
}: CreateMovementTargetIndexSnapshotInput): MovementTargetIndexSnapshot {
  const immutableEntries = Object.freeze([...entries]);
  const immutableOffsets = new Map(scrollOffsets);

  return Object.freeze({
    documentRevision,
    entries: immutableEntries,
    geometryRevision,
    query(point: DropPoint, source: MovementTargetQuerySource) {
      const matches: MovementTargetMatch[] = [];

      for (const entry of immutableEntries) {
        if (entry.descriptor.kind !== source.kind) continue;
        const rect = adjustedRect(entry.rect, immutableOffsets);
        const match = matchTarget(entry, rect, point);
        if (match) matches.push(match);
      }

      const best = bestMovementTargetMatch(matches);
      if (!best) return null;

      if (source.kind === "contained") {
        const placement =
          movementTargetAxis(best.target) === "horizontal"
            ? point.x < best.target.rect.left + best.target.rect.width / 2
              ? "before"
              : "after"
            : point.y < best.target.rect.top + best.target.rect.height / 2
              ? "before"
              : "after";
        if (isContainedNoOp(source.context, best.target.context, placement)) return null;
        return Object.freeze({ key: best.key, placement, target: best.target });
      }

      return Object.freeze({ key: best.key, placement: null, target: best.target });
    },
  });
}

function collectScrollAncestors(
  element: Element,
  scrollability: Map<Element, boolean>,
): TrackedScrollAncestor[] {
  const ancestors: TrackedScrollAncestor[] = [];
  let current = element.parentElement;
  while (current) {
    let scrollable = scrollability.get(current);
    if (scrollable === undefined) {
      scrollable = isScrollable(current);
      scrollability.set(current, scrollable);
    }
    if (scrollable) {
      const offset = readMovementScrollOffset(current);
      ancestors.push({ element: current, measuredX: offset.x, measuredY: offset.y });
    }
    current = current.parentElement;
  }

  const ownerDocument = element.ownerDocument;
  const documentOffset = readMovementScrollOffset(ownerDocument);
  ancestors.push({
    element: ownerDocument,
    measuredX: documentOffset.x,
    measuredY: documentOffset.y,
  });
  return ancestors;
}

function isScrollable(element: Element): boolean {
  const ownerWindow = element.ownerDocument.defaultView;
  if (!ownerWindow) return false;
  const style = ownerWindow.getComputedStyle(element);
  const canScrollX = /(auto|overlay|scroll)/.test(style.overflowX);
  const canScrollY = /(auto|overlay|scroll)/.test(style.overflowY);
  return (
    (canScrollX && element.scrollWidth > element.clientWidth) ||
    (canScrollY && element.scrollHeight > element.clientHeight)
  );
}

function adjustedRect(
  trackedRect: TrackedClientRect,
  scrollOffsets: MovementScrollOffsets,
): MovementTargetRect {
  let deltaX = 0;
  let deltaY = 0;
  for (const ancestor of trackedRect.scrollAncestors) {
    const current = scrollOffsets.get(ancestor.element);
    if (!current) continue;
    deltaX += current.x - ancestor.measuredX;
    deltaY += current.y - ancestor.measuredY;
  }

  const left = trackedRect.measuredRect.left - deltaX;
  const top = trackedRect.measuredRect.top - deltaY;
  const { height, width } = trackedRect.measuredRect;
  return Object.freeze({
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
  });
}

function matchTarget(
  entry: MovementTargetEntry,
  rect: MovementTargetRect,
  point: DropPoint,
): MovementTargetMatch | null {
  const exact = containsPoint(rect, point);
  const distance = exact ? 0 : gutterDistance(rect, point);
  if (distance === null) return null;

  const target =
    entry.descriptor.kind === "contained"
      ? new ContainedMovementTarget(entry.descriptor.context, rect, entry.descriptor.axis)
      : createMovementTarget(entry.descriptor.context, rect, entry.descriptor.axis);
  return {
    area: Math.max(rect.width, 1) * Math.max(rect.height, 1),
    depth: entry.descriptor.context.ancestors.length,
    distance,
    exact,
    key: entry.descriptor.key,
    priority:
      entry.descriptor.kind === "contained" ? 0 : matchPriority(entry.descriptor.context, exact),
    target,
  };
}

function bestMovementTargetMatch(
  matches: readonly MovementTargetMatch[],
): MovementTargetMatch | null {
  return (
    [...matches].sort((left, right) => {
      if (left.priority !== right.priority) return left.priority - right.priority;
      if (left.exact !== right.exact) return left.exact ? -1 : 1;
      if (left.distance !== right.distance) return left.distance - right.distance;
      if (left.area !== right.area) return left.area - right.area;
      return right.depth - left.depth;
    })[0] ?? null
  );
}

function containsPoint(rect: MovementTargetRect, point: DropPoint): boolean {
  return (
    point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
  );
}

function gutterDistance(rect: MovementTargetRect, point: DropPoint): number | null {
  if (
    point.y >= rect.top &&
    point.y <= rect.bottom &&
    point.x < rect.left &&
    point.x >= rect.left - MOVEMENT_TARGET_GUTTER_PX
  ) {
    return rect.left - point.x;
  }
  if (
    point.y >= rect.top &&
    point.y <= rect.bottom &&
    point.x > rect.right &&
    point.x <= rect.right + MOVEMENT_TARGET_GUTTER_PX
  ) {
    return point.x - rect.right;
  }
  if (
    point.x >= rect.left &&
    point.x <= rect.right &&
    point.y < rect.top &&
    point.y >= rect.top - MOVEMENT_TARGET_GUTTER_PX
  ) {
    return rect.top - point.y;
  }
  if (
    point.x >= rect.left &&
    point.x <= rect.right &&
    point.y > rect.bottom &&
    point.y <= rect.bottom + MOVEMENT_TARGET_GUTTER_PX
  ) {
    return point.y - rect.bottom;
  }
  return null;
}

function matchPriority(context: MovementNodeContext, exact: boolean): number {
  if (!exact) return isStructuralRowTarget(context) ? 0 : 1;
  if (context.nodeType.name === "surface") return 3;
  return 2;
}

function isStructuralRowTarget(context: MovementNodeContext): boolean {
  return (
    context.nodeType.name === "grid" ||
    context.nodeType.name === "layout" ||
    context.nodeType.name === "section"
  );
}

function isContainedNoOp(
  source: MovementNodeContext,
  target: MovementNodeContext,
  placement: "after" | "before",
): boolean {
  if (placement === "before") return source.index === target.index - 1;
  return source.index === target.index + 1;
}
