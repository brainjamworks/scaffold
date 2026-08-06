import type { ReactNode } from "react";

import "./assessment-hints.css";

interface HintItemProps {
  /** 1-based hint index. */
  index: number;
  /** Runtime reveal-counter passed by the parent bridge. */
  hintsShown: number;
  /** Static runtime content slot. */
  children?: ReactNode;
}

/** Runtime hint content. The shared Course popover owns the visible card and title. */
export function HintItem({ index, hintsShown, children }: HintItemProps) {
  if (index > hintsShown) return null;

  return (
    <div className="sc-course-assessment-hint">
      <div className="sc-course-assessment-hint__content">{children}</div>
    </div>
  );
}
