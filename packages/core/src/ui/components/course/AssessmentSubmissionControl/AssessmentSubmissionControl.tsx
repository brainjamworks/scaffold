import { CheckIcon } from "@phosphor-icons/react";
import { Button } from "@radix-ui/themes";
import { useId } from "react";

import "./AssessmentSubmissionControl.css";

export type AssessmentSubmissionActionHandler = () => void | Promise<void>;

type AssessmentSubmissionControlProps =
  | {
      state: "submit";
      disabled: boolean;
      disabledReason?: string | undefined;
      onAction: AssessmentSubmissionActionHandler;
    }
  | {
      state: "retry";
      disabled?: boolean | undefined;
      onAction: AssessmentSubmissionActionHandler;
    }
  | {
      state: "correct" | "submitted";
    };

/** Course-owned standalone-assessment submit, retry, and terminal response seam. */
export function AssessmentSubmissionControl(props: AssessmentSubmissionControlProps) {
  const disabledReasonId = useId();

  if ("onAction" in props) {
    const isSubmit = props.state === "submit";
    const disabledReason = isSubmit && props.disabled ? props.disabledReason : undefined;

    return (
      <div className="sc-course-assessment-submission-control">
        <Button
          type="button"
          size="3"
          variant="solid"
          className="sc-course-assessment-submission-control__button"
          data-assessment-submission-action={props.state}
          disabled={props.disabled ?? false}
          aria-describedby={disabledReason ? disabledReasonId : undefined}
          onClick={() => void props.onAction()}
        >
          {isSubmit ? "Submit" : "Try again"}
        </Button>
        {disabledReason ? (
          <span
            id={disabledReasonId}
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="sc-sr-only"
          >
            {disabledReason}
          </span>
        ) : null}
      </div>
    );
  }

  const label = props.state === "correct" ? "Correct" : "Submitted";

  return (
    <div className="sc-course-assessment-submission-control">
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-label={label}
        className="sc-course-assessment-submission-control__status"
        data-assessment-submission-status={props.state}
      >
        {props.state === "correct" ? (
          <CheckIcon
            size="1em"
            weight="bold"
            className="sc-course-assessment-submission-control__status-icon"
            aria-hidden
          />
        ) : null}
        <span>{label}</span>
      </span>
    </div>
  );
}
