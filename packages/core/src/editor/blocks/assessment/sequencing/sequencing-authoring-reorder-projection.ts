import {
  AUTHORING_CONTAINED_REORDER_PROJECTION_ATTR,
  createAuthoringContainedReorderProjection,
  resolveAuthoringNodeViewSiblingElements,
} from "@/editor/movement/view/authoring-contained-reorder-projection";
import type { AuthoringContainedMovementProjection } from "@/editor/movement/view/authoring-movement-presentation";

export const SEQUENCING_AUTHORING_PROJECTION_ATTR = AUTHORING_CONTAINED_REORDER_PROJECTION_ATTR;

export function createSequencingAuthoringReorderProjection(
  getSourceElement: () => HTMLElement | null,
): AuthoringContainedMovementProjection {
  return createAuthoringContainedReorderProjection({
    axis: "vertical",
    getSiblingElements: sequencingSiblingElements,
    getSourceElement,
  });
}

function sequencingSiblingElements(sourceElement: HTMLElement): HTMLElement[] {
  return resolveAuthoringNodeViewSiblingElements(
    sourceElement,
    (element) => element.getAttribute("data-node") === "sequencing-item",
  );
}
