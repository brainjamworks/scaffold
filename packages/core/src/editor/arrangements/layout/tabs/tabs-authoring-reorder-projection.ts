import { createAuthoringContainedReorderProjection } from "@/editor/movement/view/authoring-contained-reorder-projection";
import type { AuthoringContainedMovementProjection } from "@/editor/movement/view/authoring-movement-presentation";

export function createTabsAuthoringReorderProjection(
  getSourceElement: () => HTMLElement | null,
): AuthoringContainedMovementProjection {
  return createAuthoringContainedReorderProjection({
    axis: "horizontal",
    getSiblingElements: tabsSiblingElements,
    getSourceElement,
  });
}

function tabsSiblingElements(sourceElement: HTMLElement): HTMLElement[] {
  const list = sourceElement.closest("[data-course-tabs-list]");
  const HTMLElementConstructor = sourceElement.ownerDocument.defaultView?.HTMLElement;
  if (!list || !HTMLElementConstructor || sourceElement.parentElement !== list) return [];

  return Array.from(list.children).filter(
    (element): element is HTMLElement =>
      element instanceof HTMLElementConstructor && element.hasAttribute("data-course-tabs-item"),
  );
}
