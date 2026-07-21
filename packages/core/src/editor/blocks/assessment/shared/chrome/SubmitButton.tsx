import { CheckIcon as Check } from "@phosphor-icons/react";
import { useId } from "react";

import { Button } from "@/ui/components/Button/Button";
import { cn } from "@/lib/cn";
import { iconSm } from "@/ui/tokens/icon-sizes";

import "./assessment-controls.css";

interface SubmitButtonProps {
  /** submit: pre-submission; retry: post-incorrect retryable;
   *  exhausted: max attempts hit; correct: post-submission correct. */
  mode: "submit" | "retry" | "exhausted" | "correct";
  /** Author-mode flag (also passed by callers for terminal states —
   * we ignore it in those cases because the soft-state styling does
   * the "non-interactive" cue itself). */
  disabled?: boolean;
  onClick?: () => void;
  description?: string | null;
}

/**
 * Submit / Try Again button. Resolves four states:
 *
 * - **submit / retry** → primary navy, interactive.
 * - **correct** → soft-state pattern (success-bg + accent hairline +
 *   success-text + check). Matches the choice-row "correct" treatment
 *   used elsewhere in the editor — never full-saturation teal here
 *   (too neon for a settled state) and never `disabled:opacity-50`
 *   (the washed pressed look).
 * - **exhausted** → settled secondary pill. Same idea: hairline
 *   neutral instead of faded primary navy.
 *
 * Author preview (`disabled` prop) only fades the button when the
 * mode is `submit` — the slot exists but the author isn't engaging.
 * For terminal modes the disabled flag is ignored: the variant
 * itself communicates "final state, not pressable".
 */
export function SubmitButton({ mode, disabled, onClick, description }: SubmitButtonProps) {
  const descriptionId = useId();
  const isTerminal = mode === "correct" || mode === "exhausted";
  const forceDisabled = disabled === true && !isTerminal;

  if (mode === "correct") {
    return (
      <button
        type="button"
        aria-disabled="true"
        // Soft-state pattern — matches `.ChoiceAnswerItem` correct
        // styling so the entire correctness moment feels coherent.
        // No `disabled` HTML attr → no `opacity-50` fade.
        className={cn("sc-assessment-submit-button", "sc-assessment-submit-button--correct")}
      >
        <Check
          size={iconSm}
          weight="bold"
          aria-hidden
          className="sc-assessment-submit-button__icon"
        />
        Correct
      </button>
    );
  }

  if (mode === "exhausted") {
    return (
      <button
        type="button"
        aria-disabled="true"
        // Settled neutral pill — visually present, not pressable, not
        // faded. Reads as "this is done" rather than "this button
        // broke".
        className={cn("sc-assessment-submit-button", "sc-assessment-submit-button--exhausted")}
      >
        Submitted
      </button>
    );
  }

  const text = mode === "retry" ? "Try again" : "Submit";

  return (
    <>
      <Button
        type="button"
        variant="primary"
        size="md"
        disabled={forceDisabled}
        aria-describedby={description ? descriptionId : undefined}
        onClick={onClick}
      >
        {text}
      </Button>
      {description ? (
        <span id={descriptionId} className="sc-sr-only">
          {description}
        </span>
      ) : null}
    </>
  );
}
