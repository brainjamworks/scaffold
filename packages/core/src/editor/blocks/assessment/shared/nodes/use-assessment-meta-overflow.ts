import { useLayoutEffect, useRef, useState, type RefObject } from "react";

const OVERFLOW_TOLERANCE_PX = 1;
const MARQUEE_MIN_DURATION_SECONDS = 5;
const MARQUEE_MAX_DURATION_SECONDS = 12;
const MARQUEE_TRAVEL_PX_PER_SECOND = 45;

export function measureAssessmentMetaOverflow(wrapper: HTMLElement): {
  hasOverflow: boolean;
  overflowDistance: number;
} {
  const content = wrapper.querySelector<HTMLElement>(".sc-course-assessment-meta-content--inline");
  const text = content?.querySelector<HTMLElement>("p");
  if (!content || !text) return { hasOverflow: false, overflowDistance: 0 };
  if (content.clientWidth <= 0) return { hasOverflow: false, overflowDistance: 0 };

  let renderedTextWidth = 0;
  try {
    const range = wrapper.ownerDocument.createRange();
    range.selectNodeContents(text);
    renderedTextWidth = range.getBoundingClientRect().width;
  } catch {
    renderedTextWidth = 0;
  }
  renderedTextWidth = Math.max(renderedTextWidth, text.scrollWidth);
  if (renderedTextWidth - content.clientWidth <= OVERFLOW_TOLERANCE_PX) {
    renderedTextWidth = Math.max(renderedTextWidth, measureUnclippedTextWidth(wrapper));
  }
  const overflowDistance = Math.max(0, renderedTextWidth - content.clientWidth);
  return {
    hasOverflow: overflowDistance > OVERFLOW_TOLERANCE_PX,
    overflowDistance,
  };
}

function measureUnclippedTextWidth(wrapper: HTMLElement): number {
  const probe = wrapper.cloneNode(true) as HTMLElement;
  probe.inert = true;
  probe.setAttribute("aria-hidden", "true");
  probe.removeAttribute("aria-label");
  probe.removeAttribute("data-course-overflow");
  probe.removeAttribute("tabindex");
  for (const element of probe.querySelectorAll<HTMLElement>("[id]")) {
    element.removeAttribute("id");
  }
  Object.assign(probe.style, {
    contain: "layout paint style",
    inset: "0 auto auto -100000px",
    maxInlineSize: "none",
    pointerEvents: "none",
    position: "fixed",
    visibility: "hidden",
    width: "max-content",
  });

  const probeContent = probe.querySelector<HTMLElement>(
    ".sc-course-assessment-meta-content--inline",
  );
  const probeText = probeContent?.querySelector<HTMLElement>("p");
  if (!probeContent || !probeText) return 0;
  Object.assign(probeContent.style, {
    flex: "0 0 auto",
    maxInlineSize: "none",
    overflow: "visible",
    width: "max-content",
  });
  Object.assign(probeText.style, {
    animation: "none",
    maxInlineSize: "none",
    overflow: "visible",
    textOverflow: "clip",
    transform: "none",
    width: "max-content",
    whiteSpace: "nowrap",
  });

  const probeRoot = wrapper.closest<HTMLElement>(".sc-course") ?? wrapper.ownerDocument.body;
  probeRoot.append(probe);
  const width = Math.max(probeText.scrollWidth, probeText.getBoundingClientRect().width);
  probe.remove();
  return width;
}

export function useAssessmentMetaOverflow(contentText: string): {
  wrapperRef: RefObject<HTMLDivElement | null>;
  hasOverflow: boolean;
} {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    const view = wrapper?.ownerDocument.defaultView;
    if (!wrapper || !view) return;
    const content = wrapper.querySelector<HTMLElement>(
      ".sc-course-assessment-meta-content--inline",
    );
    if (!content) return;

    let disposed = false;
    let frame = 0;
    const measure = () => {
      if (disposed) return;
      const { hasOverflow: next, overflowDistance } = measureAssessmentMetaOverflow(wrapper);
      wrapper.style.setProperty(
        "--sc-course-assessment-meta-marquee-distance",
        `${overflowDistance}px`,
      );
      wrapper.style.setProperty(
        "--sc-course-assessment-meta-marquee-duration",
        `${Math.min(
          MARQUEE_MAX_DURATION_SECONDS,
          Math.max(MARQUEE_MIN_DURATION_SECONDS, overflowDistance / MARQUEE_TRAVEL_PX_PER_SECOND),
        )}s`,
      );
      setHasOverflow((current) => (current === next ? current : next));
    };
    const scheduleMeasure = () => {
      if (disposed) return;
      view.cancelAnimationFrame(frame);
      frame = view.requestAnimationFrame(measure);
    };

    measure();
    const resizeObserver =
      "ResizeObserver" in view ? new view.ResizeObserver(scheduleMeasure) : null;
    resizeObserver?.observe(wrapper);
    resizeObserver?.observe(content);
    const mutationObserver = new view.MutationObserver(scheduleMeasure);
    mutationObserver.observe(content, { characterData: true, childList: true, subtree: true });
    view.addEventListener("resize", scheduleMeasure);
    if (content.ownerDocument.fonts) {
      void content.ownerDocument.fonts.ready.then(scheduleMeasure);
    }

    return () => {
      disposed = true;
      view.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
      view.removeEventListener("resize", scheduleMeasure);
    };
  }, [contentText]);

  return { wrapperRef, hasOverflow };
}
