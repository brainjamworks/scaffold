import type { ReactNode } from "react";

import "./assessment-controls.css";

interface AssessmentActionsRowProps {
  leading?: ReactNode | undefined;
  commit?: ReactNode | undefined;
}

export function AssessmentActionsRow({ leading, commit }: AssessmentActionsRowProps) {
  return (
    <div data-slot="assessment-controls" className="sc-assessment-actions-row">
      <div className="sc-assessment-actions-row__leading">{leading}</div>
      <div className="sc-assessment-actions-row__commit" contentEditable={false}>
        {commit}
      </div>
    </div>
  );
}
