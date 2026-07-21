import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CaretDownIcon as CaretDown, CaretUpIcon as CaretUp } from "@phosphor-icons/react";

import "./editor-rail-viewport.css";

interface EditorRailViewportProps {
  side: "left" | "right";
  children: ReactNode;
}

function hasRailOverflow(element: HTMLElement): boolean {
  return element.scrollHeight - element.clientHeight > 1;
}

export function EditorRailViewport({ side, children }: EditorRailViewportProps) {
  const scrollportRef = useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  const label = side === "left" ? "Editor tools" : "Insert tools";

  const updateOverflow = useCallback(() => {
    const scrollport = scrollportRef.current;
    if (!scrollport) return;

    const next = hasRailOverflow(scrollport);
    setHasOverflow((current) => (current === next ? current : next));
  }, []);

  useEffect(() => {
    const scrollport = scrollportRef.current;
    const view = scrollport?.ownerDocument.defaultView;
    if (!scrollport || !view) return;

    updateOverflow();

    const resizeObserver =
      "ResizeObserver" in view ? new view.ResizeObserver(updateOverflow) : null;
    resizeObserver?.observe(scrollport);
    if (scrollport.firstElementChild) {
      resizeObserver?.observe(scrollport.firstElementChild);
    }

    view.addEventListener("resize", updateOverflow);

    return () => {
      resizeObserver?.disconnect();
      view.removeEventListener("resize", updateOverflow);
    };
  }, [updateOverflow]);

  const scrollByDirection = useCallback((direction: -1 | 1) => {
    const scrollport = scrollportRef.current;
    const view = scrollport?.ownerDocument.defaultView;
    if (!scrollport || !view) return;

    const prefersReducedMotion = view.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const distance = Math.max(72, Math.floor(scrollport.clientHeight * 0.65));
    scrollport.scrollBy({
      top: direction * distance,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }, []);

  return (
    <div
      className="sc-editor-rail-viewport"
      data-overflow={hasOverflow ? "true" : "false"}
      data-side={side}
    >
      <div className="sc-editor-rail-frame">
        <button
          type="button"
          className="sc-editor-rail-scroll-button"
          data-edge="top"
          aria-label={`Scroll ${label.toLowerCase()} up`}
          disabled={!hasOverflow}
          onClick={() => scrollByDirection(-1)}
        >
          <CaretUp size={14} weight="bold" aria-hidden="true" />
        </button>
        <div
          ref={scrollportRef}
          className="sc-editor-rail-scrollport"
          role="region"
          aria-label={label}
        >
          {children}
        </div>
        <button
          type="button"
          className="sc-editor-rail-scroll-button"
          data-edge="bottom"
          aria-label={`Scroll ${label.toLowerCase()} down`}
          disabled={!hasOverflow}
          onClick={() => scrollByDirection(1)}
        >
          <CaretDown size={14} weight="bold" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
