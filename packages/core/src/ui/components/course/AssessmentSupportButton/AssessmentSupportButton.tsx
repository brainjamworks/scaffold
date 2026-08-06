import { Button } from "@radix-ui/themes";
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";

import "./AssessmentSupportButton.css";

export type AssessmentSupportIntent = "answer" | "feedback" | "hint";

interface AssessmentSupportButtonProps extends Omit<
  ComponentPropsWithoutRef<"button">,
  "children" | "className" | "color" | "size" | "style" | "type"
> {
  children: ReactNode;
  endIcon?: ReactNode | undefined;
  expanded?: boolean | undefined;
  icon?: ReactNode | undefined;
  intent: AssessmentSupportIntent;
  outcome?: "correct" | "incorrect" | undefined;
}

/** Low-emphasis Course action used by independent assessment support features. */
export const AssessmentSupportButton = forwardRef<HTMLButtonElement, AssessmentSupportButtonProps>(
  function AssessmentSupportButton(
    { children, endIcon, expanded, icon, intent, outcome, ...buttonProps },
    forwardedRef,
  ) {
    return (
      <Button
        ref={forwardedRef}
        {...buttonProps}
        type="button"
        size="3"
        variant="ghost"
        className="sc-course-assessment-support-button"
        data-assessment-support-intent={intent}
        data-assessment-support-outcome={outcome}
        aria-expanded={expanded}
      >
        {icon ? (
          <span className="sc-course-assessment-support-button__icon" aria-hidden>
            {icon}
          </span>
        ) : null}
        <span className="sc-course-assessment-support-button__label">{children}</span>
        {endIcon ? (
          <span
            className="sc-course-assessment-support-button__end-icon"
            data-expanded={expanded ? "true" : undefined}
            aria-hidden
          >
            {endIcon}
          </span>
        ) : null}
      </Button>
    );
  },
);
