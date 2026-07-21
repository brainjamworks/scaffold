import { gradeAssessment } from "@scaffold/grading";

import {
  AssessmentGroupContractSchema,
  AssessmentResultSchema,
  AssessmentTargetContractSchema,
  type AnswerReveal,
  type AssessmentGroupContract,
  type AssessmentProblemSnapshot,
  type AssessmentResponseValue,
  type AssessmentResult,
  type AssessmentTargetContract,
  type QuizAttemptState,
  type QuizAssessmentSettings,
} from "@scaffold/contracts";
import type {
  AssessmentCheckRequest,
  AssessmentProblemCommandOutcome,
  AssessmentPort,
  AssessmentQuizCommandOutcome,
  AssessmentRevealRequest,
  AssessmentSubmitRequest,
} from "@scaffold/core/ports";

import { LOCAL_ARTIFACT_ID } from "./local-artifact-id";

export interface LocalAssessmentProjection {
  assessmentGroups: AssessmentGroupContract[];
  assessmentTargets: AssessmentTargetContract[];
}

type LocalAssessmentProjectionInputSource = () => {
  assessmentGroups: unknown;
  assessmentTargets: unknown;
};
type LocalAssessmentProjectionSource = () => LocalAssessmentProjection;

function parseLocalProjection(value: ReturnType<LocalAssessmentProjectionInputSource>) {
  return {
    assessmentGroups: AssessmentGroupContractSchema.array().parse(value.assessmentGroups),
    assessmentTargets: AssessmentTargetContractSchema.array().parse(value.assessmentTargets),
  } satisfies LocalAssessmentProjection;
}

function toAssessmentResult(result: ReturnType<typeof gradeAssessment>): AssessmentResult {
  return AssessmentResultSchema.parse(result);
}

function problemIdForTarget(target: AssessmentTargetContract): string {
  return `artifact:${LOCAL_ARTIFACT_ID}/block:${target.targetId}`;
}

function findLocalTarget(
  source: LocalAssessmentProjectionSource,
  args: Pick<AssessmentCheckRequest, "problemId" | "targetId">,
) {
  return source().assessmentTargets.find(
    (entry) => entry.targetId === args.targetId && problemIdForTarget(entry) === args.problemId,
  );
}

function authoredGroupIdFromRuntimeGroupId(groupId: string): string {
  const prefix = `artifact:${encodeURIComponent(LOCAL_ARTIFACT_ID)}/group:`;
  if (!groupId.startsWith(prefix)) {
    throw new Error(`local quiz group id is not scoped to ${LOCAL_ARTIFACT_ID}: ${groupId}`);
  }
  const encodedAuthoredGroupId = groupId.slice(prefix.length);
  if (!encodedAuthoredGroupId) {
    throw new Error("local quiz authored group id is missing");
  }

  let authoredGroupId: string;
  try {
    authoredGroupId = decodeURIComponent(encodedAuthoredGroupId);
  } catch {
    throw new Error(`local quiz group id is malformed: ${groupId}`);
  }
  if (!authoredGroupId.trim() || `${prefix}${encodeURIComponent(authoredGroupId)}` !== groupId) {
    throw new Error(`local quiz group id is not canonical: ${groupId}`);
  }
  return authoredGroupId;
}

function findLocalGroup(source: LocalAssessmentProjectionSource, runtimeGroupId: string) {
  const authoredGroupId = authoredGroupIdFromRuntimeGroupId(runtimeGroupId);
  return source().assessmentGroups.find((group) => group.groupId === authoredGroupId);
}

function targetById(source: LocalAssessmentProjectionSource, targetId: string) {
  return source().assessmentTargets.find((target) => target.targetId === targetId);
}

function gradeFromLocalDocument(
  source: LocalAssessmentProjectionSource,
  args: AssessmentCheckRequest | AssessmentSubmitRequest,
): AssessmentResult {
  const entry = findLocalTarget(source, args);
  if (!entry) return { isCorrect: false, score: 0, maxScore: 1, feedback: null, items: {} };
  return toAssessmentResult(gradeAssessment(entry, args.response));
}

