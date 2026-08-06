import {
  createCoordinateSpaceSnapshot,
  type CoordinateInvalidationReason,
  type CoordinateSpaceKind,
  type CoordinateSpaceSnapshot,
  type InteractionCoordinateSpace,
} from "../model/coordinate-space";
import {
  createFrameCoalescer,
  createWindowFrameScheduler,
  type FrameScheduler,
} from "./frame-coalescer";

interface DOMCoordinateSpaceOptions {
  readonly getRoot: () => HTMLElement | null;
  readonly ownerDocument: Document;
  readonly frameScheduler?: FrameScheduler;
}

export interface ViewportCoordinateSpaceOptions extends DOMCoordinateSpaceOptions {}

export interface ScaledCanvasCoordinateSpaceOptions extends DOMCoordinateSpaceOptions {
  readonly localSize: Readonly<{ width: number; height: number }>;
}

export interface DOMInteractionCoordinateSpace extends InteractionCoordinateSpace {
  readonly ownerDocument: Document;
  getRoot(): HTMLElement | null;
}

export function createViewportCoordinateSpace(
  options: ViewportCoordinateSpaceOptions,
): DOMInteractionCoordinateSpace {
  return createDOMCoordinateSpace("viewport", options, null);
}

export function createScaledCanvasCoordinateSpace(
  options: ScaledCanvasCoordinateSpaceOptions,
): DOMInteractionCoordinateSpace {
  return createDOMCoordinateSpace("scaled-canvas", options, options.localSize);
}

function createDOMCoordinateSpace(
  kind: CoordinateSpaceKind,
  options: DOMCoordinateSpaceOptions,
  declaredLocalSize: Readonly<{ width: number; height: number }> | null,
): DOMInteractionCoordinateSpace {
  const ownerWindow = options.ownerDocument.defaultView;
  const listeners = new Set<(reason: CoordinateInvalidationReason) => void>();
  let revision = 0;
  let stopObserving: (() => void) | null = null;
  let measuredRoot: HTMLElement | null | undefined;
  let measuredSnapshot: CoordinateSpaceSnapshot | null | undefined;

  const coordinateSpace: DOMInteractionCoordinateSpace = {
    kind,
    ownerDocument: options.ownerDocument,
    getRoot: options.getRoot,
    measure(): CoordinateSpaceSnapshot | null {
      const root = options.getRoot();
      if (
        root === measuredRoot &&
        measuredSnapshot !== undefined &&
        (measuredSnapshot !== null || !root?.isConnected)
      ) {
        return measuredSnapshot;
      }
      measuredRoot = root;
      if (
        !root ||
        !root.isConnected ||
        root.ownerDocument !== options.ownerDocument ||
        !ownerWindow ||
        root.ownerDocument.defaultView !== ownerWindow ||
        !hasSupportedTransform(root, ownerWindow, kind)
      ) {
        measuredSnapshot = null;
        return measuredSnapshot;
      }

      const rect = root.getBoundingClientRect();
      measuredSnapshot = createCoordinateSpaceSnapshot({
        kind,
        revision,
        clientRect: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        },
        localSize: declaredLocalSize ?? { width: rect.width, height: rect.height },
      });
      return measuredSnapshot;
    },
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1 && ownerWindow) {
        stopObserving = observeInvalidations(options, ownerWindow, (reasons) => {
          revision += 1;
          measuredSnapshot = undefined;
          for (const reason of reasons) {
            for (const currentListener of listeners) currentListener(reason);
          }
        });
      }

      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        listeners.delete(listener);
        if (listeners.size === 0) {
          stopObserving?.();
          stopObserving = null;
        }
      };
    },
  };

  return Object.freeze(coordinateSpace);
}

