import { useLayoutEffect } from "react";

interface HeaderElementRef {
  readonly current: Element | null;
}

interface HeaderHeightTargetRef {
  readonly current: HTMLElement | null;
}

/**
 * Measures the rendered header height and publishes it as
 * `--sc-editor-header-height` on the target element, so shell rails and the
 * bottom panel inherit the real value instead of a hardcoded constant.
 */
export function useMeasuredHeaderHeight(
  headerRef: HeaderElementRef,
  targetRef: HeaderHeightTargetRef,
): void {
  useLayoutEffect(() => {
    const header = headerRef.current;
    const target = targetRef.current;
    if (!header || !target) return;
    const applyHeight = (height: number) => {
      target.style.setProperty("--sc-editor-header-height", `${Math.round(height)}px`);
    };
    if (typeof ResizeObserver === "undefined") {
      applyHeight(header.getBoundingClientRect().height);
      return;
    }
    applyHeight(header.getBoundingClientRect().height);
    const observer = new ResizeObserver(() => {
      applyHeight(header.getBoundingClientRect().height);
    });
    observer.observe(header);
    return () => observer.disconnect();
  }, [headerRef, targetRef]);
}
