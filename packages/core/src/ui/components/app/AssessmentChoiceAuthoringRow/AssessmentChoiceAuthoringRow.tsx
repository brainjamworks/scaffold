import { CheckIcon as Check, TrashIcon as Trash } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { iconSm } from "@/ui/tokens/icon-sizes";
import { AssessmentAuthoringIconAction } from "../AssessmentAuthoringIconAction/AssessmentAuthoringIconAction";

import "./AssessmentChoiceAuthoringRow.css";

export interface AssessmentChoiceAuthoringRowProps {
  children: ReactNode;
  correct: boolean;
  deleteAction: {
    label: string;
    onAction: () => void;
    unavailableReason?: string;
  };
  feedbackControl?: ReactNode;
  movementControl?: ReactNode;
  onToggleCorrect: () => void;
}

/** App-owned authoring row for assessment choices; document mutations stay with the feature. */
export function AssessmentChoiceAuthoringRow({
  children,
  correct,
  deleteAction,
  feedbackControl,
  movementControl,
  onToggleCorrect,
}: AssessmentChoiceAuthoringRowProps) {
  return (
    <div className="sc-app-assessment-choice-row" data-author-correct={correct || undefined}>
      {movementControl ? (
        <div className="sc-app-assessment-choice-row__movement">{movementControl}</div>
      ) : null}
      <AssessmentAuthoringIconAction
        active={correct}
        aria-pressed={correct}
        className="sc-app-assessment-choice-row__correctness"
        label="Toggle whether this choice is correct"
        onClick={onToggleCorrect}
      >
        <Check size={iconSm} weight="bold" aria-hidden />
      </AssessmentAuthoringIconAction>
      <div className="sc-app-assessment-choice-row__content">{children}</div>
      {feedbackControl ? (
        <div className="sc-app-assessment-choice-row__feedback">{feedbackControl}</div>
      ) : null}
      <AssessmentAuthoringIconAction
        className="sc-app-assessment-choice-row__delete"
        label={deleteAction.label}
        onClick={deleteAction.onAction}
        tone="danger"
        {...(deleteAction.unavailableReason
          ? { unavailableReason: deleteAction.unavailableReason }
          : {})}
      >
        <Trash size={iconSm} aria-hidden />
      </AssessmentAuthoringIconAction>
    </div>
  );
}