function revealFromLocalDocument(
  source: LocalAssessmentProjectionSource,
  args: AssessmentRevealRequest,
): AnswerReveal {
  const entry = findLocalTarget(source, args);
  if (!entry) {
    throw new Error(`local assessment target not found: ${args.targetId}`);
  }
  return { answerKey: entry.assessment };
}

function newLocalAttemptId(groupId: string): string {
  return `${groupId}:${Date.now().toString(36)}`;
}

function gradeQuizResponse(
  source: LocalAssessmentProjectionSource,
  targetId: string,
  response: AssessmentResponseValue,
): AssessmentResult {
  const target = targetById(source, targetId);
  if (!target) return { isCorrect: false, score: 0, maxScore: 1, feedback: null, items: {} };
  return toAssessmentResult(gradeAssessment(target, response));
}

function aggregateQuizResults(resultsByTargetId: Record<string, AssessmentResult>) {
  const results = Object.values(resultsByTargetId);
  return {
    score: results.reduce((total, result) => total + result.score, 0),
    maxScore: results.reduce((total, result) => total + result.maxScore, 0),
  };
}

function isExpired(expiresAt: string | null): boolean {
  return expiresAt !== null && Date.now() >= Date.parse(expiresAt);
}

interface LocalQuizAttemptRecord {
  attemptId: string;
  groupId: string;
  targetIds: string[];
  settings: QuizAssessmentSettings;
  startedAt: string | null;
  expiresAt: string | null;
  resultsByTargetId: Record<string, AssessmentResult>;
  submittedTargetIds: string[];
  attemptCountsByTargetId: Record<string, number>;
}

