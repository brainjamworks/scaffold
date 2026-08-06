import { CheckIcon as Check, XIcon as X } from "@phosphor-icons/react";
import { useId, type ReactNode } from "react";

import { describeChoiceAccessibilityState } from "@/editor/blocks/assessment/shared/chrome/choice-accessibility";
import type { ChoiceState } from "@/editor/blocks/assessment/shared/runtime/types";
import { cn } from "@/lib/cn";
import { iconXs } from "@/ui/tokens/icon-sizes";

import "../AssessmentChoiceSurface/AssessmentChoiceSurface.css";

interface AssessmentSelectableChoiceRowProps {
  checked: boolean;
  children: ReactNode;
  disabled: boolean;
  disabledReason?: string;
  feedbackControl?: ReactNode;
  id: string;
  inputType: "radio" | "checkbox";
  name?: string;
  onSelect: () => void;
  state: ChoiceState;
  submitted?: boolean;
}

/** Course-owned learner row shared only by MCQ and Multi-select runtimes. */
export function AssessmentSelectableChoiceRow({
  checked,
  children,
  disabled,
  disabledReason,
  feedbackControl,
  id,
  inputType,
  name,
  onSelect,
  state,
  submitted = false,
}: AssessmentSelectableChoiceRowProps) {
  const descriptionId = useId();
  const accessibilityDescription = describeChoiceAccessibilityState({
    checked,
    hasFeedback: Boolean(feedbackControl),
    isEditable: false,
    state,
    submitted,
  });
  const accessibilityText = [accessibilityDescription?.text, disabledReason]
    .filter(Boolean)
    .join(" ");
  const courseState = state === "incorrect" ? "incorrect" : state ? "correct" : undefined;
  const showCheck = inputType === "checkbox" || state === "correct" || state === "missed";
  const indicatorMark =
    state === "incorrect" ? (
      <X size={iconXs} weight="bold" className="sc-course-assessment-choice__mark" aria-hidden />
    ) : showCheck && (checked || state === "correct" || state === "missed") ? (
      <Check
        size={iconXs}
        weight="bold"
        className="sc-course-assessment-choice__mark"
        aria-hidden
      />
    ) : checked ? (
      <span className="sc-course-assessment-choice__dot" />
    ) : null;

  return (
    <>
      <div
        className={cn(
          "sc-course-assessment-choice",
          !disabled && "sc-course-assessment-choice--interactive",
        )}
        data-course-state={courseState}
        data-result-state={state ?? undefined}
        data-selected={checked || undefined}
        data-disabled={disabled || undefined}
      >
        <label className="sc-course-assessment-choice__label">
          <span className="sc-course-assessment-choice__native-control">
            <input
              type={inputType}
              name={name}
              value={id}
              checked={checked}
              disabled={disabled}
              required={inputType === "radio"}
              onChange={onSelect}
              aria-describedby={accessibilityText ? descriptionId : undefined}
              className="sc-course-assessment-choice__input"
            />
            <span
              className="sc-course-assessment-choice__indicator"
              data-shape={inputType}
              data-state={state ?? (checked ? "selected" : "idle")}
            >
              {indicatorMark}
            </span>
          </span>
          <span className="sc-course-assessment-choice__content">{children}</span>
        </label>
        {state !== null ? feedbackControl : null}
      </div>
      {accessibilityText ? (
        <span id={descriptionId} className="sc-sr-only">
          {accessibilityText}
        </span>
      ) : null}
    </>
  );
}
