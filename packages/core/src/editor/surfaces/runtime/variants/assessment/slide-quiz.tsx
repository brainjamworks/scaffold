import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { useCallback, useState } from "react";

import {
  QuizAnswerReviewContext,
  QuizAnswerReviewControls,
  QuizCompletion,
  QuizExpired,
  QuizLockedControls,
  QuizRequestFeedback,
  QuizRetryControls,
  QuizReviewPauseControls,
  QuizReviewableControls,
  QuizRuntimeIncomplete,
  QuizTimer,
  QuizTimesUpOverlay,
} from "@/editor/blocks/assessment/quiz/QuizRuntime";
import { getQuizStartSummary } from "@/editor/blocks/assessment/quiz/quiz-shared";
import { useActiveQuestionScrollReset } from "@/editor/blocks/assessment/quiz/use-active-question-scroll-reset";
import { useQuizRuntimeStateController } from "@/editor/blocks/assessment/quiz/use-quiz-runtime-controller";
import { useKnownQuizSurfaceExitGuard } from "@/editor/blocks/assessment/quiz/use-quiz-surface-exit-guard";
import {
  requireSurfaceQuizChild,
  surfaceQuizQuestionKeysNeedingSetup,
} from "@/editor/surfaces/model/assessment/surface-quiz-node";
import { useAssessmentStoreApi } from "@/runtime/assessment/AssessmentRuntimeProvider";
import { CourseButton } from "@/ui/components/course/CourseActions/CourseActions";

import type { SurfaceRuntimeViewProps } from "../../surface-runtime-view-registry";
import { AssessmentSlideSurfaceRuntimeFrame } from "../../views/AssessmentSlideSurfaceRuntimeFrame";
import { SlideQuizActiveQuestionStyle } from "../../../view/variants/assessment/SlideQuizActiveQuestionStyle";
import { FullSlideQuestionPresenter } from "./full-slide-question-presenter";
import { useQuizSurfaceControlBinding } from "./quiz-surface-control-binding";

import "../../../view/variants/assessment/slide-quiz.css";

