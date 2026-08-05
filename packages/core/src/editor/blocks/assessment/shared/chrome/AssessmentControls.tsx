import { AttemptCounter } from "./AttemptCounter";
import { AssessmentSubmissionControl } from "@/ui/components/course/AssessmentSubmissionControl/AssessmentSubmissionControl";
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
 * Submission-zone adapter for standalone assessment blocks. Renders
 * the Course submission control in the right state plus its adjacent AttemptCounter.
 *
 * Author: a disabled "Submit" so the layout matches what students see.
 * Runtime:
 *   - pre-submit -> Submit (enabled iff the block has a response, exhausted
 *     variant if max attempts hit)
 *   - submitted + can retry -> Try Again
 *   - submitted + correct -> noninteractive Correct status
 *   - submitted + exhausted -> noninteractive Submitted status
 * Returns `null` when the parent's feedbackMode is immediate (no
 * commit step in that mode).
 */
export function AssessmentControls({ isEditable, problem, maxAttempts }: AssessmentControlsProps) {
  if (isEditable) {
    return (
      <AuthoringAssessmentControls
        feedbackMode={problem?.state.feedbackMode ?? "on_submit"}
      />
    );
  }

  return <RuntimeAssessmentControls problem={problem} maxAttempts={maxAttempts} />;
}

interface AuthoringAssessmentControlsProps {
  /** Mirrors runtime's immediate-feedback visibility without exposing response state. */
  feedbackMode: "immediate" | "on_submit";
}

export function AuthoringAssessmentControls({ feedbackMode }: AuthoringAssessmentControlsProps) {
  if (feedbackMode === "immediate") return null;

  return (
    <AssessmentSubmissionControl
      state="submit"
      disabled
      onAction={() => {}}
    />
  );
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
  const status = resultStatus && canRetry ? (
    <span role="status" aria-live="polite" aria-atomic="true" className="sc-sr-only">
      {resultStatus}
    </span>
  ) : null;

  if (!submitted) {
    return (
      <>
        {exhausted ? (
          <AssessmentSubmissionControl state="submitted" />
        ) : (
          <AssessmentSubmissionControl
            state="submit"
            disabled={!hasResponse}
            disabledReason={
              !hasResponse
                ? missingResponseDescriptionForInteraction(problem?.state.interactionKind)
                : undefined
            }
            onAction={() => void problem?.submit()}
          />
        )}
        {counter}
        {status}
      </>
    );
  }

  if (canRetry) {
    return (
      <>
        <AssessmentSubmissionControl state="retry" onAction={() => problem?.reset()} />
        {counter}
        {status}
      </>
    );
  }

  return (
    <>
      <AssessmentSubmissionControl state={isCorrect ? "correct" : "submitted"} />
      {counter}
      {status}
    </>
  );
}