export function createLocalAssessmentPortFromProjection(
  source: LocalAssessmentProjectionInputSource,
): AssessmentPort {
  const readProjection = () => parseLocalProjection(source());
  const attempts = new Map<string, LocalQuizAttemptRecord>();
  const problems = new Map<string, AssessmentProblemSnapshot>();

  const applyProblemResult = (
    targetId: string,
    response: AssessmentResponseValue,
    result: AssessmentResult,
    submitted: boolean,
  ): AssessmentProblemSnapshot => {
    const previous = problems.get(targetId);
    const problem: AssessmentProblemSnapshot = submitted
      ? {
          response,
          attemptNumber: (previous?.attemptNumber ?? 0) + 1,
          hintsShown: previous?.hintsShown ?? 0,
          checkResult: previous?.checkResult ?? null,
          submitted: true,
          submissionResult: result,
        }
      : {
          response,
          attemptNumber: (previous?.attemptNumber ?? 0) + 1,
          hintsShown: previous?.hintsShown ?? 0,
          checkResult: result,
          submitted: false,
          submissionResult: null,
        };
    problems.set(targetId, problem);
    return problem;
  };

  const problemSelection = (targetIds: string[]): Record<string, AssessmentProblemSnapshot> =>
    Object.fromEntries(
      targetIds.flatMap((targetId) => {
        const problem = problems.get(targetId);
        return problem ? [[targetId, problem] as const] : [];
      }),
    );

  return {
    type: "preview",
    check: async (args): Promise<AssessmentProblemCommandOutcome> => ({
      problem: applyProblemResult(
        args.targetId,
        args.response,
        gradeFromLocalDocument(readProjection, args),
        false,
      ),
    }),
    submit: async (args): Promise<AssessmentProblemCommandOutcome> => ({
      problem: applyProblemResult(
        args.targetId,
        args.response,
        gradeFromLocalDocument(readProjection, args),
        true,
      ),
    }),
    revealAnswer: async (args) => revealFromLocalDocument(readProjection, args),
    quiz: {
      startAttempt: async (args): Promise<AssessmentQuizCommandOutcome> => {
        const group = findLocalGroup(readProjection, args.groupId);
        if (!group) {
          throw new Error(`local quiz group not found: ${args.groupId}`);
        }
        const targetIds = group.targetIds;
        const settings = group.settings;
        const now = new Date().toISOString();
        const durationSeconds = settings.timer.enabled ? settings.timer.durationSeconds : 0;
        const attemptId = newLocalAttemptId(args.groupId);
        const expiresAt =
          durationSeconds > 0 ? new Date(Date.now() + durationSeconds * 1000).toISOString() : null;
        attempts.set(attemptId, {
          attemptId,
          groupId: args.groupId,
          targetIds,
          settings,
          startedAt: now,
          expiresAt,
          resultsByTargetId: {},
          submittedTargetIds: [],
          attemptCountsByTargetId: {},
        });
        const quizAttempt: QuizAttemptState = {
          attemptId,
          groupId: args.groupId,
          status: "in_progress",
          currentTargetId: targetIds[0] ?? null,
          submittedTargetIds: [],
          startedAt: now,
          finishedAt: null,
          expiresAt,
          score: null,
          maxScore: null,
          resultsByTargetId: {},
          answerReviewAuthorized: false,
        };
        return { quizAttempt, problemsByTargetId: {} };
      },
      submitQuestion: async (args): Promise<AssessmentQuizCommandOutcome> => {
        const previous = attempts.get(args.attemptId);
        if (!previous) {
          throw new Error(`local quiz attempt not found: ${args.attemptId}`);
        }
        if (previous.groupId !== args.groupId) {
          throw new Error(`local quiz attempt does not belong to group: ${args.groupId}`);
        }
        const group = findLocalGroup(readProjection, args.groupId);
        if (!group) {
          throw new Error(`local quiz group not found: ${args.groupId}`);
        }
        const targetIds = group.targetIds;
        const settings = group.settings;
        if (!targetIds.includes(args.targetId)) {
          throw new Error(`local quiz target not found: ${args.targetId}`);
        }
        if (settings.reviewTiming !== "after_each_answer") {
          throw new Error("local quiz question submission requires after_each_answer timing");
        }
        const previousAttemptCount = previous.attemptCountsByTargetId[args.targetId] ?? 0;
        if (previousAttemptCount >= settings.attemptsPerQuestion) {
          throw new Error(`local quiz attempts exhausted for ${args.targetId}`);
        }
        const firstUnsubmittedTargetId =
          targetIds.find((targetId) => !previous.submittedTargetIds.includes(targetId)) ?? null;
        if (
          previousAttemptCount === 0 &&
          firstUnsubmittedTargetId !== null &&
          args.targetId !== firstUnsubmittedTargetId
        ) {
          throw new Error(
            `local quiz current question is ${firstUnsubmittedTargetId}, not ${args.targetId}`,
          );
        }

        const result = gradeQuizResponse(readProjection, args.targetId, args.response);
        applyProblemResult(args.targetId, args.response, result, true);
        const attemptCountsByTargetId = {
          ...previous.attemptCountsByTargetId,
          [args.targetId]: previousAttemptCount + 1,
        };
        const submittedTargetIds = Array.from(
          new Set([...previous.submittedTargetIds, args.targetId]),
        );
        const resultsByTargetId = {
          ...previous.resultsByTargetId,
          [args.targetId]: result,
        };
        const hasAttemptsRemaining =
          attemptCountsByTargetId[args.targetId]! < settings.attemptsPerQuestion;
        const shouldStayOnTarget = !result.isCorrect && hasAttemptsRemaining;
        const expired = isExpired(previous.expiresAt);
        const nextTargetId = shouldStayOnTarget
          ? args.targetId
          : (targetIds.find((targetId) => !submittedTargetIds.includes(targetId)) ?? null);
        const status = expired ? "expired" : nextTargetId ? "in_progress" : "completed";
        attempts.set(args.attemptId, {
          attemptId: args.attemptId,
          groupId: args.groupId,
          targetIds,
          settings,
          startedAt: previous.startedAt,
          expiresAt: previous.expiresAt,
          resultsByTargetId,
          submittedTargetIds,
          attemptCountsByTargetId,
        });

        const quizAttempt: QuizAttemptState = {
          attemptId: args.attemptId,
          groupId: args.groupId,
          status,
          currentTargetId: expired ? args.targetId : nextTargetId,
          submittedTargetIds,
          startedAt: previous.startedAt,
          finishedAt: null,
          expiresAt: previous.expiresAt,
          score: null,
          maxScore: null,
          resultsByTargetId,
          answerReviewAuthorized: true,
        };
        return {
          quizAttempt,
          problemsByTargetId: problemSelection([args.targetId]),
        };
      },
      finishAttempt: async (args): Promise<AssessmentQuizCommandOutcome> => {
        const group = findLocalGroup(readProjection, args.groupId);
        if (!group) {
          throw new Error(`local quiz group not found: ${args.groupId}`);
        }
        const targetIds = group.targetIds;
        const unknownTargetId = Object.keys(args.responsesByTargetId).find(
          (targetId) => !targetIds.includes(targetId),
        );
        if (unknownTargetId) {
          throw new Error(`local quiz target not found: ${unknownTargetId}`);
        }
        const resultsByTargetId = Object.fromEntries(
          Object.entries(args.responsesByTargetId).map(([targetId, response]) => [
            targetId,
            gradeQuizResponse(readProjection, targetId, response),
          ]),
        );
        for (const [targetId, response] of Object.entries(args.responsesByTargetId)) {
          applyProblemResult(targetId, response, resultsByTargetId[targetId]!, true);
        }
        const { score, maxScore } = aggregateQuizResults(resultsByTargetId);
        const previous = attempts.get(args.attemptId);
        if (previous && previous.groupId !== args.groupId) {
          throw new Error(`local quiz attempt does not belong to group: ${args.groupId}`);
        }
        const expired = isExpired(previous?.expiresAt ?? null);
        attempts.set(args.attemptId, {
          attemptId: args.attemptId,
          groupId: args.groupId,
          targetIds,
          settings: group.settings,
          startedAt: previous?.startedAt ?? null,
          expiresAt: previous?.expiresAt ?? null,
          resultsByTargetId,
          submittedTargetIds: Object.keys(resultsByTargetId),
          attemptCountsByTargetId: Object.fromEntries(
            Object.keys(resultsByTargetId).map((targetId) => [targetId, 1]),
          ),
        });

        const quizAttempt: QuizAttemptState = {
          attemptId: args.attemptId,
          groupId: args.groupId,
          status: expired ? "expired" : "completed",
          currentTargetId: null,
          submittedTargetIds: Object.keys(resultsByTargetId),
          startedAt: previous?.startedAt ?? null,
          finishedAt: new Date().toISOString(),
          expiresAt: previous?.expiresAt ?? null,
          score,
          maxScore,
          resultsByTargetId,
          answerReviewAuthorized: true,
        };
        return {
          quizAttempt,
          problemsByTargetId: problemSelection(Object.keys(resultsByTargetId)),
        };
      },
      revealAnswers: async (args): Promise<AssessmentQuizCommandOutcome> => {
        const group = findLocalGroup(readProjection, args.groupId);
        if (!group) {
          throw new Error(`local quiz group not found: ${args.groupId}`);
        }
        const previous = attempts.get(args.attemptId);
        if (previous && previous.groupId !== args.groupId) {
          throw new Error(`local quiz attempt does not belong to group: ${args.groupId}`);
        }
        const aggregate = aggregateQuizResults(previous?.resultsByTargetId ?? {});
        if (!previous) {
          const quizAttempt: QuizAttemptState = {
            attemptId: args.attemptId,
            groupId: args.groupId,
            status: "completed",
            currentTargetId: null,
            submittedTargetIds: [],
            startedAt: null,
            finishedAt: new Date().toISOString(),
            expiresAt: null,
            score: null,
            maxScore: null,
            resultsByTargetId: {},
            answerReviewAuthorized: true,
          };
          return { quizAttempt, problemsByTargetId: {} };
        }
        const quizAttempt: QuizAttemptState = {
          attemptId: args.attemptId,
          groupId: args.groupId,
          status: "completed",
          currentTargetId: null,
          submittedTargetIds: previous.submittedTargetIds,
          startedAt: previous.startedAt,
          finishedAt: new Date().toISOString(),
          expiresAt: previous.expiresAt,
          score: aggregate.score,
          maxScore: aggregate.maxScore,
          resultsByTargetId: previous.resultsByTargetId,
          answerReviewAuthorized: true,
        };
        return {
          quizAttempt,
          problemsByTargetId: problemSelection(previous.targetIds),
        };
      },
    },
  };
}
