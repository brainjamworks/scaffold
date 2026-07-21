export const AUTHORING_INTERACTION_ROOT_ATTR = "data-authoring-interaction-root";

export function authoringInteractionRootAttributes(): Record<string, string> {
  return { [AUTHORING_INTERACTION_ROOT_ATTR]: "" };
}

export function resolveAuthoringInteractionRoot(editorDom: Element): Element {
  return (
    editorDom.closest(`[${AUTHORING_INTERACTION_ROOT_ATTR}]`) ??
    editorDom.parentElement ??
    editorDom
  );
}

export function findDataAnchorElementWithin(
  root: ParentNode | null | undefined,
  attribute: string,
  anchorId: string | null | undefined,
): Element | null {
  if (!root || !anchorId) return null;

  if (
    root instanceof Element &&
    root.hasAttribute(attribute) &&
    root.getAttribute(attribute) === anchorId
  ) {
    return root;
  }

  for (const element of root.querySelectorAll(`[${attribute}]`)) {
    if (element.getAttribute(attribute) === anchorId) return element;
  }

  return null;
}
