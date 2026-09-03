import type { AssessmentQuizProblemFacade } from "@/runtime/assessment/runtime-facade";
import type { QuizAttemptState, QuizReviewTiming } from "@scaffold/contracts";

export interface QuizLearnerViewModel {
  canGoNext: boolean;
  canGoPrevious: boolean;
  canContinueReview: boolean;
  canRetryAnswer: boolean;
  canSubmitAnswer: boolean;
  canSubmitQuiz: boolean;
  currentQuestionAnswered: boolean;
  isReviewPause: boolean;
}

export function deriveQuizLearnerViewModel({
  activeChildIndex,
  activeChildKey,
  allowBacktracking,
  attemptsPerQuestion,
  childCount,
  childKeys,
  problems,
  quizSubmittedTargetIds,
  retryResponseFingerprintByChildId,
  reviewPauseChildId,
  reviewTiming,
  runtimeStatus,
}: {
  activeChildIndex: number;
  activeChildKey: string | null;
  allowBacktracking: boolean;
  attemptsPerQuestion: number;
  childCount: number;
  childKeys: readonly string[];
  problems: Readonly<Record<string, AssessmentQuizProblemFacade>>;
  quizSubmittedTargetIds: readonly string[];
  retryResponseFingerprintByChildId: Record<string, string>;
  reviewPauseChildId: string | null;
  reviewTiming: QuizReviewTiming;
  runtimeStatus: string | null;
}): QuizLearnerViewModel {
  const inProgress = runtimeStatus === "in_progress";
  const currentQuestionAnswered = quizTargetResponseReady(problems, activeChildKey);
  const allQuestionsAnswered = quizRequiredResponsesComplete(problems, childKeys);
  const retryProblem = problemForQuizTarget(problems, activeChildKey);
  const retryFingerprint =
    activeChildKey === null ? undefined : retryResponseFingerprintByChildId[activeChildKey];
  const isReviewPause =
    inProgress &&
    reviewTiming === "after_each_answer" &&
    activeChildKey !== null &&
    reviewPauseChildId === activeChildKey &&
    quizSubmittedTargetIds.includes(activeChildKey);
  const canRetryAnswer =
    inProgress &&
    reviewTiming === "after_each_answer" &&
    activeChildKey !== null &&
    !isReviewPause &&
    retryFingerprint !== undefined &&
    retryProblem !== null &&
    retryProblem.problem !== null &&
    retryProblem.problem.attemptNumber > 0 &&
    retryProblem.problem.attemptNumber < attemptsPerQuestion;
  const retryResponseChanged =
    canRetryAnswer &&
    retryProblem !== null &&
    responseFingerprint(retryProblem.problem?.response) !== retryFingerprint;
  const hasNextQuestion = activeChildIndex >= 0 && activeChildIndex < childCount - 1;

  return {
    canGoNext:
      inProgress &&
      activeChildIndex >= 0 &&
      activeChildIndex < childCount - 1 &&
      currentQuestionAnswered,
    canGoPrevious: inProgress && allowBacktracking && activeChildIndex > 0,
    canContinueReview: isReviewPause && hasNextQuestion,
    canRetryAnswer,
    canSubmitAnswer:
      inProgress &&
      reviewTiming === "after_each_answer" &&
      !isReviewPause &&
      currentQuestionAnswered &&
      (!canRetryAnswer || retryResponseChanged),
    canSubmitQuiz:
      inProgress &&
      reviewTiming === "after_quiz" &&
      activeChildIndex === childCount - 1 &&
      allQuestionsAnswered,
    currentQuestionAnswered,
    isReviewPause,
  };
}

export function problemForQuizTarget(
  problems: Readonly<Record<string, AssessmentQuizProblemFacade>>,
  targetId: string | null,
): AssessmentQuizProblemFacade | null {
  if (!targetId) return null;
  return problems[targetId] ?? null;
}

export function isRetryableQuizQuestion({
  attemptsPerQuestion,
  problems,
  targetId,
}: {
  attemptsPerQuestion: number;
  problems: Readonly<Record<string, AssessmentQuizProblemFacade>>;
  targetId: string | null;
}): boolean {
  if (!targetId || attemptsPerQuestion <= 1) return false;
  const problem = problemForQuizTarget(problems, targetId);
  return Boolean(
    problem &&
    problem.problem &&
    !problem.problem.submitted &&
    problem.problem.attemptNumber > 0 &&
    problem.problem.attemptNumber < attemptsPerQuestion &&
    (problem.problem.submissionResult ?? problem.problem.checkResult)?.isCorrect === false,
  );
}

export function isRetryableQuizSubmission({
  attempt,
  attemptsPerQuestion,
  problem,
  targetId,
}: {
  attempt: QuizAttemptState;
  attemptsPerQuestion: number;
  problem: AssessmentQuizProblemFacade | null;
  targetId: string;
}): boolean {
  const nextAttemptNumber = (problem?.problem?.attemptNumber ?? 0) + 1;
  return (
    attempt.status === "in_progress" &&
    attempt.currentTargetId === targetId &&
    attempt.resultsByTargetId[targetId]?.isCorrect === false &&
    nextAttemptNumber < attemptsPerQuestion
  );
}

export function responseFingerprint(response: unknown): string {
  return JSON.stringify(response);
}

export function runtimeQuizActiveChildKey({
  canShowCompletedReview,
  childKeys,
  currentTargetId,
  localTargetId,
  status,
}: {
  canShowCompletedReview: boolean;
  childKeys: string[];
  currentTargetId: string | null;
  localTargetId: string | null;
  status: string | null;
}): string | null {
  if (status === "not_started") return null;
  if (status === "completed" && !canShowCompletedReview) return null;
  if (localTargetId && childKeys.includes(localTargetId)) return localTargetId;
  if (currentTargetId && childKeys.includes(currentTargetId)) {
    return currentTargetId;
  }
  return childKeys[0] ?? null;
}

export function quizRequiredResponsesComplete(
  problems: Readonly<Record<string, AssessmentQuizProblemFacade>>,
  targetIds: readonly string[],
): boolean {
  return targetIds.every((targetId) => {
    return problems[targetId]?.responseReady ?? false;
  });
}

export function quizTargetResponseReady(
  problems: Readonly<Record<string, AssessmentQuizProblemFacade>>,
  targetId: string | null,
): boolean {
  if (!targetId) return false;
  return problems[targetId]?.responseReady ?? false;
}
