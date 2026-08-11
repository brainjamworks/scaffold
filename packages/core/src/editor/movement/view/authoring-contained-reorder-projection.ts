import type { MovementTargetAxis } from "../model/movement-target";
import type { AuthoringContainedMovementProjection } from "./authoring-movement-presentation";

export const AUTHORING_CONTAINED_REORDER_PROJECTION_ATTR =
  "data-authoring-contained-reorder-projection";
export const AUTHORING_CONTAINED_DESTINATION_PROJECTION_ATTR =
  "data-authoring-contained-destination-projection";

interface AuthoringContainedReorderProjectionOptions {
  readonly axis: MovementTargetAxis;
  readonly getSiblingElements: (sourceElement: HTMLElement) => readonly HTMLElement[];
  readonly getSourceElement: () => HTMLElement | null;
}

type AuthoringNodeViewItemPredicate = (element: HTMLElement) => boolean;

interface ProjectedItem {
  readonly element: HTMLElement;
  readonly extent: number;
  readonly left: number;
  readonly position: number;
  readonly top: number;
}

interface ProjectedOffset {
  readonly x: number;
  readonly y: number;
}

interface ProjectedMotion {
  readonly animation: Animation;
  readonly from: ProjectedOffset;
  readonly to: ProjectedOffset;
}

interface ProjectionSession {
  readonly axis: MovementTargetAxis;
  readonly gap: number;
  readonly items: readonly ProjectedItem[];
  readonly motionByElement: Map<HTMLElement, ProjectedMotion>;
  readonly reducedMotion: boolean;
  readonly sourceIndex: number;
  readonly wrappedFlow: boolean;
}

export function createAuthoringContainedReorderProjection({
  axis,
  getSiblingElements,
  getSourceElement,
}: AuthoringContainedReorderProjectionOptions): AuthoringContainedMovementProjection {
  let session: ProjectionSession | null = null;

  const clear = () => {
    if (!session) return;
    for (const item of session.items) {
      session.motionByElement.get(item.element)?.animation.cancel();
      item.element.removeAttribute(AUTHORING_CONTAINED_REORDER_PROJECTION_ATTR);
    }
    session = null;
  };

  return {
    clear,
    project(destinationIndex) {
      if (!session) return;
      const safeDestination = validDestinationIndex(destinationIndex, session.items.length)
        ? destinationIndex
        : session.sourceIndex;
      const projectedItems = moveItem(session.items, session.sourceIndex, safeDestination);
      if (session.wrappedFlow) {
        for (let index = 0; index < projectedItems.length; index += 1) {
          const item = projectedItems[index]!;
          const slot = session.items[index]!;
          animateProjectedItem(session, item, {
            x: slot.left - item.left,
            y: slot.top - item.top,
          });
        }
        return;
      }

      let projectedPosition = session.items[0]?.position ?? 0;

      for (const item of projectedItems) {
        animateProjectedItem(
          session,
          item,
          projectedAxisOffset(session.axis, projectedPosition - item.position),
        );
        projectedPosition += item.extent + session.gap;
      }
    },
    start(sourceIndex) {
      clear();
      const sourceElement = getSourceElement();
      const ownerWindow = sourceElement?.ownerDocument.defaultView;
      if (!sourceElement || !ownerWindow) return false;

      const elements = [...getSiblingElements(sourceElement)];
      if (elements[sourceIndex] !== sourceElement || elements.length < 2) return false;

      const items = elements.map((element) => {
        const rect = element.getBoundingClientRect();
        element.setAttribute(AUTHORING_CONTAINED_REORDER_PROJECTION_ATTR, "");
        return {
          element,
          extent: axis === "horizontal" ? rect.width : rect.height,
          left: rect.left,
          position: axis === "horizontal" ? rect.left : rect.top,
          top: rect.top,
        };
      });
      session = {
        axis,
        gap: measuredItemGap(items),
        items,
        motionByElement: new Map(),
        reducedMotion:
          ownerWindow.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
        sourceIndex,
        wrappedFlow: isWrappedFlow(items),
      };
      return true;
    },
  };
}

