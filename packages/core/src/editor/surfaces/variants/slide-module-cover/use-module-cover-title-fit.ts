import { useLayoutEffect, useRef, type RefObject } from "react";

const TITLE_MAX_PX = 84;
const TITLE_MIN_PX = 48;
const TITLE_SIZE_PROPERTY = "--sc-slide-module-cover-title-size";

export function useModuleCoverTitleFit(): RefObject<HTMLDivElement | null> {
  const surfaceRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    let disposed = false;
    let frame = 0;
    const fit = () => {
      const content = surface.querySelector<HTMLElement>(
        "[data-surface-content], [data-node-view-content-react]",
      );
      const title = surface.querySelector<HTMLElement>("h1");
      if (!content || !title) return;

      surface.style.setProperty(TITLE_SIZE_PROPERTY, `${TITLE_MAX_PX}px`);

      let low = TITLE_MIN_PX;
      let high = TITLE_MAX_PX;
      while (low < high) {
        const candidate = Math.ceil((low + high) / 2);
        surface.style.setProperty(TITLE_SIZE_PROPERTY, `${candidate}px`);
        const finalSubtitle = surface.querySelector<HTMLElement>(
          '[data-slot="slide-cover-subtitle"]:last-of-type',
        );
        const surfaceRect = surface.getBoundingClientRect();
        const scaleY = surface.clientHeight > 0 ? surfaceRect.height / surface.clientHeight : 1;
        const contentBottom =
          surfaceRect.bottom - Number.parseFloat(getComputedStyle(surface).paddingBottom) * scaleY;
        const remainsInContent =
          !finalSubtitle || finalSubtitle.getBoundingClientRect().bottom <= contentBottom + 0.5;
        if (remainsInContent) {
          low = candidate;
        } else {
          high = candidate - 1;
        }
      }

      surface.style.setProperty(TITLE_SIZE_PROPERTY, `${low}px`);
    };
    const scheduleFit = () => {
      if (disposed) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    };

    fit();
    const resizeObserver = new ResizeObserver(scheduleFit);
    resizeObserver.observe(surface);
    const mutationObserver = new MutationObserver(scheduleFit);
    mutationObserver.observe(surface, { characterData: true, childList: true, subtree: true });
    if (document.fonts) {
      void document.fonts.ready.then(scheduleFit);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, []);

  return surfaceRef;
}
