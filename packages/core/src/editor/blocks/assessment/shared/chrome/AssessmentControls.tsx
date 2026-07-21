import { AttemptCounter } from "./AttemptCounter";
import { SubmitButton } from "./SubmitButton";
import {
  assessmentResultStatusText,
  missingResponseDescriptionForInteraction,
} from "./action-accessibility";
import type { ProblemScope } from "../runtime/use-assessment-runtime";

interface AssessmentControlsProps {
  /** Author mode (true) or runtime (false). */
  isEditable: boolean;
  /** Live scope. null in author or before registration. */
  problem: ProblemScope | null;
  /** Settings.maxAttempts — passed for the counter. null = unlimited. */
  maxAttempts: number | null;
}

/**
 * Standard controls row for choice-family assessment blocks. Renders
 * the SubmitButton in the right mode + the AttemptCounter beside it.
 *
 * Author: a disabled "Submit" so the layout matches what students see.
 * Runtime:
 *   - pre-submit -> Submit (enabled iff the block has a response, exhausted
 *     variant if max attempts hit)
 *   - submitted + can retry -> Try Again
 *   - submitted + correct -> disabled green Submit
 *   - submitted + exhausted -> disabled gray Submit
 * Returns `null` when the parent's feedbackMode is immediate (no
 * commit step in that mode).
 */
export function AssessmentControls({ isEditable, problem, maxAttempts }: AssessmentControlsProps) {
  if (isEditable) {
    return <AuthoringAssessmentControls problem={problem} />;
  }

  return <RuntimeAssessmentControls problem={problem} maxAttempts={maxAttempts} />;
}

interface AuthoringAssessmentControlsProps {
  /** Passed only to mirror runtime's immediate-feedback visibility. */
  problem: ProblemScope | null;
}

export function AuthoringAssessmentControls({ problem }: AuthoringAssessmentControlsProps) {
  const feedbackMode = problem?.state.feedbackMode ?? "on_submit";
  if (feedbackMode === "immediate") return null;

  return <SubmitButton mode="submit" disabled />;
}

interface RuntimeAssessmentControlsProps {
  /** Live scope. null before registration. */
  problem: ProblemScope | null;
  /** Settings.maxAttempts — passed for the counter. null = unlimited. */
  maxAttempts: number | null;
}

export function RuntimeAssessmentControls({
  problem,
  maxAttempts,
}: RuntimeAssessmentControlsProps) {
  const feedbackMode = problem?.state.feedbackMode ?? "on_submit";
  if (feedbackMode === "immediate") return null;

  const submitted = problem?.state.submitted ?? false;
  const exhausted = problem?.exhausted ?? false;
  const canRetry = problem?.canRetry ?? false;
  const attempts = problem?.state.attemptNumber ?? 0;
  const hasResponse = problem?.hasResponse ?? false;
  const isCorrect =
    problem?.officialResult?.isCorrect ?? problem?.feedbackResult?.isCorrect ?? false;
  const resultStatus = assessmentResultStatusText(
    problem?.officialResult?.isCorrect ?? problem?.feedbackResult?.isCorrect,
  );

  const counter = <AttemptCounter attempts={attempts} maxAttempts={maxAttempts} />;
  const status = resultStatus ? (
    <span role="status" aria-live="polite" aria-atomic="true" className="sc-sr-only">
      {resultStatus}
    </span>
  ) : null;

  if (!submitted) {
    return (
      <>
        <SubmitButton
          mode={exhausted ? "exhausted" : "submit"}
          disabled={!hasResponse}
          description={
            !hasResponse && !exhausted
              ? missingResponseDescriptionForInteraction(problem?.state.interactionKind)
              : null
          }
          onClick={() => problem?.submit()}
        />
        {counter}
        {status}
      </>
    );
  }

  if (canRetry) {
    return (
      <>
        <SubmitButton mode="retry" onClick={() => problem?.reset()} />
        {counter}
        {status}
      </>
    );
  }

  return (
    <>
      <SubmitButton mode={isCorrect ? "correct" : "exhausted"} disabled />
      {counter}
      {status}
    </>
  );
}
