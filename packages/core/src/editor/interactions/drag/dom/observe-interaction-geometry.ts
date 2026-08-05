import type { InteractionCoordinateSpace } from "../model/coordinate-space";
import {
  createFrameCoalescer,
  createWindowFrameScheduler,
  type FrameScheduler,
} from "./frame-coalescer";

export interface ObserveInteractionGeometryOptions {
  readonly coordinateSpace?: Pick<InteractionCoordinateSpace, "subscribe"> | null;
  readonly frameScheduler?: FrameScheduler;
  readonly getElements: () => readonly Element[];
  readonly onMeasure: () => void;
  readonly ownerDocument: Document;
}

export function observeInteractionGeometry({
  coordinateSpace,
  frameScheduler,
  getElements,
  onMeasure,
  ownerDocument,
}: ObserveInteractionGeometryOptions): () => void {
  const ownerWindow = ownerDocument.defaultView;
  if (!ownerWindow) return () => undefined;
  const ownerGlobal = ownerWindow as Window & typeof globalThis;
  const scheduler = frameScheduler ?? createWindowFrameScheduler(ownerWindow);
  let observedElements: readonly Element[] = [];
  let resizeObserver: ResizeObserver | null = null;

  const syncObservedElements = () => {
    const nextElements = uniqueElements(getElements());
    if (sameElements(observedElements, nextElements)) return;
    observedElements = nextElements;
    resizeObserver?.disconnect();
    for (const element of observedElements) {
      if (element.isConnected) resizeObserver?.observe(element);
    }
  };
  const coalescer = createFrameCoalescer(() => {
    syncObservedElements();
    onMeasure();
  }, scheduler);
  const queueMeasurement = () => coalescer.request();

  const ResizeObserverConstructor = ownerGlobal.ResizeObserver;
  if (ResizeObserverConstructor) {
    resizeObserver = new ResizeObserverConstructor(queueMeasurement);
  }
  syncObservedElements();

  const handleScroll = () => queueMeasurement();
  const handleResize = () => queueMeasurement();
  const handleFullscreen = () => queueMeasurement();
  ownerDocument.addEventListener("scroll", handleScroll, true);
  ownerDocument.addEventListener("fullscreenchange", handleFullscreen);
  ownerWindow.addEventListener("resize", handleResize);

  const MutationObserverConstructor = ownerGlobal.MutationObserver;
  const mutationObserver = MutationObserverConstructor
    ? new MutationObserverConstructor(queueMeasurement)
    : null;
  if (mutationObserver && ownerDocument.documentElement) {
    mutationObserver.observe(ownerDocument.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
      childList: true,
      subtree: true,
    });
  }
  const stopCoordinateObservation = coordinateSpace?.subscribe(queueMeasurement) ?? null;
  queueMeasurement();

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    coalescer.dispose();
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
    stopCoordinateObservation?.();
    ownerDocument.removeEventListener("scroll", handleScroll, true);
    ownerDocument.removeEventListener("fullscreenchange", handleFullscreen);
    ownerWindow.removeEventListener("resize", handleResize);
  };
}

function uniqueElements(elements: readonly Element[]): readonly Element[] {
  return [...new Set(elements)];
}

function sameElements(a: readonly Element[], b: readonly Element[]): boolean {
  return a.length === b.length && a.every((element, index) => element === b[index]);
}
