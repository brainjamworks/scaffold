import { attemptCounterAccessibilityLabel } from "./action-accessibility";
import "./assessment-controls.css";

interface AttemptCounterProps {
  attempts: number;
  maxAttempts: number | null;
}

/**
 * Attempt counter — rendered as inline status text with tabular
 * numerals so the numeric step "1 of 3" does not jiggle as attempts
 * advance. Tone escalates with urgency:
 *
 *  - neutral on the first attempts
 *  - warning when one attempt remains
 *  - error on the final attempt
 *
 * Hidden when no attempt has been made yet.
 */
export function AttemptCounter({ attempts, maxAttempts }: AttemptCounterProps) {
  if (attempts === 0) return null;

  const remaining = maxAttempts !== null ? maxAttempts - attempts : null;
  const isLast = remaining === 0;
  const isLow = remaining !== null && remaining <= 1 && !isLast;
  const state = isLast ? "final" : isLow ? "warning" : "normal";

  const text =
    maxAttempts !== null
      ? isLast
        ? "Final attempt"
        : `${attempts} of ${maxAttempts}`
      : `Attempt ${attempts}`;
  const label = attemptCounterAccessibilityLabel({ attempts, maxAttempts });

  return (
    <span
      className="sc-assessment-attempt-counter"
      data-state={state}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={label}
    >
      {text}
    </span>
  );
}
