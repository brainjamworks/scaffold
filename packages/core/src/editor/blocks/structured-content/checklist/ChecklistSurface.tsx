import type { ReactNode } from "react";

import { CourseButton } from "@/ui/components/course/CourseActions/CourseActions";

export interface ChecklistProgress {
  completed: number;
  total: number;
}

export interface ChecklistResetAction {
  label: string;
  onClick: () => void;
  text: string;
}

export function ChecklistSection({
  children,
  listEnd,
  progress,
  resetAction,
}: {
  children: ReactNode;
  listEnd?: ReactNode;
  progress?: ChecklistProgress | null;
  resetAction?: ChecklistResetAction | null;
}) {
  const showHeader = Boolean(progress || resetAction);

  return (
    <section className="sc-course-checklist__section" aria-label="Checklist">
      {showHeader ? (
        <header contentEditable={false} className="sc-course-checklist__header">
          {progress ? (
            <span className="sc-course-checklist__progress">
              <span className="sc-course-checklist__progress-count">{progress.completed}</span>
              <span className="sc-course-checklist__progress-divider">/</span>
              <span className="sc-course-checklist__progress-total">{progress.total}</span>
              <span className="sc-course-checklist__progress-label">complete</span>
            </span>
          ) : (
            <span />
          )}
          {resetAction ? (
            <CourseButton
              type="button"
              size="compact"
              emphasis="quiet"
              className="sc-course-checklist__reset"
              onClick={resetAction.onClick}
              aria-label={resetAction.label}
            >
              {resetAction.text}
            </CourseButton>
          ) : null}
        </header>
      ) : null}

      <ul role="list" className="sc-course-checklist__list">
        {children}
        {listEnd ?? null}
      </ul>
    </section>
  );
}