export function resolveAuthoringNodeViewSiblingElements(
  sourceElement: HTMLElement,
  isItemElement: AuthoringNodeViewItemPredicate,
): HTMLElement[] {
  const HTMLElementConstructor = sourceElement.ownerDocument.defaultView?.HTMLElement;
  if (!HTMLElementConstructor) return [];

  const nodeViewContainer = sourceElement.parentElement;
  const list =
    nodeViewContainer && isItemElement(nodeViewContainer)
      ? nodeViewContainer.parentElement
      : nodeViewContainer?.parentElement;
  if (!list) return [];

  return Array.from(list.children).flatMap((child) => {
    if (child instanceof HTMLElementConstructor && isItemElement(child)) return [child];
    const item = Array.from(child.children).find(
      (element): element is HTMLElement =>
        element instanceof HTMLElementConstructor && isItemElement(element),
    );
    return item ? [item] : [];
  });
}

function validDestinationIndex(destinationIndex: number, itemCount: number): boolean {
  return (
    Number.isInteger(destinationIndex) && destinationIndex >= 0 && destinationIndex < itemCount
  );
}

function moveItem<T>(items: readonly T[], sourceIndex: number, destinationIndex: number): T[] {
  const next = [...items];
  const [source] = next.splice(sourceIndex, 1);
  if (!source) return next;
  next.splice(destinationIndex, 0, source);
  return next;
}

function animateProjectedItem(
  session: ProjectionSession,
  item: ProjectedItem,
  nextOffset: ProjectedOffset,
): void {
  const existing = session.motionByElement.get(item.element);
  if (existing?.to.x === nextOffset.x && existing.to.y === nextOffset.y) return;
  const currentOffset = existing ? projectedMotionOffset(existing) : { x: 0, y: 0 };
  existing?.animation.cancel();
  if (
    Math.abs(currentOffset.x - nextOffset.x) < 0.1 &&
    Math.abs(currentOffset.y - nextOffset.y) < 0.1 &&
    nextOffset.x === 0 &&
    nextOffset.y === 0
  ) {
    session.motionByElement.delete(item.element);
    return;
  }
  const animation = item.element.animate(
    [
      { translate: projectedTranslation(currentOffset) },
      { translate: projectedTranslation(nextOffset) },
    ],
    {
      duration: session.reducedMotion ? 0 : 160,
      easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      fill: "forwards",
    },
  );
  session.motionByElement.set(item.element, {
    animation,
    from: currentOffset,
    to: nextOffset,
  });
}

function projectedAxisOffset(axis: MovementTargetAxis, offset: number): ProjectedOffset {
  return axis === "horizontal" ? { x: offset, y: 0 } : { x: 0, y: offset };
}

function projectedTranslation(offset: ProjectedOffset): string {
  return `${offset.x}px ${offset.y}px`;
}

function projectedMotionOffset(motion: ProjectedMotion): ProjectedOffset {
  const progress = motion.animation.effect?.getComputedTiming().progress;
  if (typeof progress !== "number") return motion.to;
  return {
    x: motion.from.x + (motion.to.x - motion.from.x) * progress,
    y: motion.from.y + (motion.to.y - motion.from.y) * progress,
  };
}

function measuredItemGap(items: readonly ProjectedItem[]): number {
  if (items.length < 2) return 0;
  let gapTotal = 0;
  for (let index = 0; index < items.length - 1; index += 1) {
    const current = items[index]!;
    const next = items[index + 1]!;
    gapTotal += next.position - (current.position + current.extent);
  }
  return gapTotal / (items.length - 1);
}

function isWrappedFlow(items: readonly ProjectedItem[]): boolean {
  for (let index = 0; index < items.length - 1; index += 1) {
    if (items[index + 1]!.position <= items[index]!.position + 0.5) return true;
  }
  return false;
}
