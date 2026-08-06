import type { ReactNode, Ref } from "react";

import "./CoursePopoverSurface.css";

export type CoursePopoverSurfaceTone = "annotation" | "feedback" | "hint" | "neutral";

export interface CoursePopoverSurfaceProps {
  bodyRef?: Ref<HTMLDivElement>;
  children?: ReactNode;
  description?: ReactNode;
  descriptionId?: string;
  footerEnd?: ReactNode;
  footerStart?: ReactNode;
  headerActions?: ReactNode;
  icon?: ReactNode;
  meta?: ReactNode;
  title: ReactNode;
  titleId?: string;
  tone?: CoursePopoverSurfaceTone;
}

export function CoursePopoverSurface({
  bodyRef,
  children,
  description,
  descriptionId,
  footerEnd,
  footerStart,
  headerActions,
  icon,
  meta,
  title,
  titleId,
  tone = "neutral",
}: CoursePopoverSurfaceProps) {
  const hasFooter = Boolean(footerStart || footerEnd);

  return (
    <div className="sc-course-popover-surface" data-scaffold-popover-surface="" data-tone={tone}>
      <header className="sc-course-popover-surface__header" data-slot="popover-surface-header">
        {icon ? (
          <span className="sc-course-popover-surface__icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <div className="sc-course-popover-surface__heading">
          <div className="sc-course-popover-surface__title-row">
            <h2 id={titleId} className="sc-course-popover-surface__title">
              {title}
            </h2>
            {meta ? <span className="sc-course-popover-surface__meta">{meta}</span> : null}
          </div>
          {description ? (
            <p id={descriptionId} className="sc-course-popover-surface__description">
              {description}
            </p>
          ) : null}
        </div>
        {headerActions ? (
          <div className="sc-course-popover-surface__header-actions">{headerActions}</div>
        ) : null}
      </header>

      <div
        ref={bodyRef}
        className="sc-course-popover-surface__body"
        data-slot="popover-surface-body"
      >
        {children}
      </div>

      {hasFooter ? (
        <footer className="sc-course-popover-surface__footer" data-slot="popover-surface-footer">
          {footerStart ? (
            <div className="sc-course-popover-surface__footer-start">{footerStart}</div>
          ) : null}
          {footerEnd ? (
            <div className="sc-course-popover-surface__footer-end">{footerEnd}</div>
          ) : null}
        </footer>
      ) : null}
    </div>
  );
}
