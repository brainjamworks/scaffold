const overlayHostsByOwner = new WeakMap<Element, Set<HTMLElement>>();
type OverlayHostOwnerListener = (host: HTMLElement, registered: boolean) => void;
const overlayHostOwnerListeners = new WeakMap<Element, Set<OverlayHostOwnerListener>>();

export function registerOverlayHostOwner(ownerRoot: Element, host: HTMLElement): () => void {
  let hosts = overlayHostsByOwner.get(ownerRoot);
  if (hosts === undefined) {
    hosts = new Set();
    overlayHostsByOwner.set(ownerRoot, hosts);
  }
  const added = !hosts.has(host);
  hosts.add(host);
  if (added) notifyOverlayHostOwnerListeners(ownerRoot, host, true);

  let registered = true;
  return () => {
    if (!registered) return;
    registered = false;

    const currentHosts = overlayHostsByOwner.get(ownerRoot);
    const removed = currentHosts?.delete(host) === true;
    if (currentHosts?.size === 0) overlayHostsByOwner.delete(ownerRoot);
    if (removed) notifyOverlayHostOwnerListeners(ownerRoot, host, false);
  };
}

export function subscribeOverlayHostOwner(
  ownerRoot: Element,
  listener: OverlayHostOwnerListener,
): () => void {
  let listeners = overlayHostOwnerListeners.get(ownerRoot);
  if (listeners === undefined) {
    listeners = new Set();
    overlayHostOwnerListeners.set(ownerRoot, listeners);
  }
  listeners.add(listener);
  for (const host of overlayHostsByOwner.get(ownerRoot) ?? []) listener(host, true);

  return () => {
    const currentListeners = overlayHostOwnerListeners.get(ownerRoot);
    currentListeners?.delete(listener);
    if (currentListeners?.size === 0) overlayHostOwnerListeners.delete(ownerRoot);
  };
}

export function isOverlayTargetOwnedBy(ownerRoot: Element, target: EventTarget | null): boolean {
  const NodeConstructor = ownerRoot.ownerDocument.defaultView?.Node;
  if (NodeConstructor === undefined || !(target instanceof NodeConstructor)) return false;
  if (ownerRoot.contains(target)) return true;

  const hosts = overlayHostsByOwner.get(ownerRoot);
  if (hosts === undefined) return false;

  for (const host of hosts) {
    if (host.contains(target)) return true;
  }
  return false;
}

function notifyOverlayHostOwnerListeners(
  ownerRoot: Element,
  host: HTMLElement,
  registered: boolean,
): void {
  for (const listener of overlayHostOwnerListeners.get(ownerRoot) ?? []) {
    listener(host, registered);
  }
}
