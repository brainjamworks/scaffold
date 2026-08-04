import { useRef } from "react";

import {
  BoundedScrollHint,
  useBoundedScrollAffordance,
} from "@/editor/bounded-containers/view/bounded-scroll";
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
  const frameRef = useRef<HTMLDivElement | null>(null);
  useBoundedScrollAffordance(frameRef);

  const list = (
    <ol
      aria-label="Annotations"
      className={cn(
        "sc-course-annotated-figure__runtime-caption-list",
        !visuallyHidden && "sc-course-annotated-figure__legend",
        visuallyHidden && "sc-sr-only",
      )}
      {...(!visuallyHidden ? { "data-bounded-scroll": "" } : {})}
      data-presentation={presentation}
      data-visual={visuallyHidden ? "false" : "true"}
    >
      {annotations.map((annotation) => (
        <li
          key={annotation.id}
          className="sc-course-annotated-figure__annotation"
          data-annotation-id={annotation.id}
        >
          <span className="sc-course-annotated-figure__annotation-number" aria-hidden="true">
            {annotation.number}
          </span>
          <div className="sc-course-annotated-figure__annotation-caption">
            {annotation.title ? (
              <strong className="sc-course-annotated-figure__annotation-title">
                {annotation.title}
              </strong>
            ) : null}
            {renderRuntimeRichTextNode(
              annotation.captionNode.toJSON(),
              `annotated-figure-caption:${annotation.id}`,
            )}
          </div>
        </li>
      ))}
    </ol>
  );

  if (visuallyHidden) return list;

  return (
    <div
      ref={frameRef}
      className="sc-course-annotated-figure__runtime-caption-frame"
      data-bounded-scroll-frame=""
      data-presentation={presentation}
    >
      {list}
      <BoundedScrollHint />
    </div>
  );
}
