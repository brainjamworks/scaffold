import type { MovementTargetAxis } from "@/editor/movement/model/movement-target";
import {
  createAuthoringContainedReorderProjection,
  resolveAuthoringNodeViewSiblingElements,
} from "@/editor/movement/view/authoring-contained-reorder-projection";
import type { AuthoringContainedMovementProjection } from "@/editor/movement/view/authoring-movement-presentation";

export function createTimelineAuthoringReorderProjection(
  getSourceElement: () => HTMLElement | null,
  axis: MovementTargetAxis,
): AuthoringContainedMovementProjection {
  return createAuthoringContainedReorderProjection({
    axis,
    getSiblingElements: timelineSiblingElements,
    getSourceElement,
  });
}

function timelineSiblingElements(sourceElement: HTMLElement): HTMLElement[] {
  return resolveAuthoringNodeViewSiblingElements(sourceElement, (element) =>
    element.hasAttribute("data-timeline-event"),
  );
}
