import type { ReactNode } from "react";

import "./assessment-control-layout.css";

interface AssessmentControlLayoutProps {
  submission?: ReactNode | undefined;
  support?: ReactNode | undefined;
}

/** Feature-local structural compositor for standalone assessment controls. */
export function AssessmentControlLayout({ submission, support }: AssessmentControlLayoutProps) {
  return (
    <div data-slot="assessment-controls" className="sc-assessment-control-layout">
      <div className="sc-assessment-control-layout__support" data-assessment-control-zone="support">
        {support}
      </div>
      <div
        className="sc-assessment-control-layout__submission"
        data-assessment-control-zone="submission"
        contentEditable={false}
      >
        {submission}
      </div>
    </div>
  );
}
