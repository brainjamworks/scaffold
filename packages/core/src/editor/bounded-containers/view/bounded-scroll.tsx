import { useEffect, type RefObject } from "react";

export const BOUNDED_SCROLL_VIEWPORT_SELECTOR = "[data-bounded-scroll]";
export const BOUNDED_SCROLL_OVERFLOW_ATTR = "data-bounded-scroll-overflow";
export const BOUNDED_SCROLL_END_ATTR = "data-bounded-scroll-end";
const BOUNDED_SCROLL_TOLERANCE_PX = 2;

interface BoundedScrollMetrics {
  availableHeight?: number | undefined;
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
}

export function resolveBoundedScrollAffordanceState({
  availableHeight,
  clientHeight,
  scrollHeight,
  scrollTop,
}: BoundedScrollMetrics): { atEnd: boolean; overflowing: boolean } {
  const measuredAvailableHeight = availableHeight ?? clientHeight;
  const overflowing = scrollHeight - measuredAvailableHeight > BOUNDED_SCROLL_TOLERANCE_PX;
  const atEnd =
    !overflowing || scrollTop + clientHeight >= scrollHeight - BOUNDED_SCROLL_TOLERANCE_PX;

  return { atEnd, overflowing };
}

export function useBoundedScrollAffordance(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const boundedRoot: HTMLElement = root;

    const cleanupByViewport = new Map<HTMLElement, () => void>();
    let resizeObserver: ResizeObserver | null = null;

    const getResizeObserver = () => {
      if (resizeObserver || typeof ResizeObserver === "undefined") return resizeObserver;
      resizeObserver = new ResizeObserver(() => {
        refreshViewports();
      });
      resizeObserver.observe(boundedRoot);
      return resizeObserver;
    };

    const updateViewport = (viewport: HTMLElement) => {
      const frame = viewport.closest<HTMLElement>("[data-bounded-scroll-frame]");
      const state = resolveBoundedScrollAffordanceState({
        availableHeight: frame?.clientHeight,
        clientHeight: viewport.clientHeight,
        scrollHeight: viewport.scrollHeight,
        scrollTop: viewport.scrollTop,
      });

      viewport.toggleAttribute(BOUNDED_SCROLL_OVERFLOW_ATTR, state.overflowing);
      viewport.toggleAttribute(BOUNDED_SCROLL_END_ATTR, state.atEnd);
    };

    const registerViewport = (viewport: HTMLElement) => {
      if (cleanupByViewport.has(viewport)) {
        updateViewport(viewport);
        return;
      }

      const handleScroll = () => updateViewport(viewport);
      viewport.addEventListener("scroll", handleScroll, { passive: true });
      getResizeObserver()?.observe(viewport);
      cleanupByViewport.set(viewport, () => {
        viewport.removeEventListener("scroll", handleScroll);
        resizeObserver?.unobserve(viewport);
      });
      updateViewport(viewport);
    };

    function refreshViewports() {
      const viewports = new Set(
        Array.from(boundedRoot.querySelectorAll<HTMLElement>(BOUNDED_SCROLL_VIEWPORT_SELECTOR)),
      );

      if (boundedRoot.matches(BOUNDED_SCROLL_VIEWPORT_SELECTOR)) viewports.add(boundedRoot);

      for (const [viewport, cleanup] of cleanupByViewport) {
        if (!viewports.has(viewport)) {
          cleanup();
          cleanupByViewport.delete(viewport);
        }
      }

      for (const viewport of viewports) registerViewport(viewport);
    }

    const mutationObserver =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(() => {
            refreshViewports();
          });

    mutationObserver?.observe(boundedRoot, {
      attributeFilter: ["style"],
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
    refreshViewports();

    return () => {
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      for (const cleanup of cleanupByViewport.values()) cleanup();
      cleanupByViewport.clear();
    };
  }, [rootRef]);
}

export function BoundedScrollHint({ editable = false }: { editable?: boolean }) {
  return (
    <div
      data-bounded-scroll-hint=""
      contentEditable={editable ? false : undefined}
      aria-hidden="true"
    >
      Scroll for more ↓
    </div>
  );
}
