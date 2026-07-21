import { useLayoutEffect, useRef, useState } from "react";

import { renderRuntimeRichTextNode } from "@/editor/rich-text/runtime/render-rich-text";
import { cn } from "@/lib/cn";

import type { AnnotatedFigureAnnotationProjection } from "./annotated-figure-document-model";

export interface AnnotatedFigureRuntimeCaptionListProps {
  annotations: readonly AnnotatedFigureAnnotationProjection[];
  presentation?: "compact" | "expanded";
  visuallyHidden?: boolean;
}

/** Static learner projection of the persisted ordered annotation paragraphs. */
export function AnnotatedFigureRuntimeCaptionList({
  annotations,
  presentation = "compact",
  visuallyHidden = false,
}: AnnotatedFigureRuntimeCaptionListProps) {
  const listRef = useRef<HTMLOListElement | null>(null);
  const [overflow, setOverflow] = useState({ before: false, after: false });

  const updateOverflow = () => {
    const list = listRef.current;
    if (!list) return;
    const before = list.scrollTop > 1;
    const after = list.scrollTop + list.clientHeight < list.scrollHeight - 1;
    setOverflow((current) =>
      current.before === before && current.after === after ? current : { before, after },
    );
  };

  useLayoutEffect(() => {
    updateOverflow();
    const frame = requestAnimationFrame(updateOverflow);
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateOverflow);
    if (listRef.current) resizeObserver?.observe(listRef.current);
    const mutationObserver =
      typeof MutationObserver === "undefined" ? null : new MutationObserver(updateOverflow);
    if (listRef.current) {
      mutationObserver?.observe(listRef.current, {
        characterData: true,
        childList: true,
        subtree: true,
      });
    }
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, []);

  return (
    <ol
      ref={listRef}
      aria-label="Annotations"
      className={cn(
        "sc-annotated-figure__runtime-caption-list",
        !visuallyHidden && "sc-annotated-figure__legend",
        visuallyHidden && "sc-sr-only",
      )}
      data-overflow-after={overflow.after ? "true" : "false"}
      data-overflow-before={overflow.before ? "true" : "false"}
      data-presentation={presentation}
      data-visual={visuallyHidden ? "false" : "true"}
      onScroll={updateOverflow}
    >
      {annotations.map((annotation) => (
        <li
          key={annotation.id}
          className="sc-annotated-figure__annotation"
          data-annotation-id={annotation.id}
        >
          <span className="sc-annotated-figure__annotation-number" aria-hidden="true">
            {annotation.number}
          </span>
          <div className="sc-annotated-figure__annotation-caption">
            {renderRuntimeRichTextNode(
              annotation.captionNode.toJSON(),
              `annotated-figure-caption:${annotation.id}`,
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
