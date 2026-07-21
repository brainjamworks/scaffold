import { createStore } from "zustand/vanilla";

import {
  AnswerRevealSchema,
  AssessmentResultSchema,
  AssessmentResponseValueSchema,
  QuizAssessmentSettingsSchema,
  QuizAttemptStateSchema,
  type AssessmentProblemSnapshot,
  type AssessmentResponseValue,
  type AssessmentResult,
  type QuizAttemptState,
  type QuizReviewDetail,
} from "@scaffold/contracts";
import {
  AssessmentProblemCommandOutcomeSchema,
  AssessmentQuizCommandOutcomeSchema,
} from "../../host/ports/assessment";
import type {
  AssessmentGroupId,
  AssessmentProblemId,
  AssessmentQuizRegistration,
  AssessmentQuizRegistrationInput,
  AssessmentRegistration,
  AssessmentRegistrationIdentity,
  AssessmentRegistrationInput,
  AssessmentRequestOperation,
  AssessmentScopedId,
  AssessmentStore,
  AssessmentStoreApi,
  CreateAssessmentStoreOptions,
} from "./types";

function emptyProblem(): AssessmentProblemSnapshot {
  return {
    response: null,
    attemptNumber: 0,
    hintsShown: 0,
    checkResult: null,
    submitted: false,
    submissionResult: null,
  };
}

function requiredIdentityPart(name: string, value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${name} must be a non-blank string`);
  }
  return encodeURIComponent(normalized);
}

export function scopeAssessmentProblemId(
  artifactId: string,
  problemId: string,
): AssessmentProblemId {
  return `artifact:${requiredIdentityPart("artifactId", artifactId)}/block:${requiredIdentityPart(
    "problemId",
    problemId,
  )}`;
}

export function scopeAssessmentGroupId(artifactId: string, groupId: string): AssessmentGroupId {
  return `artifact:${requiredIdentityPart("artifactId", artifactId)}/group:${requiredIdentityPart(
    "groupId",
    groupId,
  )}`;
}

function storedRegistration(
  artifactId: string,
  registration: AssessmentRegistrationInput,
): AssessmentRegistration {
  const targetId = registration.targetId.trim();
  if (!targetId) {
    throw new Error("targetId must be a non-blank string");
  }

  return {
    ...registration,
    problemId: scopeAssessmentProblemId(artifactId, registration.problemId),
    targetId,
  };
}

function assertRegistrationIdentity(
  current: AssessmentRegistration,
  next: AssessmentRegistrationIdentity,
): void {
  if (current.targetId !== next.targetId) {
    throw new Error(
      `Assessment registration targetId cannot change from ${current.targetId} to ${next.targetId}`,
    );
  }
  if (current.interactionKind !== next.interactionKind) {
    throw new Error(
      `Assessment registration interactionKind cannot change from ${current.interactionKind} to ${next.interactionKind}`,
    );
  }
}

function validatedHydratedResponseReady(
  problem: AssessmentProblemSnapshot | undefined,
  registration: AssessmentRegistration,
): boolean | undefined {
  if (!problem?.response) return undefined;
  if (problem.response.kind !== registration.interactionKind) {
    throw new Error(
      `Hydrated assessment response kind ${problem.response.kind} does not match registration interactionKind ${registration.interactionKind}`,
    );
  }

  try {
    const localResponse = registration.response.fromContractResponse(problem.response);
    const parsedLocalResponse = registration.response.schema.safeParse(localResponse);
    if (!parsedLocalResponse.success) {
      throw new Error("decoded response failed the local response schema");
    }
    return registration.response.hasResponse(parsedLocalResponse.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Hydrated assessment response failed registered capability validation: ${message}`,
    );
  }
}

function validatedProblemOutcome(
  value: unknown,
  registration: AssessmentRegistration,
): { problem: AssessmentProblemSnapshot } {
  const outcome = AssessmentProblemCommandOutcomeSchema.parse(value);
  if (
    outcome.problem.response !== null &&
    outcome.problem.response.kind !== registration.interactionKind
  ) {
    throw new Error(
      `Assessment host response kind ${outcome.problem.response.kind} does not match registration interactionKind ${registration.interactionKind}`,
    );
  }
  return outcome;
}

