import { NodeViewContent, type NodeViewProps } from "@tiptap/react";

import { cn } from "@/lib/cn";

import { QuizHeader } from "./QuizHeader";
import {
  QuizActiveStageStyle,
  QuizAnswerReviewContext,
  QuizAnswerReviewControls,
  QuizCompletion,
  QuizExpired,
  QuizLockedControls,
  QuizRetryControls,
  QuizReviewPauseControls,
  QuizReviewableControls,
  QuizRuntimeIncomplete,
  QuizRuntimeStart,
  QuizTimer,
  QuizTimesUpOverlay,
} from "./QuizRuntime";
import { useActiveQuestionScrollReset } from "./use-active-question-scroll-reset";
import { useQuizRuntimeController } from "./use-quiz-runtime-controller";

import "./Quiz.css";

export function QuizRuntimeView(props: NodeViewProps) {
  const quiz = useQuizRuntimeController({
    node: props.node,
  });

  const effectiveRuntimeStatus = quiz.runtimeStatus ?? "not_started";
  const showRuntimeIncomplete = quiz.isEmpty;
  const showRuntimeStart = !quiz.isEmpty && effectiveRuntimeStatus === "not_started";
  const showTimesUp = !quiz.isEmpty && quiz.timesUp;
  const showExpired = !quiz.isEmpty && !showTimesUp && effectiveRuntimeStatus === "expired";
  const showCompletion = !quiz.isEmpty && !showTimesUp && effectiveRuntimeStatus === "completed";
  const showReviewableControls =
    !quiz.isEmpty &&
    !showTimesUp &&
    effectiveRuntimeStatus === "in_progress" &&
    quiz.settings.reviewTiming === "after_quiz";
  const showLockedControls =
    !quiz.isEmpty &&
    !showTimesUp &&
    effectiveRuntimeStatus === "in_progress" &&
    quiz.settings.reviewTiming === "after_each_answer" &&
    !quiz.learnerControls.isReviewPause;
  const showReviewPauseControls =
    !quiz.isEmpty &&
    !showTimesUp &&
    effectiveRuntimeStatus === "in_progress" &&
    quiz.learnerControls.isReviewPause;
  const showAnswerReview =
    !quiz.isEmpty &&
    quiz.canReviewAnswers &&
    !showTimesUp &&
    effectiveRuntimeStatus === "completed";

  const hideStage =
    quiz.isEmpty ||
    showTimesUp ||
    effectiveRuntimeStatus === "not_started" ||
    effectiveRuntimeStatus === "expired" ||
    (effectiveRuntimeStatus === "completed" && !quiz.canReviewAnswers);
  const quizRootRef = useActiveQuestionScrollReset(quiz.activeChildKey);

  return (
    <section
      ref={quizRootRef}
      data-quiz-view-id={quiz.quizViewId}
      data-quiz-review-timing={quiz.settings.reviewTiming}
      data-quiz-status={quiz.runtimeStatus ?? undefined}
      data-active-question-id={quiz.activeChildKey ?? undefined}
      data-active-question-index={quiz.activeChildIndex >= 0 ? quiz.activeChildIndex : undefined}
      className="sc-quiz"
    >
      <section className="sc-quiz__container">
        <QuizHeader
          count={quiz.childCount}
          points={quiz.totalPoints}
          timer={
            quiz.timerActive && quiz.timerRemainingSeconds !== null ? (
              <QuizTimer remainingSeconds={quiz.timerRemainingSeconds} />
            ) : null
          }
        />

        {showRuntimeIncomplete ? <QuizRuntimeIncomplete /> : null}

        {showRuntimeStart ? (
          <QuizRuntimeStart
            canStart={quiz.canStart}
            reviewTiming={quiz.settings.reviewTiming}
            onStart={quiz.actions.start}
          />
        ) : null}

        {showTimesUp ? <QuizTimesUpOverlay /> : null}

        {showExpired ? (
          <QuizExpired
            score={quiz.quiz?.score ?? null}
            maxScore={quiz.quiz?.maxScore ?? null}
            resultsVisible={quiz.settings.reviewDetail !== "none"}
          />
        ) : null}

        {showCompletion ? (
          <QuizCompletion
            score={quiz.quiz?.score ?? null}
            maxScore={quiz.quiz?.maxScore ?? null}
            resultsVisible={quiz.settings.reviewDetail !== "none"}
          />
        ) : null}

        {!quiz.isEmpty ? (
          <QuizActiveStageStyle
            activeChildIndex={quiz.activeChildIndex}
            quizViewId={quiz.quizViewId}
          />
        ) : null}

        {showAnswerReview ? (
          <QuizAnswerReviewContext
            activeIndex={quiz.activeChildIndex}
            total={quiz.childKeys.length}
          />
        ) : null}

        <NodeViewContent
          className={cn("sc-quiz__stage", hideStage && "sc-quiz__stage--hidden")}
          data-slot="quiz-content"
          data-testid="quiz-stage-viewport"
        />

        {showReviewableControls ? (
          <QuizReviewableControls
            activeIndex={quiz.activeChildIndex}
            canNext={quiz.learnerControls.canGoNext}
            canPrevious={quiz.learnerControls.canGoPrevious}
            canSubmitQuiz={quiz.learnerControls.canSubmitQuiz}
            showPrevious={quiz.settings.allowBacktracking}
            total={quiz.childKeys.length}
            onNext={() => quiz.actions.navigateRuntime(quiz.activeChildIndex + 1)}
            onPrevious={() => quiz.actions.navigateRuntime(quiz.activeChildIndex - 1)}
            onSubmitQuiz={quiz.actions.finish}
          />
        ) : null}

        {showLockedControls ? (
          quiz.learnerControls.canRetryAnswer ? (
            <QuizRetryControls
              canRetry={quiz.canSubmitLocked}
              onRetry={quiz.actions.submitCurrent}
            />
          ) : (
            <QuizLockedControls
              canSubmit={quiz.canSubmitLocked}
              onSubmit={quiz.actions.submitCurrent}
            />
          )
        ) : null}

        {showReviewPauseControls ? (
          <QuizReviewPauseControls
            canContinue={quiz.learnerControls.canContinueReview}
            onContinue={quiz.actions.continueReview}
          />
        ) : null}

        {showAnswerReview ? (
          <QuizAnswerReviewControls
            activeIndex={quiz.activeChildIndex}
            total={quiz.childKeys.length}
            onNavigate={quiz.actions.navigateRuntime}
          />
        ) : null}
      </section>
    </section>
  );
}
