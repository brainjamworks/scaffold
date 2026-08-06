import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/cn";

import "./AssessmentAuthoringIconAction.css";

export interface AssessmentAuthoringIconActionProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label" | "children"
> {
  active?: boolean;
  children: ReactNode;
  label: string;
  tone?: "neutral" | "danger";
  unavailableReason?: string;
}

/** App-owned compact icon action used by assessment authoring rows and fields. */
export const AssessmentAuthoringIconAction = forwardRef<
  HTMLButtonElement,
  AssessmentAuthoringIconActionProps
>(function AssessmentAuthoringIconAction(
  {
    active = false,
    children,
    className,
    label,
    onClick,
    tone = "neutral",
    type = "button",
    unavailableReason,
    ...props
  },
  ref,
) {
  const explanationId = useId();
  const unavailable = Boolean(unavailableReason);

  return (
    <button
      {...props}
      ref={ref}
      type={type}
      aria-disabled={unavailable || undefined}
      aria-describedby={unavailable ? explanationId : props["aria-describedby"]}
      aria-label={label}
      className={cn("sc-app-assessment-authoring-icon-action", className)}
      contentEditable={false}
      data-active={active || undefined}
      data-no-select
      data-tone={tone}
      onClick={(event) => {
        event.stopPropagation();
        if (unavailable) return;
        onClick?.(event);
      }}
    >
      {children}
      {unavailable ? (
        <span id={explanationId} className="sc-app-assessment-authoring-icon-action__explanation">
          {unavailableReason}
        </span>
      ) : null}
    </button>
  );
});