function observeInvalidations(
  options: DOMCoordinateSpaceOptions,
  ownerWindow: Window,
  notify: (reasons: readonly CoordinateInvalidationReason[]) => void,
): () => void {
  const scheduler = options.frameScheduler ?? createWindowFrameScheduler(ownerWindow);
  const pendingReasons = new Set<CoordinateInvalidationReason>();
  let observedRoot = options.getRoot();
  let resizeObserver: ResizeObserver | null = null;

  const coalescer = createFrameCoalescer(() => {
    const currentRoot = options.getRoot();
    if (currentRoot !== observedRoot) {
      observedRoot = currentRoot;
      pendingReasons.clear();
      pendingReasons.add("root-replaced");
      resizeObserver?.disconnect();
      if (currentRoot) resizeObserver?.observe(currentRoot);
    }
    const reasons = [...pendingReasons];
    pendingReasons.clear();
    if (reasons.length > 0) notify(reasons);
  }, scheduler);
  const queue = (reason: CoordinateInvalidationReason) => {
    pendingReasons.add(reason);
    coalescer.request();
  };
  const handleScroll = () => queue("scroll");
  const handleResize = () => queue("resize");
  const handleFullscreen = () => queue("fullscreen");
  const handleTransform = () => queue("transform");

  options.ownerDocument.addEventListener("scroll", handleScroll, true);
  options.ownerDocument.addEventListener("fullscreenchange", handleFullscreen);
  options.ownerDocument.addEventListener("transitionrun", handleTransform, true);
  options.ownerDocument.addEventListener("transitionend", handleTransform, true);
  ownerWindow.addEventListener("resize", handleResize);

  const ownerGlobal = ownerWindow as Window & typeof globalThis;
  const ResizeObserverConstructor = ownerGlobal.ResizeObserver;
  if (ResizeObserverConstructor) {
    const nextResizeObserver = new ResizeObserverConstructor(handleResize);
    resizeObserver = nextResizeObserver;
    if (observedRoot) nextResizeObserver.observe(observedRoot);
  }

  const mutationObserver = observeRelevantMutations(options, ownerGlobal, handleTransform);

  return () => {
    coalescer.dispose();
    pendingReasons.clear();
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
    options.ownerDocument.removeEventListener("scroll", handleScroll, true);
    options.ownerDocument.removeEventListener("fullscreenchange", handleFullscreen);
    options.ownerDocument.removeEventListener("transitionrun", handleTransform, true);
    options.ownerDocument.removeEventListener("transitionend", handleTransform, true);
    ownerWindow.removeEventListener("resize", handleResize);
  };
}

function observeRelevantMutations(
  options: DOMCoordinateSpaceOptions,
  ownerGlobal: Window & typeof globalThis,
  notify: () => void,
): MutationObserver | null {
  const MutationObserverConstructor = ownerGlobal.MutationObserver;
  const OwnerElement = ownerGlobal.Element;
  const documentElement = options.ownerDocument.documentElement;
  if (!MutationObserverConstructor || !OwnerElement || !documentElement) return null;

  const observer = new MutationObserverConstructor((records) => {
    if (
      records.some((record) => {
        const root = options.getRoot();
        if (!root) return false;
        if (record.type === "attributes") {
          return record.target instanceof OwnerElement && isAncestorOrSelf(record.target, root);
        }
        return (
          record.target === root ||
          [...record.addedNodes, ...record.removedNodes].some(
            (node) => node === root || (node instanceof OwnerElement && node.contains(root)),
          )
        );
      })
    ) {
      notify();
    }
  });
  observer.observe(documentElement, {
    attributes: true,
    attributeFilter: ["class", "style"],
    childList: true,
    subtree: true,
  });
  return observer;
}

function isAncestorOrSelf(ancestor: Node, node: Node): boolean {
  return ancestor === node || ancestor.contains(node);
}

function hasSupportedTransform(
  root: HTMLElement,
  ownerWindow: Window,
  kind: CoordinateSpaceKind,
): boolean {
  const transform = ownerWindow.getComputedStyle(root).transform.trim();
  if (transform === "" || transform === "none") return true;
  if (!transform.startsWith("matrix(") || !transform.endsWith(")")) return false;

  const values = transform
    .slice("matrix(".length, -1)
    .split(",")
    .map((value) => Number(value.trim()));
  if (values.length !== 6 || values.some((value) => !Number.isFinite(value))) return false;
  const [scaleX, skewY, skewX, scaleY] = values as [number, number, number, number];
  if (scaleX <= 0 || scaleY <= 0 || Math.abs(skewX) > 1e-8 || Math.abs(skewY) > 1e-8) {
    return false;
  }
  return kind === "scaled-canvas" || (approximatelyOne(scaleX) && approximatelyOne(scaleY));
}

function approximatelyOne(value: number): boolean {
  return Math.abs(value - 1) <= 1e-8;
}
