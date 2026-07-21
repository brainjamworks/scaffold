import { CheckIcon as Check, XIcon as X, TrashIcon as Trash } from "@phosphor-icons/react";
import { useId, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { iconSm, iconXs } from "@/ui/tokens/icon-sizes";

import { describeChoiceAccessibilityState } from "./choice-accessibility";
import type { ChoiceState } from "../runtime/types";
import "./choice-answer-item.css";
import "./choice-trailing-button.css";

interface ChoiceAnswerItemProps {
  /** Stable choice id (uuid). */
  id: string;
  /** Group name for runtime radio/checkbox grouping (e.g. `mcq-{nodeId}`). */
  name?: string;
  /** Native input semantics. */
  inputType: "radio" | "checkbox";
  /** Author has marked this choice correct. */
  isCorrect: boolean;
  /** Shared authoring or runtime feedback affordance. */
  feedbackControl?: ReactNode;
  /** Author mode (true) or runtime (false). */
  isEditable: boolean;
  /** Post-grading visual state (runtime only). */
  state: ChoiceState;
  /** Picked (runtime) or marked-correct (author). */
  checked: boolean;
  /** Runtime: answer has been formally submitted. */
  submitted?: boolean;
  /** Disabled (post-submit runtime). */
  disabled: boolean;
  /** Runtime: selection. */
  onSelect: () => void;
  /** Author: indicator click toggles isCorrect. */
  onToggleCorrect: () => void;
  /** Author: row delete. */
  onDelete: () => void;
  /** Author: accessible label for the row delete action. */
  deleteLabel?: string;
  /** Content slot — NodeViewContent (author) or static HTML (runtime). */
  children: ReactNode;
  /** Optional leading slot — author-mode drag grip lives here. Renders
   *  as the first child inside the pill so it shares the row chrome. */
  leading?: ReactNode;
}

/**
 * One choice "pill" — the centrepiece of every choice-family question
 * (MCQ, Multiselect, Dropdown's authoring view). Per `brand/DESIGN-SYSTEM.md`,
 * the pill is
 * the distinctive component move; the indicator (radio circle or
 * checkbox square) lives INSIDE the pill at the left, and the whole
 * row is the click target.
 *
 * Two shapes share the same chrome:
 *
 *  - **Runtime** — `<label>` with hidden native `<input>`. Clicking
 *    anywhere on the pill selects (radio/checkbox semantics free).
 *    Post-submit, the pill fills with the brand colour for its state
 *    (teal correct, coral incorrect, teal-tint missed) — colour +
 *    icon + text in concert so colour-blind learners are covered.
 *
 *  - **Author** — `<div>` with the indicator as a `<button>` so
 *    clicking text in the inline editor doesn't toggle correctness.
 *    Trash slides in on hover; feedback popover always visible.
 *
 * Soft-pill radius (`--radius-xl`, 16px) so long / multi-line content
 * reads as a generous lozenge rather than a stretched capsule — full
 * 999px pill is reserved for buttons.
 */
export function ChoiceAnswerItem({
  id,
  name,
  inputType,
  isCorrect,
  feedbackControl,
  isEditable,
  state,
  checked,
  submitted = false,
  disabled,
  onSelect,
  onToggleCorrect,
  onDelete,
  deleteLabel,
  children,
  leading,
}: ChoiceAnswerItemProps) {
  const descriptionId = useId();
  const hasFeedback = Boolean(feedbackControl);
  const accessibilityDescription = describeChoiceAccessibilityState({
    checked,
    hasFeedback,
    isEditable,
    state,
    submitted,
  });

  const pillClasses = cn(
    "sc-choice-answer",
    isEditable && "sc-choice-answer--editable",
    state === null && checked && !isEditable && "sc-choice-answer--checked-runtime",
    state === "correct" && "sc-choice-answer--correct",
    state === "incorrect" && "sc-choice-answer--incorrect",
    state === "missed" && "sc-choice-answer--missed",
    state === null && !checked && (isEditable || !disabled) && "sc-choice-answer--interactive",
    state === null && !checked && disabled && !isEditable && "sc-choice-answer--disabled",
  );

  const indicatorClasses = cn(
    "sc-choice-answer__indicator",
    inputType === "checkbox"
      ? "sc-choice-answer__indicator--checkbox"
      : "sc-choice-answer__indicator--radio",
    state === null && checked && !isEditable && "sc-choice-answer__indicator--checked-runtime",
    state === null && checked && isEditable && "sc-choice-answer__indicator--checked-author",
    state === null && !checked && "sc-choice-answer__indicator--unchecked",
    state === "correct" && "sc-choice-answer__indicator--correct",
    state === "incorrect" && "sc-choice-answer__indicator--incorrect",
    state === "missed" && "sc-choice-answer__indicator--missed",
  );

  // Indicator's inner mark. Each state owns its semantic colour:
  //  - **Pre-submit picked (runtime)**: navy dot — "this is my answer"
  //  - **Author-marked correct**: teal check — "this is the right one"
  //  - **Correct (post-submit)**: teal check
  //  - **Incorrect (post-submit)**: coral X — wrong-answer signal in
  //    the same place the tick would land if right
  //  - **Missed (post-submit)**: teal check on dashed pill
  //  - **Checkbox selected**: teal check (author + runtime)
  const indicatorMark = (() => {
    if (!checked && state !== "correct" && state !== "missed" && state !== "incorrect") return null;
    if (state === "incorrect") {
      return (
        <X
          size={iconXs}
          weight="bold"
          className="sc-choice-answer__mark sc-choice-answer__mark--incorrect"
          aria-hidden
        />
      );
    }
    const showCheck = inputType === "checkbox" || state === "correct" || state === "missed";
    // Runtime pre-submit-picked = navy. Author-marked correct + correct
    // + missed = teal.
    const tone =
      state === null && checked && !isEditable
        ? "sc-choice-answer__mark--primary"
        : "sc-choice-answer__mark--accent";
    if (showCheck) {
      return (
        <Check
          size={iconXs}
          weight="bold"
          className={cn("sc-choice-answer__mark", tone)}
          aria-hidden
        />
      );
    }
    return <span className="sc-choice-answer__dot" />;
  })();

  const contentClasses = "sc-choice-answer__content";

  if (!isEditable) {
    return (
      <>
        <label className={pillClasses}>
          <span className="sc-choice-answer__native-control">
            <input
              type={inputType}
              name={name}
              value={id}
              checked={checked}
              disabled={disabled}
              onChange={onSelect}
              aria-describedby={accessibilityDescription ? descriptionId : undefined}
              className="sc-choice-answer__input"
            />
            <span className={indicatorClasses}>{indicatorMark}</span>
          </span>
          <span className={contentClasses}>{children}</span>
          {/* Per-choice feedback gates on `state` (the graded result), not
            `disabled`. That way:
              - picked + wrong / right → feedback appears immediately on
                that choice after submit (explain the pick)
              - other un-picked choices → no feedback leak post-submit
              - correct choice → feedback appears once Show answer is
                clicked (state flips to 'missed') — explanation of the
                right answer revealed in lockstep with the answer itself
            Pre-submit no choice has a non-null state, so nothing leaks. */}
          {state !== null && feedbackControl}
        </label>
        {accessibilityDescription ? (
          <span id={descriptionId} className="sc-sr-only">
            {accessibilityDescription.text}
          </span>
        ) : null}
      </>
    );
  }

  return (
    <div className={pillClasses} data-author-correct={isCorrect || undefined}>
      {leading}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleCorrect();
        }}
        aria-pressed={checked}
        aria-label={
          isCorrect ? "Marked correct — click to unmark" : "Click to mark this choice correct"
        }
        className={cn(indicatorClasses, "sc-choice-answer__indicator-button")}
        data-no-select
      >
        {indicatorMark}
      </button>
      <div className={contentClasses}>{children}</div>
      {feedbackControl}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        aria-label={deleteLabel ?? "Delete choice"}
        data-no-select
        className={cn(CHOICE_TRAILING_BTN, "sc-choice-trailing-button--danger")}
      >
        <Trash size={iconSm} />
      </button>
    </div>
  );
}

/**
 * Trailing action vocabulary for in-pill icon buttons (delete, feedback).
 * 24×24 circular button with currentColor inheritance so colour follows
 * the pill tint; ink-tinted hover bg works against any state-coloured fill.
 * Shared by `ChoiceAnswerItem` and its supplied feedback control to guarantee
 * identical metrics and prevent baseline drift between trailing icons.
 */
export const CHOICE_TRAILING_BTN = "sc-choice-trailing-button";