export function SlideQuizSurfaceRuntimeView(props: SurfaceRuntimeViewProps) {
  const quizNode = requireSurfaceQuizChild(props.node);
  const questionKeysNeedingSetup = surfaceQuizQuestionKeysNeedingSetup(quizNode);
  const questionsNeedingSetup = questionKeysNeedingSetup.length;
  const quiz = useQuizRuntimeStateController({ node: quizNode });
  const store = useAssessmentStoreApi();
  const surfaceId = EmbeddedNodeIdSchema.parse(props.node.attrs["id"]);
  const quizId = requireStableId(quizNode, "Quiz group");
  const editor = props.editor;
  const getPos = props.getPos;
  const requireMounted = useCallback(() => {
    if (typeof getPos !== "function") {
      throw new Error(`Quiz Surface "${surfaceId}" is no longer mounted.`);
    }
    let position: number | undefined;
    try {
      position = getPos();
    } catch {
      throw new Error(`Quiz Surface "${surfaceId}" is no longer mounted.`);
    }
    const current = typeof position === "number" ? editor.state.doc.nodeAt(position) : null;
    const currentQuiz = current?.type.name === "surface" ? requireSurfaceQuizChild(current) : null;
    if (
      current?.type.name !== "surface" ||
      current.attrs["id"] !== surfaceId ||
      current.attrs["variant"] !== "slide-quiz" ||
      currentQuiz?.attrs["id"] !== quizId
    ) {
      throw new Error(`Quiz Surface "${surfaceId}" is no longer mounted.`);
    }
  }, [editor, getPos, quizId, surfaceId]);

  useKnownQuizSurfaceExitGuard({
    enabled: !quiz.isEmpty && questionsNeedingSetup === 0 && quiz.groupId !== null,
    groupId: quiz.groupId,
    requireMounted,
    store,
    surfaceId,
  });
  useQuizSurfaceControlBinding({
    editor: props.editor,
    getPos: props.getPos,
    groupId: quiz.groupId,
    node: props.node,
    quizId,
  });

  const status = quiz.runtimeStatus;
  const [reviewingAttemptId, setReviewingAttemptId] = useState<string | null>(null);
  const isReviewingAnswers =
    status === "completed" && quiz.canReviewAnswers && quiz.quiz?.attemptId === reviewingAttemptId;
  const showQuestion =
    !quiz.isEmpty && !quiz.timesUp && (status === "in_progress" || isReviewingAnswers);
  const quizRootRef = useActiveQuestionScrollReset<HTMLDivElement>(quiz.activeChildKey, status);
  const startSummary = getQuizStartSummary({
    childCount: quiz.childCount,
    settings: quiz.settings,
    totalPoints: quiz.totalPoints,
  });
  return (
    <AssessmentSlideSurfaceRuntimeFrame
      {...props}
      attributes={{
        "data-quiz-view-id": quiz.quizViewId,
        "data-quiz-status": status,
        "data-active-question-id": quiz.activeChildKey ?? undefined,
        "data-active-question-index":
          quiz.activeChildIndex >= 0 ? String(quiz.activeChildIndex) : undefined,
        "data-quiz-stage-visible": showQuestion ? "true" : "false",
        "data-quiz-reviewing-answers": isReviewingAnswers ? "true" : undefined,
        "data-testid": "quiz-stage-viewport",
      }}
      surfaceRef={quizRootRef}
      variantClassName="sc-slide-quiz-surface-view sc-slide-quiz-surface-runtime-view"
    >
      <QuizRequestFeedback request={quiz.request} />
      {status === "in_progress" && quiz.activeChildIndex >= 0 ? (
        <span
          className="sc-sr-only"
          data-testid="quiz-question-announcement"
          aria-live="polite"
          aria-atomic="true"
        >
          Question {quiz.activeChildIndex + 1} of {quiz.childCount}
        </span>
      ) : null}

      {Array.from({ length: quizNode.childCount }, (_, index) => {
        const question = quizNode.child(index);
        return (
          <FullSlideQuestionPresenter
            key={requireStableId(question, "Quiz question")}
            editor={props.editor}
            question={question}
            visible={showQuestion && question.attrs["id"] === quiz.activeChildKey}
          />
        );
      })}

      <SlideQuizActiveQuestionStyle
        activeQuestionId={showQuestion ? quiz.activeChildKey : null}
        quizId={quizId}
      />

      {quiz.isEmpty ? <QuizRuntimeIncomplete /> : null}
      {!quiz.isEmpty && status === "not_started" ? (
        <section className="sc-course-slide-quiz__state" contentEditable={false}>
          <h2 className="sc-course-slide-quiz__state-title">Ready to begin?</h2>
          <p className="sc-course-slide-quiz__state-copy">
            {questionsNeedingSetup > 0
              ? `${questionsNeedingSetup} ${questionsNeedingSetup === 1 ? "question needs" : "questions need"} an image before this quiz can begin.`
              : [
                  startSummary.questionCount,
                  startSummary.totalPoints,
                  startSummary.timeLimit,
                  startSummary.passingRequirement,
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </p>
          {questionsNeedingSetup === 0 ? (
            <p className="sc-course-slide-quiz__state-copy">{startSummary.submissionCadence}</p>
          ) : null}
        </section>
      ) : null}
      {!quiz.isEmpty && quiz.timesUp ? <QuizTimesUpOverlay /> : null}
      {!quiz.isEmpty && !quiz.timesUp && status === "expired" ? (
        <QuizExpired
          score={quiz.quiz?.score ?? null}
          resultsVisible={quiz.settings.reviewDetail !== "none"}
        />
      ) : null}
      {!quiz.isEmpty && !quiz.timesUp && status === "completed" && !isReviewingAnswers ? (
        <QuizCompletion
          score={quiz.quiz?.score ?? null}
          resultsVisible={quiz.settings.reviewDetail !== "none"}
        />
      ) : null}
      {isReviewingAnswers ? (
        <QuizAnswerReviewContext activeIndex={quiz.activeChildIndex} total={quiz.childCount} />
      ) : null}

      {!quiz.isEmpty ? (
        <SlideQuizActionDock
          isReviewingAnswers={isReviewingAnswers}
          quiz={quiz}
          questionsNeedingSetup={questionsNeedingSetup}
          showQuestion={showQuestion}
          onReviewAnswers={() => {
            if (!quiz.quiz?.attemptId) return;
            quiz.actions.navigateRuntime(0);
            setReviewingAttemptId(quiz.quiz.attemptId);
          }}
          onShowSummary={() => setReviewingAttemptId(null)}
        />
      ) : null}
    </AssessmentSlideSurfaceRuntimeFrame>
  );
}

function SlideQuizActionDock({
  isReviewingAnswers,
  quiz,
  questionsNeedingSetup,
  showQuestion,
  onReviewAnswers,
  onShowSummary,
}: {
  isReviewingAnswers: boolean;
  quiz: ReturnType<typeof useQuizRuntimeStateController>;
  questionsNeedingSetup: number;
  showQuestion: boolean;
  onReviewAnswers: () => void;
  onShowSummary: () => void;
}) {
  const status = quiz.runtimeStatus;
  const showReviewable =
    showQuestion && status === "in_progress" && quiz.settings.reviewTiming === "after_quiz";
  const showLocked =
    showQuestion &&
    status === "in_progress" &&
    quiz.settings.reviewTiming === "after_each_answer" &&
    !quiz.learnerControls.isReviewPause;
  const showReviewPause =
    showQuestion && status === "in_progress" && quiz.learnerControls.isReviewPause;
  const showAnswerReview = isReviewingAnswers;
  const showReviewSummary = status === "completed" && quiz.canReviewAnswers && !showAnswerReview;

  return (
    <div className="sc-course-slide-quiz__action-dock" contentEditable={false}>
      {status !== "not_started" && !showAnswerReview ? (
        <div className="sc-course-slide-quiz__progress">
          <span className="sc-course-slide-quiz__progress-label">Quiz</span>
          {showQuestion ? (
            <span className="sc-course-slide-quiz__progress-position">
              {quiz.activeChildIndex + 1} / {quiz.childCount}
            </span>
          ) : (
            <span className="sc-course-slide-quiz__progress-position">
              {quiz.childCount} {quiz.childCount === 1 ? "question" : "questions"}
            </span>
          )}
          {quiz.timerActive && quiz.timerRemainingSeconds !== null ? (
            <QuizTimer remainingSeconds={quiz.timerRemainingSeconds} />
          ) : null}
        </div>
      ) : null}

      <div className="sc-course-slide-quiz__actions">
        {status === "not_started" ? (
          <CourseButton
            type="button"
            size="large"
            emphasis="strong"
            className="sc-course-quiz__primary-action"
            disabled={!quiz.canStart || questionsNeedingSetup > 0}
            onClick={quiz.actions.start}
          >
            Start quiz
          </CourseButton>
        ) : null}
        {showReviewSummary ? (
          <CourseButton
            type="button"
            size="large"
            emphasis="strong"
            className="sc-course-quiz__primary-action"
            aria-label="Review answers"
            onClick={onReviewAnswers}
          >
            Review answers
          </CourseButton>
        ) : null}
        {showReviewable ? (
          <QuizReviewableControls
            activeIndex={quiz.activeChildIndex}
            canNext={quiz.learnerControls.canGoNext}
            canPrevious={quiz.learnerControls.canGoPrevious}
            canSubmitQuiz={
              quiz.learnerControls.canSubmitQuiz && quiz.pendingOperation !== "quiz-finish"
            }
            showPrevious={quiz.settings.allowBacktracking}
            total={quiz.childCount}
            onNext={() => quiz.actions.navigateRuntime(quiz.activeChildIndex + 1)}
            onPrevious={() => quiz.actions.navigateRuntime(quiz.activeChildIndex - 1)}
            onSubmitQuiz={quiz.actions.finish}
          />
        ) : null}
        {showLocked ? (
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
        {showReviewPause ? (
          <QuizReviewPauseControls
            canContinue={quiz.learnerControls.canContinueReview}
            onContinue={quiz.actions.continueReview}
          />
        ) : null}
        {showAnswerReview ? (
          <>
            <CourseButton
              type="button"
              size="large"
              emphasis="outlined"
              className="sc-course-quiz__secondary-action"
              aria-label="Quiz summary"
              onClick={onShowSummary}
            >
              Summary
            </CourseButton>
            <QuizAnswerReviewControls
              activeIndex={quiz.activeChildIndex}
              total={quiz.childCount}
              onNavigate={quiz.actions.navigateRuntime}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

function requireStableId(node: ProseMirrorNode, label: string): string {
  const id = node.attrs["id"];
  if (typeof id !== "string" || !id.trim()) throw new Error(`${label} is missing its stable id.`);
  return id;
}
