import {
  createAuthoringContainedReorderProjection,
  resolveAuthoringNodeViewSiblingElements,
} from "@/editor/movement/view/authoring-contained-reorder-projection";
import type { AuthoringContainedMovementProjection } from "@/editor/movement/view/authoring-movement-presentation";

const ACCORDION_AUTHORING_SECTION_SELECTOR =
  '[data-authoring-frame="section"][data-layout-kind="accordion"]';

export function createAccordionAuthoringReorderProjection(
  getSourceElement: () => HTMLElement | null,
): AuthoringContainedMovementProjection {
  return createAuthoringContainedReorderProjection({
    axis: "vertical",
    getSiblingElements: accordionSiblingElements,
    getSourceElement,
  });
}

function accordionSiblingElements(sourceElement: HTMLElement): HTMLElement[] {
  return resolveAuthoringNodeViewSiblingElements(sourceElement, (element) =>
    element.matches(ACCORDION_AUTHORING_SECTION_SELECTOR),
  );
}

export function resolveAccordionAuthoringSectionElement(
  nodeViewElement: HTMLElement | null,
): HTMLElement | null {
  if (!nodeViewElement) return null;
  if (nodeViewElement.matches(ACCORDION_AUTHORING_SECTION_SELECTOR)) return nodeViewElement;
  return nodeViewElement.querySelector<HTMLElement>(
    `:scope > ${ACCORDION_AUTHORING_SECTION_SELECTOR}`,
  );
}
