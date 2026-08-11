import type { MovementTargetAxis } from "@/editor/movement/model/movement-target";
import {
  createAuthoringContainedReorderProjection,
  resolveAuthoringNodeViewSiblingElements,
} from "@/editor/movement/view/authoring-contained-reorder-projection";
import type { AuthoringContainedMovementProjection } from "@/editor/movement/view/authoring-movement-presentation";

export function createProcessFlowAuthoringReorderProjection(
  getSourceElement: () => HTMLElement | null,
  axis: MovementTargetAxis,
): AuthoringContainedMovementProjection {
  return createAuthoringContainedReorderProjection({
    axis,
    getSiblingElements: (sourceElement) =>
      resolveAuthoringNodeViewSiblingElements(
        sourceElement,
        (element) => element.getAttribute("data-node") === "process-flow-step",
      ),
    getSourceElement,
  });
}
