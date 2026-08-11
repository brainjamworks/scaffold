import { CheckIcon as Check, PlusIcon as Plus, TrashIcon as Trash } from "@phosphor-icons/react";
import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { iconSm } from "@/ui/tokens/icon-sizes";
import { authoringMovementSilhouetteSurfaceAttributes } from "@/editor/movement/view/authoring-movement-presentation";

import "../AssessmentChoiceSurface/AssessmentChoiceSurface.css";
import "./AssessmentChoiceAuthoringRow.css";

export interface AssessmentChoiceAuthoringActionProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label" | "children"
> {
  active?: boolean;
  children: ReactNode;
  intent: "move" | "correctness" | "feedback" | "options" | "delete";
  label: string;
  unavailableReason?: string;
}

/** Course-themed action embedded in an authoring choice surface. */
export const AssessmentChoiceAuthoringAction = forwardRef<
  HTMLButtonElement,
  AssessmentChoiceAuthoringActionProps
>(function AssessmentChoiceAuthoringAction(
  {
    active = false,
    children,
    className,
    intent,
    label,
    onClick,
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
      className={cn("sc-course-assessment-choice__authoring-action", className)}
      contentEditable={false}
      data-authoring-movement-snapshot-chrome=""
      data-active={active || undefined}
      data-intent={intent}
      data-no-select=""
      onClick={(event) => {
        event.stopPropagation();
        if (unavailable) return;
        onClick?.(event);
      }}
    >
      {children}
      {unavailable ? (
        <span id={explanationId} className="sc-sr-only">
          {unavailableReason}
        </span>
      ) : null}
    </button>
  );
});

export interface AssessmentChoiceAuthoringRowProps {
  children: ReactNode;
  correct: boolean;
  correctnessLabel: string;
  correctnessUnavailableReason?: string;
  deleteAction: {
    label: string;
    onAction: () => void;
    unavailableReason?: string;
  };
  feedbackControl?: ReactNode;
  movementControl?: ReactNode;
  onToggleCorrect: () => void;
}

/** Course-owned choice surface composed by authoring behavior adapters. */
export function AssessmentChoiceAuthoringRow({
  children,
  correct,
  correctnessLabel,
  correctnessUnavailableReason,
  deleteAction,
  feedbackControl,
  movementControl,
  onToggleCorrect,
}: AssessmentChoiceAuthoringRowProps) {
  return (
    <div
      {...authoringMovementSilhouetteSurfaceAttributes()}
      className="sc-course-assessment-choice sc-course-assessment-choice--authoring"
      data-author-correct={correct || undefined}
    >
      {movementControl ? (
        <div className="sc-course-assessment-choice__authoring-movement">{movementControl}</div>
      ) : null}
      <AssessmentChoiceAuthoringAction
        active={correct}
        aria-pressed={correct}
        className="sc-course-assessment-choice__authoring-correctness"
        intent="correctness"
        label={correctnessLabel}
        onClick={onToggleCorrect}
        {...(correctnessUnavailableReason
          ? { unavailableReason: correctnessUnavailableReason }
          : {})}
      >
        <Check size={iconSm} weight="bold" aria-hidden />
      </AssessmentChoiceAuthoringAction>
      <div className="sc-course-assessment-choice__authoring-content">{children}</div>
      {feedbackControl ? (
        <div className="sc-course-assessment-choice__authoring-feedback">{feedbackControl}</div>
      ) : null}
      <AssessmentChoiceAuthoringAction
        className="sc-course-assessment-choice__authoring-delete"
        intent="delete"
        label={deleteAction.label}
        onClick={deleteAction.onAction}
        {...(deleteAction.unavailableReason
          ? { unavailableReason: deleteAction.unavailableReason }
          : {})}
      >
        <Trash size={iconSm} aria-hidden />
      </AssessmentChoiceAuthoringAction>
    </div>
  );
}

export interface AssessmentChoiceAddButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> {
  label?: string;
}

/** Course-themed add action embedded beneath authored choices. */
export function AssessmentChoiceAddButton({
  className,
  label = "Add choice",
  type = "button",
  ...props
}: AssessmentChoiceAddButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={cn("sc-course-assessment-choice-add", className)}
      contentEditable={false}
      data-authoring-movement-snapshot-chrome=""
      data-no-select=""
    >
      <span className="sc-course-assessment-choice-add__icon" aria-hidden>
        <Plus size={iconSm} />
      </span>
      <span>{label}</span>
    </button>
  );
}
