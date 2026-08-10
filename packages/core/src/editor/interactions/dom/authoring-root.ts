export const AUTHORING_INTERACTION_ROOT_ATTR = "data-authoring-interaction-root";

const interactionHostsByOwner = new WeakMap<Element, Set<HTMLElement>>();

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

/**
 * Registers authoring UI that lives outside the editor's DOM root but still
 * participates in the same interaction session. This lets canonical owner
 * chrome remain active while focus stays in an authoring navigator or dock.
 */
export function registerAuthoringInteractionHost(
  ownerRoot: Element,
  host: HTMLElement,
): () => void {
  let hosts = interactionHostsByOwner.get(ownerRoot);
  if (hosts === undefined) {
    hosts = new Set();
    interactionHostsByOwner.set(ownerRoot, hosts);
  }
  hosts.add(host);

  let registered = true;
  return () => {
    if (!registered) return;
    registered = false;

    const currentHosts = interactionHostsByOwner.get(ownerRoot);
    currentHosts?.delete(host);
    if (currentHosts?.size === 0) interactionHostsByOwner.delete(ownerRoot);
  };
}

export function isAuthoringInteractionTargetOwnedBy(
  ownerRoot: Element,
  target: EventTarget | null,
): boolean {
  const NodeConstructor = ownerRoot.ownerDocument.defaultView?.Node;
  if (NodeConstructor === undefined || !(target instanceof NodeConstructor)) return false;
  if (ownerRoot.contains(target)) return true;

  for (const host of interactionHostsByOwner.get(ownerRoot) ?? []) {
    if (host.contains(target)) return true;
  }
  return false;
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