function storedQuizRegistration(
  artifactId: string,
  registration: AssessmentQuizRegistrationInput,
): AssessmentQuizRegistration {
  const targetIds = registration.targetIds.map((targetId) => targetId.trim());
  if (targetIds.length === 0 || targetIds.some((targetId) => !targetId)) {
    throw new Error("Quiz targetIds must contain non-blank strings");
  }
  if (new Set(targetIds).size !== targetIds.length) {
    throw new Error("Quiz targetIds must be unique");
  }
  return {
    groupId: scopeAssessmentGroupId(artifactId, registration.groupId),
    targetIds,
    settings: QuizAssessmentSettingsSchema.parse(registration.settings),
  };
}

function validatedQuizAttempt(
  value: unknown,
  registration: AssessmentQuizRegistration,
  expectedAttemptId?: string,
): QuizAttemptState {
  const attempt = QuizAttemptStateSchema.parse(value);
  if (attempt.groupId !== registration.groupId) {
    throw new Error("Quiz host response groupId does not match the registered group");
  }
  if (expectedAttemptId !== undefined && attempt.attemptId !== expectedAttemptId) {
    throw new Error("Quiz host response attemptId does not match the current attempt");
  }
  const registeredTargets = new Set(registration.targetIds);
  if (attempt.currentTargetId !== null && !registeredTargets.has(attempt.currentTargetId)) {
    throw new Error("Quiz host response currentTargetId is not registered");
  }
  for (const targetId of attempt.submittedTargetIds) {
    if (!registeredTargets.has(targetId)) {
      throw new Error("Quiz host response contains an unregistered submitted target");
    }
  }
  for (const targetId of Object.keys(attempt.resultsByTargetId)) {
    if (!registeredTargets.has(targetId)) {
      throw new Error("Quiz host response contains an unregistered result target");
    }
  }
  return attempt;
}

function validatedQuizOutcome(
  value: unknown,
  registration: AssessmentQuizRegistration,
  state: AssessmentStore,
  expectedAttemptId?: string,
): {
  quizAttempt: QuizAttemptState;
  problems: Record<AssessmentProblemId, AssessmentProblemSnapshot>;
} {
  const outcome = AssessmentQuizCommandOutcomeSchema.parse(value);
  const quizAttempt = validatedQuizAttempt(outcome.quizAttempt, registration, expectedAttemptId);
  const problems: Record<AssessmentProblemId, AssessmentProblemSnapshot> = {};
  for (const [targetId, problem] of Object.entries(outcome.problemsByTargetId)) {
    if (!registration.targetIds.includes(targetId)) {
      throw new Error("Quiz host response contains an unregistered problem target");
    }
    const problemRegistrations = Object.values(state.registrations).filter(
      (candidate) => candidate.targetId === targetId,
    );
    if (problemRegistrations.length !== 1) {
      throw new Error("Quiz host response problem target does not have one registration");
    }
    const problemRegistration = problemRegistrations[0];
    if (!problemRegistration) {
      throw new Error("Quiz host response problem target does not have one registration");
    }
    if (
      problem.response !== null &&
      problem.response.kind !== problemRegistration.interactionKind
    ) {
      throw new Error("Quiz host response problem kind does not match its registration");
    }
    problems[problemRegistration.problemId] = problem;
  }
  return { quizAttempt, problems };
}

export function redactQuizResult(
  result: AssessmentResult,
  reviewDetail: QuizReviewDetail,
  answerReviewAuthorized: boolean,
): AssessmentResult | null {
  const parsed = AssessmentResultSchema.parse(result);
  if (!answerReviewAuthorized || reviewDetail === "none") return null;
  if (reviewDetail === "full_review") return parsed;

  return AssessmentResultSchema.parse({
    isCorrect: parsed.isCorrect,
    score: parsed.score,
    maxScore: 1,
    feedback: null,
    items: {},
  });
}

