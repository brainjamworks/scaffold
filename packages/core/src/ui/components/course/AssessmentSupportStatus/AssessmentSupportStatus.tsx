import { EyeIcon } from "@phosphor-icons/react";

import "./AssessmentSupportStatus.css";

interface AssessmentSupportStatusProps {
  status: "answer-revealed";
}

/** Noninteractive Course status replacing a completed support action in place. */
export function AssessmentSupportStatus({ status }: AssessmentSupportStatusProps) {
  const label = "Answer revealed";

  return (
    <span
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={label}
      className="sc-course-assessment-support-status"
      data-assessment-support-status={status}
    >
      <EyeIcon
        size="1em"
        weight="bold"
        className="sc-course-assessment-support-status__icon"
        aria-hidden
      />
      <span>{label}</span>
    </span>
  );
}
