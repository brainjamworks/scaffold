import { useEffect, useRef, type RefObject, type ReactNode } from "react";

import { cn } from "@/lib/cn";

import "./assessment-controls.css";
import "./assessment-problem-shell.css";

const BOUNDED_SCROLL_ATTR = "data-assessment-bounded-scroll";
const BOUNDED_SCROLL_OVERFLOW_ATTR = "data-assessment-bounded-scroll-overflow";
const BOUNDED_SCROLL_END_ATTR = "data-assessment-bounded-scroll-end";
const BOUNDED_SCROLL_TOLERANCE_PX = 2;

interface ProblemShellProps {
  isEditable: boolean;
  blockClass?: string;
  surfaceAttributes?: Record<string, string>;
  /** Problem children — title, instructions, prompt, choices, hints,
   *  summary feedback. Typically NodeViewContent. */
  children: ReactNode;
}

/**
 * Outer card shell for every assessment block. Per the DS Cards spec:
 * flat white card, 1px gray-200 border, 10px radius, no shadow at rest.
 * Hover darkens the border to ink (matches `Card` primitive behaviour).
 * The same chrome both modes — at runtime the section is the question
 * card; at author time it's the working surface the author edits inside.
 *
 * Private authoring metadata such as hints and summary feedback remains
 * in the document tree, while action chrome is owned by the nested
 * assessment_actions_group node.
 */
export function ProblemShell({
  isEditable,
  blockClass,
  children,
  surfaceAttributes,
}: ProblemShellProps) {
  const shellRef = useRef<HTMLElement | null>(null);
  useAssessmentBoundedScrollAffordance(shellRef);

  return (
    <section
      ref={shellRef}
      data-assessment-shell=""
      data-editable={isEditable ? "true" : "false"}
      {...surfaceAttributes}
      className={cn("sc-assessment-shell", blockClass)}
    >
      {children}
    </section>
  );
}

interface BoundedScrollMetrics {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
}

export function resolveBoundedScrollAffordanceState({
  clientHeight,
  scrollHeight,
  scrollTop,
}: BoundedScrollMetrics): { atEnd: boolean; overflowing: boolean } {
  const overflowing = scrollHeight - clientHeight > BOUNDED_SCROLL_TOLERANCE_PX;
  const atEnd =
    !overflowing || scrollTop + clientHeight >= scrollHeight - BOUNDED_SCROLL_TOLERANCE_PX;

  return { atEnd, overflowing };
}

function useAssessmentBoundedScrollAffordance(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const shellRoot = root;

    const cleanupByLane = new Map<HTMLElement, () => void>();
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            refreshLanes();
          });

    const updateLane = (lane: HTMLElement) => {
      const state = resolveBoundedScrollAffordanceState({
        clientHeight: lane.clientHeight,
        scrollHeight: lane.scrollHeight,
        scrollTop: lane.scrollTop,
      });

      lane.toggleAttribute(BOUNDED_SCROLL_OVERFLOW_ATTR, state.overflowing);
      lane.toggleAttribute(BOUNDED_SCROLL_END_ATTR, state.atEnd);
    };

    const registerLane = (lane: HTMLElement) => {
      if (cleanupByLane.has(lane)) {
        updateLane(lane);
        return;
      }

      const handleScroll = () => updateLane(lane);
      lane.addEventListener("scroll", handleScroll, { passive: true });
      resizeObserver?.observe(lane);
      cleanupByLane.set(lane, () => {
        lane.removeEventListener("scroll", handleScroll);
        resizeObserver?.unobserve(lane);
      });
      updateLane(lane);
    };

    function refreshLanes() {
      const lanes = new Set(
        Array.from(shellRoot.querySelectorAll<HTMLElement>(`[${BOUNDED_SCROLL_ATTR}]`)),
      );

      for (const [lane, cleanup] of cleanupByLane) {
        if (!lanes.has(lane)) {
          cleanup();
          cleanupByLane.delete(lane);
        }
      }

      for (const lane of lanes) {
        registerLane(lane);
      }
    }

    const mutationObserver =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(() => {
            refreshLanes();
          });

    mutationObserver?.observe(shellRoot, {
      attributeFilter: ["style"],
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
    resizeObserver?.observe(shellRoot);
    refreshLanes();

    return () => {
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      for (const cleanup of cleanupByLane.values()) cleanup();
      cleanupByLane.clear();
    };
  }, [rootRef]);
}