export function createAssessmentStore({
  artifactId,
  assessmentPort,
}: CreateAssessmentStoreOptions): AssessmentStoreApi {
  const normalizedArtifactId = artifactId.trim();
  if (!normalizedArtifactId) {
    throw new Error("artifactId must be a non-blank string");
  }

  return createStore((set, get) => {
    let requestSequence = 0;

    const beginRequest = (
      ownerId: AssessmentScopedId,
      operation: AssessmentRequestOperation,
    ): string => {
      const requestId = `${operation}:${++requestSequence}`;
      set((state) => ({
        requests: {
          ...state.requests,
          [ownerId]: { ownerId, requestId, operation, status: "pending", error: null },
        },
      }));
      return requestId;
    };

    const failCurrentRequest = (ownerId: AssessmentScopedId, requestId: string, error: unknown) => {
      if (get().requests[ownerId]?.requestId !== requestId) return;
      const message = error instanceof Error ? error.message : String(error);
      set((state) => {
        const current = state.requests[ownerId];
        if (!current || current.requestId !== requestId) return state;
        return {
          requests: {
            ...state.requests,
            [ownerId]: { ...current, status: "error", error: message },
          },
        };
      });
    };

    const quizResponses = (
      registration: AssessmentQuizRegistration,
    ): Record<string, AssessmentResponseValue> => {
      const state = get();
      const responses: Record<string, AssessmentResponseValue> = {};
      for (const targetId of registration.targetIds) {
        const problemRegistration = Object.values(state.registrations).find(
          (candidate) => candidate.targetId === targetId,
        );
        if (!problemRegistration) continue;
        const response = state.durable.problems[problemRegistration.problemId]?.response;
        if (response && state.transient.responseReady[problemRegistration.problemId]) {
          responses[targetId] = response;
        }
      }
      return responses;
    };

    const commitQuizOutcome = (
      groupId: AssessmentGroupId,
      requestId: string,
      outcome: {
        quizAttempt: QuizAttemptState;
        problems: Record<AssessmentProblemId, AssessmentProblemSnapshot>;
      },
      clearRequest: boolean,
    ): boolean => {
      let committed = false;
      set((state) => {
        if (state.requests[groupId]?.requestId !== requestId) return state;
        committed = true;
        const durable = {
          problems: { ...state.durable.problems, ...outcome.problems },
          quizzes: { ...state.durable.quizzes, [groupId]: outcome.quizAttempt },
        };
        if (!clearRequest) return { durable };
        const requests = { ...state.requests };
        delete requests[groupId];
        return { durable, requests };
      });
      return committed;
    };

    return {
      artifactId: normalizedArtifactId,
      durable: { problems: {}, quizzes: {} },
      targetBindings: {},
      registrations: {},
      quizRegistrations: {},
      requests: {},
      transient: { responseReady: {}, revealedAnswers: {} },
      register: (registration) => {
        const next = storedRegistration(normalizedArtifactId, registration);
        const current = get().registrations[next.problemId];
        if (current) assertRegistrationIdentity(current, next);

        const canonicalProblemId = scopeAssessmentProblemId(normalizedArtifactId, next.targetId);
        const runtimeProblem = get().durable.problems[next.problemId];
        const canonicalProblem = get().durable.problems[canonicalProblemId];
        if (
          canonicalProblemId !== next.problemId &&
          runtimeProblem !== undefined &&
          canonicalProblem !== undefined
        ) {
          throw new Error(
            `Assessment registration cannot bind targetId ${next.targetId}; both canonical and runtime durable records exist`,
          );
        }
        const hydratedProblem = runtimeProblem ?? canonicalProblem;
        const responseReady = validatedHydratedResponseReady(hydratedProblem, next);

        set((state) => ({
          durable:
            canonicalProblemId === next.problemId || canonicalProblem === undefined
              ? state.durable
              : {
                  ...state.durable,
                  problems: {
                    ...Object.fromEntries(
                      Object.entries(state.durable.problems).filter(
                        ([problemId]) => problemId !== canonicalProblemId,
                      ),
                    ),
                    [next.problemId]: canonicalProblem,
                  },
                },
          registrations: { ...state.registrations, [next.problemId]: next },
          targetBindings: {
            ...state.targetBindings,
            [next.problemId]: next.targetId,
          },
          transient: {
            ...state.transient,
            responseReady: {
              ...Object.fromEntries(
                Object.entries(state.transient.responseReady).filter(
                  ([problemId]) => problemId !== canonicalProblemId,
                ),
              ),
              ...(responseReady === undefined ? {} : { [next.problemId]: responseReady }),
            },
          },
        }));
        return true;
      },
      update: (registration) => {
        const next = storedRegistration(normalizedArtifactId, registration);
        const current = get().registrations[next.problemId];
        if (!current) return false;
        assertRegistrationIdentity(current, next);
        set((state) => ({
          registrations: { ...state.registrations, [next.problemId]: next },
        }));
        return true;
      },
      unregister: (identity) => {
        const problemId = scopeAssessmentProblemId(normalizedArtifactId, identity.problemId);
        const current = get().registrations[problemId];
        if (!current) return false;
        assertRegistrationIdentity(current, {
          ...identity,
          targetId: identity.targetId.trim(),
        });
        set((state) => {
          const registrations = { ...state.registrations };
          delete registrations[problemId];
          const requests = { ...state.requests };
          delete requests[problemId];
          const responseReady = { ...state.transient.responseReady };
          delete responseReady[problemId];
          const revealedAnswers = { ...state.transient.revealedAnswers };
          delete revealedAnswers[problemId];
          return {
            registrations,
            requests,
            transient: { responseReady, revealedAnswers },
          };
        });
        return true;
      },
      registerQuiz: (registration) => {
        const next = storedQuizRegistration(normalizedArtifactId, registration);
        set((state) => ({
          quizRegistrations: { ...state.quizRegistrations, [next.groupId]: next },
        }));
        return true;
      },
      updateQuiz: (registration) => {
        const next = storedQuizRegistration(normalizedArtifactId, registration);
        if (!get().quizRegistrations[next.groupId]) return false;
        set((state) => ({
          quizRegistrations: { ...state.quizRegistrations, [next.groupId]: next },
        }));
        return true;
      },
      unregisterQuiz: (identity) => {
        const groupId = scopeAssessmentGroupId(normalizedArtifactId, identity.groupId);
        if (!get().quizRegistrations[groupId]) return false;
        set((state) => {
          const quizRegistrations = { ...state.quizRegistrations };
          delete quizRegistrations[groupId];
          const requests = { ...state.requests };
          delete requests[groupId];
          return { quizRegistrations, requests };
        });
        return true;
      },
      setLocalResponse: (identity, localResponse) => {
        const problemId = scopeAssessmentProblemId(normalizedArtifactId, identity.problemId);
        const registration = get().registrations[problemId];
        if (!registration) return false;
        const normalizedIdentity = { ...identity, targetId: identity.targetId.trim() };
        try {
          assertRegistrationIdentity(registration, normalizedIdentity);
        } catch {
          return false;
        }

        const parsedLocalResponse = registration.response.schema.safeParse(localResponse);
        if (!parsedLocalResponse.success) return false;

        try {
          const parsedContractResponse = AssessmentResponseValueSchema.safeParse(
            registration.response.toContractResponse(parsedLocalResponse.data),
          );
          if (
            !parsedContractResponse.success ||
            parsedContractResponse.data.kind !== registration.interactionKind
          ) {
            return false;
          }

          const current = get().durable.problems[problemId] ?? emptyProblem();
          const exhausted =
            registration.config.settings.maxAttempts !== null &&
            current.attemptNumber >= registration.config.settings.maxAttempts;
          if (current.submitted || exhausted) return false;

          set((state) => {
            const requests = { ...state.requests };
            delete requests[problemId];
            const revealedAnswers = { ...state.transient.revealedAnswers };
            delete revealedAnswers[problemId];
            return {
              durable: {
                ...state.durable,
                problems: {
                  ...state.durable.problems,
                  [problemId]: {
                    ...current,
                    response: parsedContractResponse.data,
                    checkResult: null,
                    submissionResult: null,
                  },
                },
              },
              requests,
              transient: {
                responseReady: {
                  ...state.transient.responseReady,
                  [problemId]: registration.response.hasResponse(parsedLocalResponse.data),
                },
                revealedAnswers,
              },
            };
          });
          return true;
        } catch {
          return false;
        }
      },
      check: async (identity) => {
        const problemId = scopeAssessmentProblemId(normalizedArtifactId, identity.problemId);
        const registration = get().registrations[problemId];
        if (!registration) return null;
        try {
          assertRegistrationIdentity(registration, {
            ...identity,
            targetId: identity.targetId.trim(),
          });
        } catch {
          return null;
        }

        const problem = get().durable.problems[problemId];
        if (!problem?.response || !get().transient.responseReady[problemId]) return null;
        const consumesAttempt = registration.config.settings.feedbackMode === "immediate";
        const maxAttempts = registration.config.settings.maxAttempts;
        if (consumesAttempt && maxAttempts !== null && problem.attemptNumber >= maxAttempts) {
          return null;
        }

        const requestId = beginRequest(problemId, "check");
        if (!assessmentPort?.check) {
          failCurrentRequest(problemId, requestId, "Assessment check is unavailable");
          return null;
        }

        try {
          const outcome = validatedProblemOutcome(
            await assessmentPort.check({
              problemId,
              targetId: registration.targetId,
              interactionKind: registration.interactionKind,
              response: problem.response,
              expectedAttemptNumber: problem.attemptNumber,
            }),
            registration,
          );
          if (get().requests[problemId]?.requestId !== requestId) return null;
          set((state) => {
            if (state.requests[problemId]?.requestId !== requestId) return state;
            const requests = { ...state.requests };
            delete requests[problemId];
            return {
              durable: {
                ...state.durable,
                problems: {
                  ...state.durable.problems,
                  [problemId]: outcome.problem,
                },
              },
              requests,
            };
          });
          return outcome.problem.checkResult;
        } catch (error) {
          failCurrentRequest(problemId, requestId, error);
          return null;
        }
      },
      submit: async (identity) => {
        const problemId = scopeAssessmentProblemId(normalizedArtifactId, identity.problemId);
        const registration = get().registrations[problemId];
        if (!registration) return null;
        try {
          assertRegistrationIdentity(registration, {
            ...identity,
            targetId: identity.targetId.trim(),
          });
        } catch {
          return null;
        }

        const problem = get().durable.problems[problemId];
        if (!problem?.response || !get().transient.responseReady[problemId] || problem.submitted) {
          return null;
        }
        const maxAttempts = registration.config.settings.maxAttempts;
        if (maxAttempts !== null && problem.attemptNumber >= maxAttempts) return null;

        const requestId = beginRequest(problemId, "submit");
        if (!assessmentPort) {
          failCurrentRequest(problemId, requestId, "Assessment submission is unavailable");
          return null;
        }

        try {
          const outcome = validatedProblemOutcome(
            await assessmentPort.submit({
              problemId,
              targetId: registration.targetId,
              interactionKind: registration.interactionKind,
              response: problem.response,
              expectedAttemptNumber: problem.attemptNumber,
            }),
            registration,
          );
          if (get().requests[problemId]?.requestId !== requestId) return null;
          set((state) => {
            if (state.requests[problemId]?.requestId !== requestId) return state;
            const requests = { ...state.requests };
            delete requests[problemId];
            return {
              durable: {
                ...state.durable,
                problems: {
                  ...state.durable.problems,
                  [problemId]: outcome.problem,
                },
              },
              requests,
            };
          });
          return outcome.problem.submissionResult;
        } catch (error) {
          failCurrentRequest(problemId, requestId, error);
          return null;
        }
      },
      reset: (identity) => {
        const problemId = scopeAssessmentProblemId(normalizedArtifactId, identity.problemId);
        const registration = get().registrations[problemId];
        if (!registration) return false;
        try {
          assertRegistrationIdentity(registration, {
            ...identity,
            targetId: identity.targetId.trim(),
          });
        } catch {
          return false;
        }
        const problem = get().durable.problems[problemId];
        if (!problem) return false;
        const maxAttempts = registration.config.settings.maxAttempts;
        if (maxAttempts !== null && problem.attemptNumber >= maxAttempts) return false;

        set((state) => {
          const requests = { ...state.requests };
          delete requests[problemId];
          const responseReady = { ...state.transient.responseReady };
          delete responseReady[problemId];
          const revealedAnswers = { ...state.transient.revealedAnswers };
          delete revealedAnswers[problemId];
          return {
            durable: {
              ...state.durable,
              problems: {
                ...state.durable.problems,
                [problemId]: {
                  ...problem,
                  response: null,
                  hintsShown: 0,
                  checkResult: null,
                  submitted: false,
                  submissionResult: null,
                },
              },
            },
            requests,
            transient: { responseReady, revealedAnswers },
          };
        });
        return true;
      },
      revealHint: async (identity) => {
        const problemId = scopeAssessmentProblemId(normalizedArtifactId, identity.problemId);
        const registration = get().registrations[problemId];
        if (!registration) return false;
        try {
          assertRegistrationIdentity(registration, {
            ...identity,
            targetId: identity.targetId.trim(),
          });
        } catch {
          return false;
        }
        if (!registration.config.experience.hints) return false;
        const problem = get().durable.problems[problemId] ?? emptyProblem();
        if (problem.hintsShown >= registration.config.hintsTotal) return false;

        if (!assessmentPort?.revealHint) {
          set((state) => ({
            durable: {
              ...state.durable,
              problems: {
                ...state.durable.problems,
                [problemId]: { ...problem, hintsShown: problem.hintsShown + 1 },
              },
            },
          }));
          return true;
        }

        const activeRequest = get().requests[problemId];
        if (activeRequest?.status === "pending" && activeRequest.operation === "reveal-hint") {
          return false;
        }

        const requestId = beginRequest(problemId, "reveal-hint");
        try {
          const outcome = validatedProblemOutcome(
            await assessmentPort.revealHint({
              problemId,
              targetId: registration.targetId,
              interactionKind: registration.interactionKind,
              hintsShown: problem.hintsShown + 1,
            }),
            registration,
          );
          if (get().requests[problemId]?.requestId !== requestId) return false;
          set((state) => {
            if (state.requests[problemId]?.requestId !== requestId) return state;
            const requests = { ...state.requests };
            delete requests[problemId];
            return {
              durable: {
                ...state.durable,
                problems: {
                  ...state.durable.problems,
                  [problemId]: outcome.problem,
                },
              },
              requests,
            };
          });
          return true;
        } catch (error) {
          failCurrentRequest(problemId, requestId, error);
          return false;
        }
      },
      revealAnswer: async (identity) => {
        const problemId = scopeAssessmentProblemId(normalizedArtifactId, identity.problemId);
        const registration = get().registrations[problemId];
        if (!registration) return null;
        try {
          assertRegistrationIdentity(registration, {
            ...identity,
            targetId: identity.targetId.trim(),
          });
        } catch {
          return null;
        }
        if (
          !registration.config.experience.showAnswer ||
          !registration.config.settings.showAnswer
        ) {
          return null;
        }
        const problem = get().durable.problems[problemId];
        if (!problem?.response) return null;

        const requestId = beginRequest(problemId, "reveal-answer");
        if (!assessmentPort?.revealAnswer) {
          failCurrentRequest(problemId, requestId, "Assessment answer reveal is unavailable");
          return null;
        }
        try {
          const reveal = AnswerRevealSchema.parse(
            await assessmentPort.revealAnswer({
              problemId,
              targetId: registration.targetId,
              interactionKind: registration.interactionKind,
              response: problem.response,
            }),
          );
          if (get().requests[problemId]?.requestId !== requestId) return null;
          set((state) => {
            if (state.requests[problemId]?.requestId !== requestId) return state;
            const requests = { ...state.requests };
            delete requests[problemId];
            return {
              requests,
              transient: {
                ...state.transient,
                revealedAnswers: {
                  ...state.transient.revealedAnswers,
                  [problemId]: reveal,
                },
              },
            };
          });
          return reveal;
        } catch (error) {
          failCurrentRequest(problemId, requestId, error);
          return null;
        }
      },
      startQuizAttempt: async (identity) => {
        const groupId = scopeAssessmentGroupId(normalizedArtifactId, identity.groupId);
        const registration = get().quizRegistrations[groupId];
        if (!registration) return null;
        const requestId = beginRequest(groupId, "quiz-start");
        if (!assessmentPort?.quiz) {
          failCurrentRequest(groupId, requestId, "Quiz start is unavailable");
          return null;
        }
        try {
          const outcome = validatedQuizOutcome(
            await assessmentPort.quiz.startAttempt({ groupId }),
            registration,
            get(),
          );
          if (get().requests[groupId]?.requestId !== requestId) return null;
          return commitQuizOutcome(groupId, requestId, outcome, true) ? outcome.quizAttempt : null;
        } catch (error) {
          failCurrentRequest(groupId, requestId, error);
          return null;
        }
      },
      submitQuizQuestion: async (quizIdentity, problemIdentity) => {
        const groupId = scopeAssessmentGroupId(normalizedArtifactId, quizIdentity.groupId);
        const quizRegistration = get().quizRegistrations[groupId];
        const attempt = get().durable.quizzes[groupId];
        if (!quizRegistration || !attempt || attempt.status !== "in_progress") return null;

        const problemId = scopeAssessmentProblemId(normalizedArtifactId, problemIdentity.problemId);
        const problemRegistration = get().registrations[problemId];
        if (!problemRegistration) return null;
        try {
          assertRegistrationIdentity(problemRegistration, {
            ...problemIdentity,
            targetId: problemIdentity.targetId.trim(),
          });
        } catch {
          return null;
        }
        if (!quizRegistration.targetIds.includes(problemRegistration.targetId)) return null;
        if (
          !quizRegistration.settings.allowBacktracking &&
          attempt.currentTargetId !== problemRegistration.targetId
        ) {
          return null;
        }
        const problem = get().durable.problems[problemId];
        if (!problem?.response || !get().transient.responseReady[problemId]) return null;

        const requestId = beginRequest(groupId, "quiz-submit-question");
        if (!assessmentPort?.quiz) {
          failCurrentRequest(groupId, requestId, "Quiz question submission is unavailable");
          return null;
        }
        try {
          const outcome = validatedQuizOutcome(
            await assessmentPort.quiz.submitQuestion({
              attemptId: attempt.attemptId,
              groupId,
              targetId: problemRegistration.targetId,
              response: problem.response,
              expectedAttemptNumber: problem.attemptNumber,
            }),
            quizRegistration,
            get(),
            attempt.attemptId,
          );
          if (get().requests[groupId]?.requestId !== requestId) return null;
          return commitQuizOutcome(groupId, requestId, outcome, true) ? outcome.quizAttempt : null;
        } catch (error) {
          failCurrentRequest(groupId, requestId, error);
          return null;
        }
      },
      finishQuizAttempt: async (identity) => {
        const groupId = scopeAssessmentGroupId(normalizedArtifactId, identity.groupId);
        const registration = get().quizRegistrations[groupId];
        const attempt = get().durable.quizzes[groupId];
        if (!registration || !attempt || attempt.status !== "in_progress") return null;
        const responsesByTargetId = quizResponses(registration);
        if (Object.keys(responsesByTargetId).length !== registration.targetIds.length) return null;

        const requestId = beginRequest(groupId, "quiz-finish");
        if (!assessmentPort?.quiz) {
          failCurrentRequest(groupId, requestId, "Quiz finish is unavailable");
          return null;
        }
        try {
          const outcome = validatedQuizOutcome(
            await assessmentPort.quiz.finishAttempt({
              attemptId: attempt.attemptId,
              groupId,
              responsesByTargetId,
            }),
            registration,
            get(),
            attempt.attemptId,
          );
          if (outcome.quizAttempt.status === "in_progress") {
            throw new Error("Quiz finish must return a terminal attempt");
          }
          if (get().requests[groupId]?.requestId !== requestId) return null;
          return commitQuizOutcome(groupId, requestId, outcome, true) ? outcome.quizAttempt : null;
        } catch (error) {
          failCurrentRequest(groupId, requestId, error);
          return null;
        }
      },
      expireQuizAttempt: async (identity) => {
        const groupId = scopeAssessmentGroupId(normalizedArtifactId, identity.groupId);
        const registration = get().quizRegistrations[groupId];
        const initialAttempt = get().durable.quizzes[groupId];
        if (!registration || !initialAttempt || initialAttempt.status !== "in_progress")
          return null;

        const requestId = beginRequest(groupId, "quiz-expire");
        if (!assessmentPort?.quiz) {
          failCurrentRequest(groupId, requestId, "Quiz expiry is unavailable");
          return null;
        }
        try {
          let currentAttempt = initialAttempt;
          const initialResponses = quizResponses(registration);
          const currentTargetId = initialAttempt.currentTargetId;
          const currentResponse = currentTargetId ? initialResponses[currentTargetId] : undefined;
          if (
            registration.settings.reviewTiming === "after_each_answer" &&
            currentTargetId !== null &&
            currentResponse
          ) {
            const problemRegistration = Object.values(get().registrations).find(
              (candidate) => candidate.targetId === currentTargetId,
            );
            const problem = problemRegistration
              ? get().durable.problems[problemRegistration.problemId]
              : undefined;
            if (!problem) return null;
            const submittedOutcome = validatedQuizOutcome(
              await assessmentPort.quiz.submitQuestion({
                attemptId: initialAttempt.attemptId,
                groupId,
                targetId: currentTargetId,
                response: currentResponse,
                expectedAttemptNumber: problem.attemptNumber,
              }),
              registration,
              get(),
              initialAttempt.attemptId,
            );
            if (get().requests[groupId]?.requestId !== requestId) return null;
            if (!commitQuizOutcome(groupId, requestId, submittedOutcome, false)) {
              return null;
            }
            currentAttempt = submittedOutcome.quizAttempt;
          }

          const expiredOutcome = validatedQuizOutcome(
            await assessmentPort.quiz.finishAttempt({
              attemptId: currentAttempt.attemptId,
              groupId,
              responsesByTargetId: quizResponses(registration),
            }),
            registration,
            get(),
            currentAttempt.attemptId,
          );
          if (expiredOutcome.quizAttempt.status !== "expired") {
            throw new Error("Quiz expiry must return an expired attempt");
          }
          if (get().requests[groupId]?.requestId !== requestId) return null;
          return commitQuizOutcome(groupId, requestId, expiredOutcome, true)
            ? expiredOutcome.quizAttempt
            : null;
        } catch (error) {
          failCurrentRequest(groupId, requestId, error);
          return null;
        }
      },
      revealQuizAnswers: async (identity) => {
        const groupId = scopeAssessmentGroupId(normalizedArtifactId, identity.groupId);
        const registration = get().quizRegistrations[groupId];
        const attempt = get().durable.quizzes[groupId];
        if (
          !registration ||
          !attempt ||
          attempt.status !== "completed" ||
          registration.settings.reviewDetail !== "full_review"
        ) {
          return null;
        }
        const requestId = beginRequest(groupId, "quiz-reveal-answers");
        if (!assessmentPort?.quiz?.revealAnswers) {
          failCurrentRequest(groupId, requestId, "Quiz answer reveal is unavailable");
          return null;
        }
        try {
          const outcome = validatedQuizOutcome(
            await assessmentPort.quiz.revealAnswers({ attemptId: attempt.attemptId, groupId }),
            registration,
            get(),
            attempt.attemptId,
          );
          if (
            outcome.quizAttempt.status !== "completed" ||
            !outcome.quizAttempt.answerReviewAuthorized
          ) {
            throw new Error("Quiz answer reveal must return an authorized completed attempt");
          }
          if (get().requests[groupId]?.requestId !== requestId) return null;
          return commitQuizOutcome(groupId, requestId, outcome, true) ? outcome.quizAttempt : null;
        } catch (error) {
          failCurrentRequest(groupId, requestId, error);
          return null;
        }
      },
    };
  });
}
