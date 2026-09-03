import {
  CaretLeftIcon as CaretLeft,
  CaretRightIcon as CaretRight,
  CheckCircleIcon as CheckCircle,
  HourglassIcon as Hourglass,
  TimerIcon as Timer,
} from "@phosphor-icons/react";
import type { Score } from "@scaffold/contracts";
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { AssessmentRequestState } from "@/runtime/assessment/types";
import { CourseButton } from "@/ui/components/course/CourseActions/CourseActions";
import type { QuizStartSummary } from "./quiz-shared";

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
      className="sc-course-quiz__runtime-incomplete"
      contentEditable={false}
      data-testid="quiz-runtime-incomplete"
    >
      This quiz is incomplete.
    </div>
  );
}

export function QuizRuntimeStart({
  canStart,
  summary,
  onStart,
}: {
  canStart: boolean;
  summary: QuizStartSummary;
  onStart: () => void;
}) {
  const commitmentFacts = [summary.timeLimit, summary.passingRequirement].filter(Boolean);

  return (
    <div
      className="sc-course-quiz__runtime-card"
      contentEditable={false}
      data-testid="quiz-runtime-start"
    >
      <div className="sc-course-quiz__runtime-start-copy">
        <h3 className="sc-course-quiz__runtime-title">Ready to begin?</h3>
        {commitmentFacts.length > 0 ? (
          <p className="sc-course-quiz__runtime-meta">{commitmentFacts.join(" · ")}</p>
        ) : null}
        <p className="sc-course-quiz__runtime-meta">{summary.submissionCadence}</p>
      </div>
      <div className="sc-course-quiz__runtime-start-actions">
        <CourseButton
          type="button"
          size="large"
          emphasis="strong"
          className="sc-course-quiz__primary-action"
          disabled={!canStart}
          onClick={onStart}
        >
          Start quiz
        </CourseButton>
      </div>
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
      className="sc-course-quiz__runtime-controls"
      contentEditable={false}
      data-testid="quiz-reviewable-controls"
    >
      <div className="sc-course-quiz__runtime-nav">
        {showPrevious ? (
          <CourseButton
            type="button"
            size="large"
            emphasis="outlined"
            className="sc-course-quiz__secondary-action"
            aria-label="Previous question"
            disabled={!canPrevious}
            onClick={onPrevious}
          >
            <CaretLeft size={12} weight="bold" aria-hidden />
            Previous
          </CourseButton>
        ) : null}
        {!isFinalStage ? (
          <CourseButton
            type="button"
            size="large"
            emphasis="outlined"
            className="sc-course-quiz__secondary-action"
            aria-label="Next question"
            disabled={!canNext}
            onClick={onNext}
          >
            Next
            <CaretRight size={12} weight="bold" aria-hidden />
          </CourseButton>
        ) : null}
      </div>
      {isFinalStage ? (
        <CourseButton
          type="button"
          size="large"
          emphasis="strong"
          className="sc-course-quiz__primary-action"
          disabled={!canSubmitQuiz}
          onClick={onSubmitQuiz}
        >
          Submit quiz
        </CourseButton>
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
      className="sc-course-quiz__runtime-controls"
      contentEditable={false}
      data-testid="quiz-locked-controls"
    >
      <span className="sc-course-quiz__runtime-meta">Submit this answer to review it.</span>
      <CourseButton
        type="button"
        size="large"
        emphasis="strong"
        className="sc-course-quiz__primary-action"
        disabled={!canSubmit}
        onClick={onSubmit}
      >
        Submit answer
      </CourseButton>
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
      className="sc-course-quiz__runtime-controls"
      contentEditable={false}
      data-testid="quiz-retry-controls"
    >
      <span className="sc-course-quiz__runtime-meta">Change your answer, then try again.</span>
      <CourseButton
        type="button"
        size="large"
        emphasis="strong"
        className="sc-course-quiz__primary-action"
        disabled={!canRetry}
        onClick={onRetry}
      >
        Try again
      </CourseButton>
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
      className="sc-course-quiz__runtime-controls"
      contentEditable={false}
      data-testid="quiz-review-pause-controls"
    >
      <span className="sc-course-quiz__runtime-meta">Review this answer, then continue.</span>
      <CourseButton
        type="button"
        size="large"
        emphasis="strong"
        className="sc-course-quiz__primary-action"
        disabled={!canContinue}
        onClick={onContinue}
      >
        Next question
        <CaretRight size={12} weight="bold" aria-hidden />
      </CourseButton>
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
      className="sc-course-quiz__review-context"
      contentEditable={false}
      data-testid="quiz-answer-review-context"
    >
      <span className="sc-course-quiz__review-context-label">Reviewing answers</span>
      <span
        className="sc-course-quiz__review-context-position"
        aria-live="polite"
        aria-atomic="true"
      >
        Question {activeIndex + 1} of {total}
      </span>
    </div>
  );
}

export function QuizAnswerReviewControls({
  activeIndex,
  support,
  total,
  onNavigate,
}: {
  activeIndex: number;
  support?: ReactNode;
  total: number;
  onNavigate: (index: number) => void;
}) {
  const canPrev = activeIndex > 0;
  const canNext = activeIndex >= 0 && activeIndex < total - 1;

  return (
    <div
      className="sc-course-quiz__runtime-controls"
      contentEditable={false}
      data-testid="quiz-answer-review-controls"
    >
      {support}
      <div className="sc-course-quiz__runtime-nav">
        <CourseButton
          type="button"
          size="large"
          emphasis="outlined"
          className="sc-course-quiz__secondary-action"
          aria-label="Previous question"
          disabled={!canPrev}
          onClick={() => onNavigate(activeIndex - 1)}
        >
          <CaretLeft size={12} weight="bold" aria-hidden />
          Previous
        </CourseButton>
        <CourseButton
          type="button"
          size="large"
          emphasis="outlined"
          className="sc-course-quiz__secondary-action"
          aria-label="Next question"
          disabled={!canNext}
          onClick={() => onNavigate(activeIndex + 1)}
        >
          Next
          <CaretRight size={12} weight="bold" aria-hidden />
        </CourseButton>
      </div>
    </div>
  );
}

export function QuizTimer({ remainingSeconds }: { remainingSeconds: number }) {
  const [announcement, setAnnouncement] = useState("");
  const lastAnnouncedThreshold = useRef<number | null>(null);
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const display = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  const courseState = remainingSeconds <= 10 ? "error" : remainingSeconds <= 30 ? "warning" : null;

  useEffect(() => {
    if (remainingSeconds !== 30 && remainingSeconds !== 10) return;
    if (lastAnnouncedThreshold.current === remainingSeconds) return;
    lastAnnouncedThreshold.current = remainingSeconds;
    setAnnouncement(`${remainingSeconds} seconds remaining.`);
  }, [remainingSeconds]);

  return (
    <>
      <span
        className="sc-course-quiz__timer"
        data-course-state={courseState ?? undefined}
        data-testid="quiz-timer"
        role="timer"
        aria-label={`Time remaining ${display}`}
      >
        <Hourglass size={12} weight="regular" aria-hidden />
        {display}
      </span>
      <span
        className="sc-course-quiz__timer-announcement sc-sr-only"
        data-testid="quiz-timer-announcement"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </span>
    </>
  );
}

export function QuizRequestFeedback({ request }: { request: AssessmentRequestState | null }) {
  if (!request) return null;
  const feedback = quizRequestFeedback(request);
  return (
    <div
      className="sc-course-quiz__request-feedback"
      data-course-state={request.status === "error" ? "error" : "info"}
      data-quiz-request-operation={request.operation}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      contentEditable={false}
    >
      {feedback}
    </div>
  );
}

export function QuizTimesUpOverlay() {
  return (
    <div
      className="sc-course-quiz__timesup"
      contentEditable={false}
      data-testid="quiz-times-up"
      data-course-state="warning"
      role="status"
      aria-live="assertive"
    >
      <span className="sc-course-quiz__timesup-mark" aria-hidden>
        <Timer size={20} weight="regular" />
      </span>
      <span className="sc-course-quiz__timesup-label">Time's up</span>
    </div>
  );
}

export function QuizExpired({
  score,
  resultsVisible,
}: {
  score: Score | null;
  resultsVisible: boolean;
}) {
  return (
    <div
      className="sc-course-quiz__expired"
      contentEditable={false}
      data-testid="quiz-expired-summary"
      data-course-state="warning"
    >
      <span className="sc-course-quiz__expired-mark" aria-hidden>
        <Timer size={20} weight="regular" />
      </span>
      <h3 className="sc-course-quiz__expired-title">Time's up</h3>
      <p className="sc-course-quiz__expired-meta">Your attempt ended when the timer ran out.</p>
      {resultsVisible && score !== null ? (
        <>
          {"raw" in score ? (
            <span className="sc-course-quiz__expired-score">
              {score.raw} / {score.max}
            </span>
          ) : null}
          <span className="sc-course-quiz__expired-percent">{Math.round(score.scaled * 100)}%</span>
        </>
      ) : null}
    </div>
  );
}

export function QuizCompletion({
  score,
  resultsVisible,
}: {
  score: Score | null;
  resultsVisible: boolean;
}) {
  return (
    <div
      className="sc-course-quiz__completion"
      contentEditable={false}
      data-testid="quiz-completion-summary"
      data-course-state="completed"
    >
      <span className="sc-course-quiz__completion-mark" aria-hidden>
        <CheckCircle size={20} weight="regular" />
      </span>
      <h3 className="sc-course-quiz__completion-title">Quiz complete</h3>
      {resultsVisible && score !== null ? (
        <>
          {"raw" in score ? (
            <span className="sc-course-quiz__completion-score">
              {score.raw} / {score.max}
            </span>
          ) : null}
          <span className="sc-course-quiz__completion-meta">{Math.round(score.scaled * 100)}%</span>
        </>
      ) : null}
    </div>
  );
}

function quizRequestFeedback(request: AssessmentRequestState): string {
  const copy = {
    "quiz-start": {
      pending: "Starting quiz…",
      error: "Couldn’t start the quiz. Try again.",
    },
    "quiz-submit-question": {
      pending: "Submitting answer…",
      error: "Couldn’t submit this answer. Try again.",
    },
    "quiz-finish": {
      pending: "Submitting quiz…",
      error: "Couldn’t submit the quiz. Try again.",
    },
    "quiz-expire": {
      pending: "Ending timed attempt…",
      error: "Couldn’t finish the timed attempt.",
    },
    "quiz-reveal-answers": {
      pending: "Loading answer review…",
      error: "Couldn’t load answer review.",
    },
  } as const;

  if (!(request.operation in copy)) return request.status === "pending" ? "Working…" : "Try again.";
  return copy[request.operation as keyof typeof copy][request.status];
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
