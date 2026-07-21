import type { BlockFrameDefinition } from "@/editor/blocks/block-definition";

export function resolveParentWidth(container: HTMLElement, fallbackWidth: number): number {
  const scaledPresentation = resolveAuthoringPresentationScale(container) < 1;
  const containerWidth = scaledPresentation
    ? container.offsetWidth || container.getBoundingClientRect().width
    : container.getBoundingClientRect().width || container.offsetWidth;
  if (containerWidth && Number.isFinite(containerWidth) && containerWidth > 0) {
    return containerWidth;
  }

  const parentWidth = scaledPresentation
    ? container.parentElement?.offsetWidth || container.parentElement?.getBoundingClientRect().width
    : container.parentElement?.getBoundingClientRect().width;
  if (parentWidth && Number.isFinite(parentWidth) && parentWidth > 0) {
    return parentWidth;
  }

  return Number.isFinite(fallbackWidth) && fallbackWidth > 0 ? fallbackWidth : 1;
}

export function resolveFrameAspectRatio(
  width: number,
  height: number,
  frameDefinition: BlockFrameDefinition | undefined,
): number | null {
  if (typeof frameDefinition?.aspectRatio === "number" && frameDefinition.aspectRatio > 0) {
    return frameDefinition.aspectRatio;
  }

  if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
    return width / height;
  }

  return null;
}

export function resolveAuthoringPresentationScale(element: HTMLElement): number {
  const root = element.closest<HTMLElement>("[data-authoring-slide-scale]");
  const scale = Number(root?.getAttribute("data-authoring-slide-scale"));
  return Number.isFinite(scale) && scale > 0 && scale <= 1 ? scale : 1;
}
