const STABLE_NODE_ID_DOM_ATTRIBUTE = "data-id";

export function stableNodeIdAttribute() {
  return {
    default: null,
    parseHTML: (element: HTMLElement) => element.getAttribute(STABLE_NODE_ID_DOM_ATTRIBUTE),
    renderHTML: (attrs: { id?: unknown }) =>
      typeof attrs.id === "string" && attrs.id.length > 0
        ? { [STABLE_NODE_ID_DOM_ATTRIBUTE]: attrs.id }
        : {},
  };
}
