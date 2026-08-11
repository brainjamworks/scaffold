import {
  createAuthoringContainedReorderProjection,
  resolveAuthoringNodeViewSiblingElements,
} from "@/editor/movement/view/authoring-contained-reorder-projection";
import type { AuthoringContainedMovementProjection } from "@/editor/movement/view/authoring-movement-presentation";

export function createChecklistAuthoringReorderProjection(
  getSourceElement: () => HTMLElement | null,
): AuthoringContainedMovementProjection {
  return createAuthoringContainedReorderProjection({
    axis: "vertical",
    getSiblingElements: (sourceElement) =>
      resolveAuthoringNodeViewSiblingElements(
        sourceElement,
        (element) => element.getAttribute("data-node") === "checklist-item",
      ),
    getSourceElement,
  });
}
