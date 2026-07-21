import {
  CaretLeftIcon as CaretLeft,
  CaretRightIcon as CaretRight,
  CheckCircleIcon as CheckCircle,
  HourglassIcon as Hourglass,
  TimerIcon as Timer,
} from "@phosphor-icons/react";

/**
 * Learner-facing runtime surfaces of a quiz attempt. Five small shapes,
 * one file because they all live downstream of the same `runtimeStatus`
 * branching and share visual treatment (primary buttons, ghost nav,
 * mono timer pill).
 *
 *   QuizRuntimeIncomplete      — quiz has no questions at runtime
 *   QuizRuntimeStart           — intro slide before attempt starts
 *   QuizReviewableControls     — after-quiz draft navigation + final submit
 *   QuizLockedControls         — per-question answer submission
 *   QuizReviewPauseControls    — after-each-answer review pause navigation
 *   QuizAnswerReviewContext    — active question context after completion
 *   QuizAnswerReviewControls   — read-only review after completion
 *   QuizTimer                  — mono pill with urgency thresholds
 *   QuizCompletion             — score summary
 */

export function QuizRuntimeIncomplete() {
  return (
    <div
      className="sc-quiz__runtime-incomplete"
      contentEditable={false}
      data-testid="quiz-runtime-incomplete"
    >
      This quiz is incomplete.
    </div>
  );
}

export function QuizRuntimeStart({
  canStart,
  reviewTiming,
  onStart,
}: {
  canStart: boolean;
  reviewTiming: "after_quiz" | "after_each_answer";
  onStart: () => void;
}) {
  const description =
    reviewTiming === "after_each_answer"
      ? "Answers are submitted one question at a time."
      : "Answers are submitted at the end of the quiz.";

  return (
    <div className="sc-quiz__runtime-card" contentEditable={false} data-testid="quiz-runtime-start">
      <h3 className="sc-quiz__runtime-title">Ready to begin?</h3>
      <p className="sc-quiz__runtime-meta">{description}</p>
      <button
        type="button"
        className="sc-quiz__primary-button"
        disabled={!canStart}
        onClick={onStart}
      >
        Start quiz
      </button>
    </div>
  );
}

export function QuizReviewableControls({
  activeIndex,
  canNext,
  canPrevious,
  canSubmitQuiz,
  showPrevious,
  total,
  onNext,
  onPrevious,
  onSubmitQuiz,
}: {
  activeIndex: number;
  canNext: boolean;
  canPrevious: boolean;
  canSubmitQuiz: boolean;
  showPrevious: boolean;
  total: number;
  onNext: () => void;
  onPrevious: () => void;
  onSubmitQuiz: () => void;
}) {
  const isFinalStage = activeIndex >= 0 && activeIndex === total - 1;

  return (
    <div
      className="sc-quiz__runtime-controls"
      contentEditable={false}
      data-testid="quiz-reviewable-controls"
    >
      <div className="sc-quiz__runtime-nav">
        {showPrevious ? (
          <button
            type="button"
            className="sc-quiz__ghost-button"
            aria-label="Previous question"
            disabled={!canPrevious}
            onClick={onPrevious}
          >
            <CaretLeft size={12} weight="bold" aria-hidden />
            Previous
          </button>
        ) : null}
        {!isFinalStage ? (
          <button
            type="button"
            className="sc-quiz__ghost-button"
            aria-label="Next question"
            disabled={!canNext}
            onClick={onNext}
          >
            Next
            <CaretRight size={12} weight="bold" aria-hidden />
          </button>
        ) : null}
      </div>
      {isFinalStage ? (
        <button
          type="button"
          className="sc-quiz__primary-button"
          disabled={!canSubmitQuiz}
          onClick={onSubmitQuiz}
        >
          Submit quiz
        </button>
      ) : null}
    </div>
  );
}

export function QuizLockedControls({
  canSubmit,
  onSubmit,
}: {
  canSubmit: boolean;
  onSubmit: () => void;
}) {
  return (
    <div
      className="sc-quiz__runtime-controls"
      contentEditable={false}
      data-testid="quiz-locked-controls"
    >
      <span className="sc-quiz__runtime-meta">Submit this answer to review it.</span>
      <button
        type="button"
        className="sc-quiz__primary-button"
        disabled={!canSubmit}
        onClick={onSubmit}
      >
        Submit answer
      </button>
    </div>
  );
}

export function QuizRetryControls({
  canRetry,
  onRetry,
}: {
  canRetry: boolean;
  onRetry: () => void;
}) {
  return (
    <div
      className="sc-quiz__runtime-controls"
      contentEditable={false}
      data-testid="quiz-retry-controls"
    >
      <span className="sc-quiz__runtime-meta">Change your answer, then try again.</span>
      <button
        type="button"
        className="sc-quiz__primary-button"
        disabled={!canRetry}
        onClick={onRetry}
      >
        Try again
      </button>
    </div>
  );
}

export function QuizReviewPauseControls({
  canContinue,
  onContinue,
}: {
  canContinue: boolean;
  onContinue: () => void;
}) {
  return (
    <div
      className="sc-quiz__runtime-controls"
      contentEditable={false}
      data-testid="quiz-review-pause-controls"
    >
      <span className="sc-quiz__runtime-meta">Review this answer, then continue.</span>
      <button
        type="button"
        className="sc-quiz__primary-button"
        disabled={!canContinue}
        onClick={onContinue}
      >
        Next question
        <CaretRight size={12} weight="bold" aria-hidden />
      </button>
    </div>
  );
}

