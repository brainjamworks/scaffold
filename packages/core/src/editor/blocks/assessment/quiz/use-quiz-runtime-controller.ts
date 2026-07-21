import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { useEffect, useMemo, useRef, useState } from "react";

import { useAssessmentQuizFacade } from "@/runtime/assessment/runtime-facade";

import { getQuizSummary } from "./quiz-shared";
import {
  deriveQuizLearnerViewModel,
  isRetryableQuizSubmission,
  problemForQuizTarget,
  responseFingerprint,
  runtimeQuizActiveChildKey,
} from "./quiz-runtime-policy";

export function useQuizRuntimeController({ node }: { node: ProseMirrorNode }) {
  const quizSummary = useMemo(() => getQuizSummary(node), [node]);
  const { childCount, childKeys, isEmpty, quizViewId, settings } = quizSummary;
  const [runtimeActiveChildId, setRuntimeActiveChildId] = useState<string | null>(null);
  const [reviewPauseChildId, setReviewPauseChildId] = useState<string | null>(null);
  const [retryResponseFingerprintByChildId, setRetryResponseFingerprintByChildId] = useState<
    Record<string, string>
  >({});
  const quizRegistration = useMemo(
    () => ({ groupId: quizViewId, targetIds: childKeys, settings }),
    [childKeys, quizViewId, settings],
  );
  const quizFacade = useAssessmentQuizFacade(quizRegistration, !isEmpty);
  const quiz = quizFacade.attempt;
  const problems = quizFacade.problemsByTargetId;
  const runtimeStatus = quiz?.status ?? "not_started";
  const canRequestFullReview =
    runtimeStatus === "completed" && settings.reviewDetail === "full_review";
  const canShowCompletedReview =
    runtimeStatus === "completed" &&
    settings.reviewDetail !== "none" &&
    Boolean(quiz?.answerReviewAuthorized);
  const localRuntimeTargetId =
    reviewPauseChildId ??
    (settings.reviewTiming === "after_quiz" || canShowCompletedReview
      ? runtimeActiveChildId
      : null);
  const runtimeActiveChildKey = runtimeQuizActiveChildKey({
    canShowCompletedReview,
    childKeys,
    currentTargetId: quiz?.currentTargetId ?? null,
    localTargetId: localRuntimeTargetId,
    status: runtimeStatus,
  });
  const activeChildKey = runtimeActiveChildKey;
  const activeChildIndex = activeChildKey ? childKeys.indexOf(activeChildKey) : -1;

  useEffect(() => {
    if (reviewPauseChildId) return;
    // Preserve the existing runtime sync behavior during the folder migration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRuntimeActiveChildId(quiz?.currentTargetId ?? null);
  }, [quiz?.currentTargetId, reviewPauseChildId]);

  useEffect(() => {
    if (runtimeStatus === "in_progress") return;
    // Preserve the existing runtime sync behavior during the folder migration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReviewPauseChildId(null);
  }, [runtimeStatus]);

  const learnerControls = deriveQuizLearnerViewModel({
    activeChildIndex,
    activeChildKey,
    attemptsPerQuestion: settings.attemptsPerQuestion,
    childCount,
    childKeys,
    problems,
    quizSubmittedTargetIds: quiz?.submittedTargetIds ?? [],
    retryResponseFingerprintByChildId,
    reviewPauseChildId,
    reviewTiming: settings.reviewTiming,
    allowBacktracking: settings.allowBacktracking,
    runtimeStatus,
  });
  const [timerNow, setTimerNow] = useState(() => Date.now());
  const [timesUp, setTimesUp] = useState(false);
  const expiredAttemptRef = useRef<string | null>(null);
  const timerExpiresAt =
    typeof quiz?.expiresAt === "string" ? Date.parse(quiz.expiresAt) : Number.NaN;
  const timerActive =
    settings.timer.enabled && runtimeStatus === "in_progress" && Number.isFinite(timerExpiresAt);
  const timerRemainingSeconds = timerActive
    ? Math.max(0, Math.ceil((timerExpiresAt - timerNow) / 1000))
    : null;

  useEffect(() => {
    if (!timerActive) return undefined;
    // Preserve the existing timer sync behavior during the folder migration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTimerNow(Date.now());
    const interval = window.setInterval(() => setTimerNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [quiz?.expiresAt, timerActive]);

  useEffect(() => {
    if (
      !timerActive ||
      timerRemainingSeconds !== 0 ||
      !quiz?.attemptId ||
      expiredAttemptRef.current === quiz.attemptId
    ) {
      return;
    }
    expiredAttemptRef.current = quiz.attemptId;
    setTimesUp(true);
    void quizFacade.actions.expire();
  }, [quiz?.attemptId, quizFacade.actions, timerActive, timerRemainingSeconds]);

  useEffect(() => {
    if (!quiz?.attemptId) {
      expiredAttemptRef.current = null;
    } else if (expiredAttemptRef.current && expiredAttemptRef.current !== quiz.attemptId) {
      expiredAttemptRef.current = null;
    }
  }, [quiz?.attemptId]);

  useEffect(() => {
    if (!timesUp) return undefined;
    const handle = window.setTimeout(() => setTimesUp(false), 1400);
    return () => window.clearTimeout(handle);
  }, [timesUp]);

  useEffect(() => {
    if (runtimeStatus === "not_started") {
      // Preserve the existing runtime sync behavior during the folder migration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTimesUp(false);
    }
  }, [runtimeStatus]);

  useEffect(() => {
    if (!canRequestFullReview || quiz?.answerReviewAuthorized || !quiz?.attemptId) {
      return;
    }
    void quizFacade.actions.revealAnswers();
  }, [canRequestFullReview, quiz?.answerReviewAuthorized, quiz?.attemptId, quizFacade.actions]);

  return {
    actions: {
      finish: () => void quizFacade.actions.finish(),
      continueReview: () => {
        const portTargetId =
          quiz?.currentTargetId && childKeys.includes(quiz.currentTargetId)
            ? quiz.currentTargetId
            : null;
        const fallbackTargetId = childKeys[activeChildIndex + 1] ?? null;
        setReviewPauseChildId(null);
        setRuntimeActiveChildId(portTargetId ?? fallbackTargetId);
      },
      navigateRuntime: (index: number) => setRuntimeActiveChildId(childKeys[index] ?? null),
      start: () => void quizFacade.actions.start(),
      submitCurrent: () => {
        if (!activeChildKey) return;
        const submittedChildKey = activeChildKey;
        const submittedProblem = problemForQuizTarget(problems, submittedChildKey);
        void quizFacade.actions.submitQuestion(submittedChildKey).then((nextQuiz) => {
          const retryable = Boolean(
            nextQuiz &&
            isRetryableQuizSubmission({
              attempt: nextQuiz,
              attemptsPerQuestion: settings.attemptsPerQuestion,
              problem: submittedProblem,
              targetId: submittedChildKey,
            }),
          );
          if (
            !nextQuiz ||
            nextQuiz.status !== "in_progress" ||
            settings.reviewTiming !== "after_each_answer" ||
            retryable
          ) {
            if (
              nextQuiz?.status === "in_progress" &&
              settings.reviewTiming === "after_each_answer" &&
              retryable &&
              submittedProblem
            ) {
              setRetryResponseFingerprintByChildId((current) => ({
                ...current,
                [submittedChildKey]: responseFingerprint(submittedProblem.problem?.response),
              }));
            }
            return;
          }
          setRetryResponseFingerprintByChildId((current) => {
            if (!(submittedChildKey in current)) return current;
            const next = { ...current };
            delete next[submittedChildKey];
            return next;
          });
          setReviewPauseChildId(submittedChildKey);
          setRuntimeActiveChildId(submittedChildKey);
        });
      },
    },
    activeChildIndex,
    activeChildKey,
    canReviewAnswers: canShowCompletedReview,
    canStart: quizFacade.available,
    canSubmitLocked: learnerControls.canSubmitAnswer,
    childCount,
    childKeys,
    childTypes: quizSummary.childTypes,
    isEmpty,
    learnerControls,
    quiz,
    quizViewId,
    runtimeStatus,
    settings,
    timerActive,
    timerRemainingSeconds,
    timesUp,
    totalPoints: quizSummary.totalPoints,
  };
}