export function QuizAnswerReviewContext({
  activeIndex,
  total,
}: {
  activeIndex: number;
  total: number;
}) {
  return (
    <div
      className="sc-quiz__review-context"
      contentEditable={false}
      data-testid="quiz-answer-review-context"
    >
      <span className="sc-quiz__review-context-label">Reviewing answers</span>
      <span className="sc-quiz__review-context-position" aria-live="polite" aria-atomic="true">
        Question {activeIndex + 1} of {total}
      </span>
    </div>
  );
}

export function QuizAnswerReviewControls({
  activeIndex,
  total,
  onNavigate,
}: {
  activeIndex: number;
  total: number;
  onNavigate: (index: number) => void;
}) {
  const canPrev = activeIndex > 0;
  const canNext = activeIndex >= 0 && activeIndex < total - 1;

  return (
    <div
      className="sc-quiz__runtime-controls"
      contentEditable={false}
      data-testid="quiz-answer-review-controls"
    >
      <div className="sc-quiz__runtime-nav">
        <button
          type="button"
          className="sc-quiz__ghost-button"
          aria-label="Previous question"
          disabled={!canPrev}
          onClick={() => onNavigate(activeIndex - 1)}
        >
          <CaretLeft size={12} weight="bold" aria-hidden />
          Previous
        </button>
        <button
          type="button"
          className="sc-quiz__ghost-button"
          aria-label="Next question"
          disabled={!canNext}
          onClick={() => onNavigate(activeIndex + 1)}
        >
          Next
          <CaretRight size={12} weight="bold" aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function QuizTimer({ remainingSeconds }: { remainingSeconds: number }) {
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const display = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  const urgency =
    remainingSeconds <= 10 ? "critical" : remainingSeconds <= 30 ? "warning" : "normal";
  return (
    <span
      className="sc-quiz__timer"
      data-urgency={urgency}
      data-testid="quiz-timer"
      role="timer"
      aria-live={urgency === "critical" ? "assertive" : "polite"}
    >
      <Hourglass size={12} weight="regular" aria-hidden />
      {display}
    </span>
  );
}

export function QuizTimesUpOverlay() {
  return (
    <div
      className="sc-quiz__timesup"
      contentEditable={false}
      data-testid="quiz-times-up"
      role="status"
      aria-live="assertive"
    >
      <span className="sc-quiz__timesup-mark" aria-hidden>
        <Timer size={20} weight="regular" />
      </span>
      <span className="sc-quiz__timesup-label">Time's up</span>
    </div>
  );
}

export function QuizExpired({
  score,
  maxScore,
  resultsVisible,
}: {
  score: number | null;
  maxScore: number | null;
  resultsVisible: boolean;
}) {
  return (
    <div className="sc-quiz__expired" contentEditable={false} data-testid="quiz-expired-summary">
      <span className="sc-quiz__expired-mark" aria-hidden>
        <Timer size={20} weight="regular" />
      </span>
      <h3 className="sc-quiz__expired-title">Time's up</h3>
      <p className="sc-quiz__expired-meta">Your attempt ended when the timer ran out.</p>
      {resultsVisible && score !== null && maxScore !== null ? (
        <>
          <span className="sc-quiz__expired-score">
            {score} / {maxScore}
          </span>
          <span className="sc-quiz__expired-percent">
            {Math.round((score / Math.max(maxScore, 1)) * 100)}%
          </span>
        </>
      ) : null}
    </div>
  );
}

export function QuizCompletion({
  score,
  maxScore,
  resultsVisible,
}: {
  score: number | null;
  maxScore: number | null;
  resultsVisible: boolean;
}) {
  return (
    <div
      className="sc-quiz__completion"
      contentEditable={false}
      data-testid="quiz-completion-summary"
    >
      <span className="sc-quiz__completion-mark" aria-hidden>
        <CheckCircle size={20} weight="regular" />
      </span>
      <h3 className="sc-quiz__completion-title">Quiz complete</h3>
      {resultsVisible && score !== null && maxScore !== null ? (
        <>
          <span className="sc-quiz__completion-score">
            {score} / {maxScore}
          </span>
          <span className="sc-quiz__completion-meta">
            {Math.round((score / Math.max(maxScore, 1)) * 100)}%
          </span>
        </>
      ) : null}
    </div>
  );
}

/**
 * Inline `<style>` tag injected into the quiz block to hide all
 * non-active question stages. Using `nth-child` + the unique
 * `data-quiz-view-id` keeps each quiz isolated (multiple quizzes on
 * the same page each get their own scoped rule). This is the one
 * place we accept inline CSS-via-React: the active index is dynamic
 * and there's no static class we could toggle on each child node.
 */
export function QuizActiveStageStyle({
  activeChildIndex,
  quizViewId,
}: {
  activeChildIndex: number;
  quizViewId: string;
}) {
  if (activeChildIndex < 0) return null;
  const activeNthChild = activeChildIndex + 1;
  return (
    <style contentEditable={false}>
      {`
        [data-quiz-view-id="${cssString(quizViewId)}"] [data-slot="quiz-content"] > [data-node-view-content-react] > * {
          display: none !important;
        }
        [data-quiz-view-id="${cssString(quizViewId)}"] [data-slot="quiz-content"] > [data-node-view-content-react] > :nth-child(${activeNthChild}) {
          display: grid !important;
          grid-template-rows: minmax(0, 1fr);
          min-height: 0;
        }
      `}
    </style>
  );
}

function cssString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
