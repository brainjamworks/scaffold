import { describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import type {
  AssessmentProblemSnapshot,
  AssessmentResult,
  QuizAssessmentSettings,
  QuizAttemptState,
} from "@scaffold/contracts";
import {
  AssessmentProblemSnapshotSchema,
  AssessmentResultSchema,
  QuizAttemptStateSchema,
} from "@scaffold/contracts";
import type { AssessmentPort } from "../../host/ports/assessment";
import type { XapiPort, XapiStatementDraft } from "../../host/ports/xapi";
import {
  buildAnsweredStatementDraft,
  buildHintInteractedStatementDraft,
  buildQuizCompletedStatementDraft,
  buildQuizSuccessStatementDraft,
  createXapiSession,
  type XapiSession,
} from "../xapi";
import type {
  AssessmentRegistrationIdentity,
  AssessmentRegistrationInput,
  AssessmentRequestState,
  AssessmentQuizRegistrationInput,
} from "./types";
import {
  createAssessmentStore,
  redactQuizResult,
  scopeAssessmentGroupId,
  scopeAssessmentProblemId,
} from "./assessment-store";

const ROOT_ACTIVITY_ID = "https://example.com/courses/course-1";

function createAssessmentPort(overrides: Partial<AssessmentPort> = {}): AssessmentPort {
  return {
    type: "runtime",
    submit: vi.fn(),
    ...overrides,
  };
}

function assessmentResult(overrides: Partial<AssessmentResult> = {}): AssessmentResult {
  return {
    isCorrect: true,
    score: 1,
    maxScore: 1,
    feedback: null,
    items: {},
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushPromises(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}

function createSessionDouble(
  recordImplementation: (statement: XapiStatementDraft) => void = () => undefined,
) {
  const record = vi.fn<(statement: XapiStatementDraft) => void>(recordImplementation);
  const session: XapiSession = Object.freeze({
    rootActivityId: ROOT_ACTIVITY_ID,
    start: vi.fn(),
    record,
    terminate: vi.fn(async () => undefined),
    getState: () => ({ status: "dormant" as const }),
  });
  return { session, record };
}

function createProblemSnapshot(): AssessmentProblemSnapshot {
  return {
    response: { kind: "single-select", optionId: "option-a" },
    attemptNumber: 0,
    hintsShown: 0,
    checkResult: null,
    submitted: false,
    submissionResult: null,
  };
}

function createQuizAttempt(
  groupId: string,
  overrides: Partial<QuizAttemptState> = {},
): QuizAttemptState {
  return QuizAttemptStateSchema.parse({
    attemptId: "attempt-one",
    groupId,
    status: "in_progress",
    currentTargetId: "target-one",
    submittedTargetIds: [],
    startedAt: "2026-07-16T12:00:00.000Z",
    finishedAt: null,
    expiresAt: null,
    score: null,
    maxScore: null,
    successStatus: null,
    resultsByTargetId: {},
    answerReviewAuthorized: false,
    ...overrides,
  });
}

function createRegistration(
  overrides: Partial<AssessmentRegistrationInput> = {},
): AssessmentRegistrationInput {
  return {
    problemId: "block-one",
    targetId: "target-one",
    interactionKind: "single-select",
    response: {
      schema: z.object({ choice: z.string().nullable() }),
      toContractResponse: (response) => ({
        kind: "single-select",
        optionId:
          typeof response === "object" &&
          response !== null &&
          "choice" in response &&
          typeof response.choice === "string"
            ? response.choice
            : null,
      }),
      fromContractResponse: (response) => ({
        choice: response.kind === "single-select" ? response.optionId : null,
      }),
      hasResponse: (response) =>
        typeof response === "object" &&
        response !== null &&
        "choice" in response &&
        typeof response.choice === "string",
    },
    config: {
      experience: {
        submit: true,
        attempts: true,
        hints: true,
        showAnswer: true,
        summaryFeedback: true,
        perItemFeedback: true,
      },
      settings: {
        feedbackMode: "on_submit",
        isGraded: true,
        showAnswer: true,
        points: 1,
        maxAttempts: null,
      },
      hintsTotal: 2,
    },
    ...overrides,
  };
}

function registrationIdentity(
  overrides: Partial<AssessmentRegistrationIdentity> = {},
): AssessmentRegistrationIdentity {
  return {
    problemId: "block-one",
    targetId: "target-one",
    interactionKind: "single-select",
    ...overrides,
  };
}

const quizSettings: QuizAssessmentSettings = {
  allowBacktracking: false,
  reviewTiming: "after_each_answer",
  reviewDetail: "result_only",
  attemptsPerQuestion: 2,
  isGraded: true,
  passingScore: null,
  timer: { enabled: true, durationSeconds: 300 },
};

function createQuizRegistration(
  overrides: Partial<AssessmentQuizRegistrationInput> = {},
): AssessmentQuizRegistrationInput {
  return {
    groupId: "quiz-one",
    targetIds: ["target-one", "target-two"],
    settings: quizSettings,
    ...overrides,
  };
}

describe("createAssessmentStore", () => {
  it("validates and encodes local responses before storing canonical durable state", () => {
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort(),
    });
    const identity = registrationIdentity();
    const problemId = scopeAssessmentProblemId("artifact-one", "block-one");

    store.getState().register(createRegistration());

    expect(store.getState().setLocalResponse(identity, { choice: "option-b" })).toBe(true);
    expect(store.getState().durable.problems[problemId]?.response).toEqual({
      kind: "single-select",
      optionId: "option-b",
    });
    expect(store.getState().setLocalResponse(identity, { choice: 42 })).toBe(false);
    expect(store.getState().durable.problems[problemId]?.response).toEqual({
      kind: "single-select",
      optionId: "option-b",
    });
  });

  it("registers Quiz configuration separately from durable attempt state", () => {
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort(),
    });
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz-one");

    expect(store.getState().registerQuiz(createQuizRegistration({ groupId: " quiz-one " }))).toBe(
      true,
    );
    expect(store.getState().quizRegistrations[groupId]).toEqual({
      groupId,
      authoredGroupId: "quiz-one",
      targetIds: ["target-one", "target-two"],
      settings: quizSettings,
    });
    expect(store.getState().durable.quizzes).toEqual({});

    expect(
      store
        .getState()
        .updateQuiz(
          createQuizRegistration({ settings: { ...quizSettings, allowBacktracking: true } }),
        ),
    ).toBe(true);
    expect(store.getState().quizRegistrations[groupId]?.settings.allowBacktracking).toBe(true);
    expect(store.getState().unregisterQuiz({ groupId: "quiz-one" })).toBe(true);
    expect(store.getState().quizRegistrations).toEqual({});
  });

  it("starts a Quiz through its scoped group identity and commits only a matching host attempt", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz-one");
    const hostAttempt = createQuizAttempt(groupId);
    const startAttempt = vi.fn().mockResolvedValue({
      quizAttempt: hostAttempt,
      problemsByTargetId: {},
    });
    const getXapiSession = vi.fn();
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        quiz: {
          startAttempt,
          submitQuestion: vi.fn(),
          finishAttempt: vi.fn(),
        },
      }),
      getXapiSession,
    });

    store.getState().registerQuiz(createQuizRegistration());

    await expect(store.getState().startQuizAttempt({ groupId: "quiz-one" })).resolves.toEqual(
      hostAttempt,
    );
    expect(startAttempt).toHaveBeenCalledWith({ groupId });
    expect(store.getState().durable.quizzes[groupId]).toEqual(hostAttempt);
    expect(store.getState().requests[groupId]).toBeUndefined();
    expect(getXapiSession).not.toHaveBeenCalled();
  });

  it("preserves historical null success returned by ensure-start", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz-one");
    const terminalAttempt = createQuizAttempt(groupId, {
      status: "completed",
      currentTargetId: null,
      finishedAt: "2026-07-16T12:05:00.000Z",
      score: 1,
      maxScore: 1,
      successStatus: null,
    });
    const getXapiSession = vi.fn();
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        quiz: {
          startAttempt: vi.fn().mockResolvedValue({
            quizAttempt: terminalAttempt,
            problemsByTargetId: {},
          }),
          submitQuestion: vi.fn(),
          finishAttempt: vi.fn(),
        },
      }),
      getXapiSession,
    });
    store.getState().registerQuiz(
      createQuizRegistration({
        settings: { ...quizSettings, passingScore: 0.5 },
      }),
    );

    await expect(store.getState().startQuizAttempt({ groupId: "quiz-one" })).resolves.toEqual(
      terminalAttempt,
    );
    expect(store.getState().durable.quizzes[groupId]).toEqual(terminalAttempt);
    expect(getXapiSession).not.toHaveBeenCalled();
  });

  it("submits a Quiz question with its canonical response and applies authoritative target state", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz-one");
    const result = assessmentResult({ isCorrect: false, score: 0 });
    const canonicalProblem = {
      ...createProblemSnapshot(),
      attemptNumber: 5,
      checkResult: result,
      submitted: true,
      submissionResult: result,
    };
    const submitQuestion = vi.fn().mockResolvedValue({
      quizAttempt: createQuizAttempt(groupId, {
        currentTargetId: "target-two",
        submittedTargetIds: ["target-one"],
        resultsByTargetId: { "target-one": result },
      }),
      problemsByTargetId: { "target-one": canonicalProblem },
    });
    const xapi = createSessionDouble();
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        quiz: {
          startAttempt: vi.fn(),
          submitQuestion,
          finishAttempt: vi.fn(),
        },
      }),
      getXapiSession: () => xapi.session,
    });
    const identity = registrationIdentity();
    const problemId = scopeAssessmentProblemId("artifact-one", "block-one");

    store.getState().register(createRegistration());
    store.getState().registerQuiz(createQuizRegistration());
    store.setState({
      durable: {
        problems: {},
        quizzes: { [groupId]: createQuizAttempt(groupId) },
      },
    });
    store.getState().setLocalResponse(identity, { choice: "option-a" });

    await expect(
      store.getState().submitQuizQuestion({ groupId: "quiz-one" }, identity),
    ).resolves.toMatchObject({ currentTargetId: "target-two" });
    expect(submitQuestion).toHaveBeenCalledWith({
      attemptId: "attempt-one",
      groupId,
      targetId: "target-one",
      response: { kind: "single-select", optionId: "option-a" },
      expectedAttemptNumber: 0,
    });
    expect(store.getState().durable.problems[problemId]).toEqual(canonicalProblem);
    expect(xapi.record).toHaveBeenCalledExactlyOnceWith(
      buildAnsweredStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        targetId: "target-one",
        interactionKind: "single-select",
        result,
        attemptNumber: 5,
        quiz: { quizId: "quiz-one", attemptId: "attempt-one" },
      }),
    );
  });

  it("records a terminal final question as answered, completed, then passed", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz-one");
    const result = assessmentResult({
      feedback: {
        kind: "rich-text",
        document: {
          type: "doc",
          content: [{ type: "text", text: "PRIVATE_FEEDBACK" }],
        },
      },
      items: {
        "private-item": {
          correct: true,
          expected: "PRIVATE_ANSWER",
          given: "PRIVATE_RESPONSE",
        },
      },
    });
    const terminalAttempt = createQuizAttempt(groupId, {
      status: "completed",
      currentTargetId: null,
      submittedTargetIds: ["target-one"],
      finishedAt: "2026-07-16T12:05:00.000Z",
      score: 1,
      maxScore: 1,
      successStatus: "passed",
      resultsByTargetId: { "target-one": result },
    });
    const problem: AssessmentProblemSnapshot = {
      ...createProblemSnapshot(),
      attemptNumber: 1,
      submitted: true,
      submissionResult: result,
    };
    const xapi = createSessionDouble();
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        quiz: {
          startAttempt: vi.fn(),
          submitQuestion: vi.fn().mockResolvedValue({
            quizAttempt: terminalAttempt,
            problemsByTargetId: { "target-one": problem },
          }),
          finishAttempt: vi.fn(),
        },
      }),
      getXapiSession: () => xapi.session,
    });
    const identity = registrationIdentity();

    store.getState().register(createRegistration());
    store.getState().registerQuiz(
      createQuizRegistration({
        targetIds: ["target-one"],
        settings: { ...quizSettings, passingScore: 0.5 },
      }),
    );
    store.setState({
      durable: {
        problems: {},
        quizzes: { [groupId]: createQuizAttempt(groupId) },
      },
    });
    store.getState().setLocalResponse(identity, { choice: "option-a" });

    await expect(
      store.getState().submitQuizQuestion({ groupId: "quiz-one" }, identity),
    ).resolves.toEqual(terminalAttempt);

    expect(xapi.record.mock.calls.map(([draft]) => draft)).toEqual([
      buildAnsweredStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        targetId: "target-one",
        interactionKind: "single-select",
        result,
        attemptNumber: 1,
        quiz: { quizId: "quiz-one", attemptId: "attempt-one" },
      }),
      buildQuizCompletedStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        quizId: "quiz-one",
        attemptId: "attempt-one",
        startedAt: "2026-07-16T12:00:00.000Z",
        finishedAt: "2026-07-16T12:05:00.000Z",
      }),
      buildQuizSuccessStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        quizId: "quiz-one",
        attemptId: "attempt-one",
        successStatus: "passed",
        score: 1,
        maxScore: 1,
      }),
    ]);
    expect(JSON.stringify(xapi.record.mock.calls)).not.toContain("PRIVATE_");
  });

  it("records equal-valued Quiz retries as distinct authoritative attempts", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz-one");
    const result = assessmentResult({ isCorrect: false, score: 0 });
    const submitQuestion = vi
      .fn()
      .mockResolvedValueOnce({
        quizAttempt: createQuizAttempt(groupId),
        problemsByTargetId: {
          "target-one": {
            ...createProblemSnapshot(),
            attemptNumber: 1,
            submitted: true,
            submissionResult: result,
          },
        },
      })
      .mockResolvedValueOnce({
        quizAttempt: createQuizAttempt(groupId),
        problemsByTargetId: {
          "target-one": {
            ...createProblemSnapshot(),
            attemptNumber: 2,
            submitted: true,
            submissionResult: result,
          },
        },
      });
    const xapi = createSessionDouble();
    const getXapiSession = vi.fn(() => xapi.session);
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        quiz: {
          startAttempt: vi.fn(),
          submitQuestion,
          finishAttempt: vi.fn(),
        },
      }),
      getXapiSession,
    });
    const identity = registrationIdentity();

    store.getState().register(createRegistration());
    store.getState().registerQuiz(createQuizRegistration());
    store.setState({
      durable: {
        problems: {},
        quizzes: { [groupId]: createQuizAttempt(groupId) },
      },
    });
    store.getState().setLocalResponse(identity, { choice: "option-a" });

    await store.getState().submitQuizQuestion({ groupId: "quiz-one" }, identity);
    await store.getState().submitQuizQuestion({ groupId: "quiz-one" }, identity);

    expect(submitQuestion).toHaveBeenNthCalledWith(2, {
      attemptId: "attempt-one",
      groupId,
      targetId: "target-one",
      response: { kind: "single-select", optionId: "option-a" },
      expectedAttemptNumber: 1,
    });
    expect(xapi.record.mock.calls.map(([draft]) => draft)).toEqual(
      [1, 2].map((attemptNumber) =>
        buildAnsweredStatementDraft({
          rootActivityId: ROOT_ACTIVITY_ID,
          targetId: "target-one",
          interactionKind: "single-select",
          result,
          attemptNumber,
          quiz: { quizId: "quiz-one", attemptId: "attempt-one" },
        }),
      ),
    );
    expect(getXapiSession).toHaveBeenCalledTimes(2);
  });

  it("does not record unchanged, lower, or redacted Quiz problem attempts", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz-one");
    const result = assessmentResult();
    const submitQuestion = vi
      .fn()
      .mockResolvedValueOnce({
        quizAttempt: createQuizAttempt(groupId),
        problemsByTargetId: {
          "target-one": {
            ...createProblemSnapshot(),
            attemptNumber: 2,
            submitted: true,
            submissionResult: result,
          },
        },
      })
      .mockResolvedValueOnce({
        quizAttempt: createQuizAttempt(groupId),
        problemsByTargetId: {
          "target-one": {
            ...createProblemSnapshot(),
            attemptNumber: 1,
            submitted: true,
            submissionResult: result,
          },
        },
      })
      .mockResolvedValueOnce({
        quizAttempt: createQuizAttempt(groupId),
        problemsByTargetId: {
          "target-one": {
            ...createProblemSnapshot(),
            attemptNumber: 2,
            submissionResult: null,
          },
        },
      });
    const xapi = createSessionDouble();
    const getXapiSession = vi.fn(() => xapi.session);
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        quiz: {
          startAttempt: vi.fn(),
          submitQuestion,
          finishAttempt: vi.fn(),
        },
      }),
      getXapiSession,
    });
    const identity = registrationIdentity();
    const problemId = scopeAssessmentProblemId("artifact-one", "block-one");

    store.getState().register(createRegistration());
    store.getState().registerQuiz(createQuizRegistration());
    store.setState({
      durable: {
        problems: {
          [problemId]: {
            ...createProblemSnapshot(),
            attemptNumber: 2,
            submitted: true,
            submissionResult: result,
          },
        },
        quizzes: { [groupId]: createQuizAttempt(groupId) },
      },
      transient: {
        responseReady: { [problemId]: true },
        revealedAnswers: {},
      },
    });

    await store.getState().submitQuizQuestion({ groupId: "quiz-one" }, identity);
    await store.getState().submitQuizQuestion({ groupId: "quiz-one" }, identity);
    await store.getState().submitQuizQuestion({ groupId: "quiz-one" }, identity);

    expect(submitQuestion).toHaveBeenCalledTimes(3);
    expect(store.getState().durable.problems[problemId]).toMatchObject({
      attemptNumber: 2,
      submitted: false,
      submissionResult: null,
    });
    expect(xapi.record).not.toHaveBeenCalled();
    expect(getXapiSession).not.toHaveBeenCalled();
  });

  it("records explicit-finish answers before completion and authoritative success", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz-one");
    const firstResult = assessmentResult();
    const secondResult = assessmentResult({ isCorrect: false, score: 0 });
    const canonicalFirstProblem = {
      ...createProblemSnapshot(),
      attemptNumber: 7,
      submitted: true,
      submissionResult: firstResult,
    };
    const canonicalSecondProblem = {
      ...createProblemSnapshot(),
      response: { kind: "single-select" as const, optionId: "option-b" },
      attemptNumber: 8,
      submitted: true,
      submissionResult: secondResult,
    };
    const finishAttempt = vi.fn().mockResolvedValue({
      quizAttempt: createQuizAttempt(groupId, {
        status: "completed",
        currentTargetId: null,
        submittedTargetIds: ["target-one", "target-two"],
        finishedAt: "2026-07-16T12:05:00.000Z",
        score: 2,
        maxScore: 2,
        successStatus: "passed",
        resultsByTargetId: {
          "target-one": firstResult,
          "target-two": secondResult,
        },
      }),
      problemsByTargetId: {
        "target-two": canonicalSecondProblem,
        "target-one": canonicalFirstProblem,
      },
    });
    const xapi = createSessionDouble(() => {
      throw new Error("recording unavailable");
    });
    const getXapiSession = vi.fn(() => xapi.session);
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        quiz: { startAttempt: vi.fn(), submitQuestion: vi.fn(), finishAttempt },
      }),
      getXapiSession,
    });
    const secondIdentity = registrationIdentity({
      problemId: "block-two",
      targetId: "target-two",
    });

    store.getState().register(createRegistration());
    store
      .getState()
      .register(createRegistration({ problemId: "block-two", targetId: "target-two" }));
    store.getState().registerQuiz(
      createQuizRegistration({
        settings: { ...quizSettings, passingScore: 0.5 },
      }),
    );
    store.setState({
      durable: { problems: {}, quizzes: { [groupId]: createQuizAttempt(groupId) } },
    });
    store.getState().setLocalResponse(registrationIdentity(), { choice: "option-a" });
    await expect(store.getState().finishQuizAttempt({ groupId: "quiz-one" })).resolves.toBeNull();
    expect(finishAttempt).not.toHaveBeenCalled();

    store.getState().setLocalResponse(secondIdentity, { choice: "option-b" });
    await expect(
      store.getState().finishQuizAttempt({ groupId: "quiz-one" }),
    ).resolves.toMatchObject({ status: "completed", score: 2, maxScore: 2 });
    expect(finishAttempt).toHaveBeenCalledWith({
      attemptId: "attempt-one",
      groupId,
      responsesByTargetId: {
        "target-one": { kind: "single-select", optionId: "option-a" },
        "target-two": { kind: "single-select", optionId: "option-b" },
      },
    });
    expect(
      store.getState().durable.problems[scopeAssessmentProblemId("artifact-one", "block-one")],
    ).toEqual(canonicalFirstProblem);
    expect(
      store.getState().durable.problems[scopeAssessmentProblemId("artifact-one", "block-two")],
    ).toEqual(canonicalSecondProblem);
    expect(getXapiSession).toHaveBeenCalledOnce();
    expect(xapi.record.mock.calls.map(([draft]) => draft)).toEqual([
      buildAnsweredStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        targetId: "target-one",
        interactionKind: "single-select",
        result: firstResult,
        attemptNumber: 7,
        quiz: { quizId: "quiz-one", attemptId: "attempt-one" },
      }),
      buildAnsweredStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        targetId: "target-two",
        interactionKind: "single-select",
        result: secondResult,
        attemptNumber: 8,
        quiz: { quizId: "quiz-one", attemptId: "attempt-one" },
      }),
      buildQuizCompletedStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        quizId: "quiz-one",
        attemptId: "attempt-one",
        startedAt: "2026-07-16T12:00:00.000Z",
        finishedAt: "2026-07-16T12:05:00.000Z",
      }),
      buildQuizSuccessStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        quizId: "quiz-one",
        attemptId: "attempt-one",
        successStatus: "passed",
        score: 2,
        maxScore: 2,
      }),
    ]);
    expect(store.getState().durable.quizzes[groupId]).toMatchObject({
      status: "completed",
      successStatus: "passed",
    });
    expect(store.getState().requests[groupId]).toBeUndefined();
    await expect(store.getState().finishQuizAttempt({ groupId: "quiz-one" })).resolves.toBeNull();
    expect(xapi.record).toHaveBeenCalledTimes(4);
  });

  it.each([
    {
      name: "failed success",
      passingScore: 0.75,
      score: 1,
      maxScore: 2,
      successStatus: "failed" as const,
    },
    {
      name: "completion without a threshold",
      passingScore: null,
      score: 1,
      maxScore: 2,
      successStatus: null,
    },
  ])("records explicit-finish $name from authoritative state", async (testCase) => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz-one");
    const terminalAttempt = createQuizAttempt(groupId, {
      status: "completed",
      currentTargetId: null,
      submittedTargetIds: ["target-one"],
      finishedAt: "2026-07-16T12:05:00.000Z",
      score: testCase.score,
      maxScore: testCase.maxScore,
      successStatus: testCase.successStatus,
      resultsByTargetId: { "target-one": assessmentResult() },
    });
    const finishAttempt = vi.fn().mockResolvedValue({
      quizAttempt: terminalAttempt,
      problemsByTargetId: {},
    });
    const xapi = createSessionDouble();
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        quiz: { startAttempt: vi.fn(), submitQuestion: vi.fn(), finishAttempt },
      }),
      getXapiSession: () => xapi.session,
    });

    store.getState().register(createRegistration());
    store.getState().registerQuiz(
      createQuizRegistration({
        targetIds: ["target-one"],
        settings: {
          ...quizSettings,
          reviewTiming: "after_quiz",
          passingScore: testCase.passingScore,
        },
      }),
    );
    store.setState({
      durable: {
        problems: {},
        quizzes: { [groupId]: createQuizAttempt(groupId) },
      },
    });
    store.getState().setLocalResponse(registrationIdentity(), { choice: "option-a" });

    await expect(store.getState().finishQuizAttempt({ groupId: "quiz-one" })).resolves.toEqual(
      terminalAttempt,
    );

    const expectedDrafts: XapiStatementDraft[] = [
      buildQuizCompletedStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        quizId: "quiz-one",
        attemptId: "attempt-one",
        startedAt: "2026-07-16T12:00:00.000Z",
        finishedAt: "2026-07-16T12:05:00.000Z",
      }),
    ];
    if (testCase.successStatus !== null) {
      expectedDrafts.push(
        buildQuizSuccessStatementDraft({
          rootActivityId: ROOT_ACTIVITY_ID,
          quizId: "quiz-one",
          attemptId: "attempt-one",
          successStatus: testCase.successStatus,
          score: testCase.score,
          maxScore: testCase.maxScore,
        }),
      );
    }
    expect(xapi.record.mock.calls.map(([draft]) => draft)).toEqual(expectedDrafts);
    expect(store.getState().durable.quizzes[groupId]).toEqual(terminalAttempt);

    await expect(store.getState().finishQuizAttempt({ groupId: "quiz-one" })).resolves.toBeNull();
    expect(xapi.record).toHaveBeenCalledTimes(expectedDrafts.length);
  });

  it.each(["throwing accessor", "invalid builder root"] as const)(
    "retains terminal authority with a %s",
    async (failureMode) => {
      const groupId = scopeAssessmentGroupId("artifact-one", "quiz-one");
      const terminalAttempt = createQuizAttempt(groupId, {
        status: "completed",
        currentTargetId: null,
        submittedTargetIds: ["target-one"],
        finishedAt: "2026-07-16T12:05:00.000Z",
        score: 1,
        maxScore: 1,
        successStatus: "passed",
        resultsByTargetId: { "target-one": assessmentResult() },
      });
      const record = vi.fn<(statement: XapiStatementDraft) => void>();
      const invalidSession: XapiSession = Object.freeze({
        ...createSessionDouble().session,
        rootActivityId: "not-an-absolute-iri",
        record,
      });
      const getXapiSession: () => XapiSession | null =
        failureMode === "throwing accessor"
          ? () => {
              throw new Error("session unavailable");
            }
          : () => invalidSession;
      const store = createAssessmentStore({
        artifactId: "artifact-one",
        assessmentPort: createAssessmentPort({
          quiz: {
            startAttempt: vi.fn(),
            submitQuestion: vi.fn(),
            finishAttempt: vi.fn().mockResolvedValue({
              quizAttempt: terminalAttempt,
              problemsByTargetId: {},
            }),
          },
        }),
        getXapiSession,
      });

      store.getState().register(createRegistration());
      store.getState().registerQuiz(
        createQuizRegistration({
          targetIds: ["target-one"],
          settings: { ...quizSettings, reviewTiming: "after_quiz", passingScore: 0.5 },
        }),
      );
      store.setState({
        durable: {
          problems: {},
          quizzes: { [groupId]: createQuizAttempt(groupId) },
        },
      });
      store.getState().setLocalResponse(registrationIdentity(), { choice: "option-a" });

      await expect(store.getState().finishQuizAttempt({ groupId: "quiz-one" })).resolves.toEqual(
        terminalAttempt,
      );

      expect(store.getState().durable.quizzes[groupId]).toEqual(terminalAttempt);
      expect(store.getState().requests[groupId]).toBeUndefined();
      expect(record).not.toHaveBeenCalled();
    },
  );

  it("retains terminal authority when a real xAPI session enters delivery-failed state", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz-one");
    const terminalAttempt = createQuizAttempt(groupId, {
      status: "completed",
      currentTargetId: null,
      submittedTargetIds: ["target-one"],
      finishedAt: "2026-07-16T12:05:00.000Z",
      score: 1,
      maxScore: 1,
      successStatus: "passed",
      resultsByTargetId: { "target-one": assessmentResult() },
    });
    const send = vi.fn<XapiPort["send"]>(async () => {
      throw new Error("delivery unavailable");
    });
    let uuidSequence = 0;
    const session = createXapiSession({
      port: { activityId: ROOT_ACTIVITY_ID, send },
      courseTitle: "Course One",
      createUuid: () => {
        uuidSequence += 1;
        return `00000000-0000-4000-8000-${uuidSequence.toString(16).padStart(12, "0")}`;
      },
      now: () => new Date("2026-07-16T12:05:00.000Z"),
      monotonicNow: () => 1_000,
    });
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        quiz: {
          startAttempt: vi.fn(),
          submitQuestion: vi.fn(),
          finishAttempt: vi.fn().mockResolvedValue({
            quizAttempt: terminalAttempt,
            problemsByTargetId: {},
          }),
        },
      }),
      getXapiSession: () => session,
    });

    store.getState().register(createRegistration());
    store.getState().registerQuiz(
      createQuizRegistration({
        targetIds: ["target-one"],
        settings: { ...quizSettings, reviewTiming: "after_quiz", passingScore: 0.5 },
      }),
    );
    store.setState({
      durable: {
        problems: {},
        quizzes: { [groupId]: createQuizAttempt(groupId) },
      },
    });
    store.getState().setLocalResponse(registrationIdentity(), { choice: "option-a" });

    await expect(store.getState().finishQuizAttempt({ groupId: "quiz-one" })).resolves.toEqual(
      terminalAttempt,
    );
    await flushPromises();

    expect(send).toHaveBeenCalledOnce();
    expect(session.getState()).toMatchObject({ status: "active", delivery: "failed" });
    expect(store.getState().durable.quizzes[groupId]).toEqual(terminalAttempt);
    expect(store.getState().requests[groupId]).toBeUndefined();
  });

  it("rejects a still-in-progress explicit-finish response without recording", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz-one");
    const getXapiSession = vi.fn();
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        quiz: {
          startAttempt: vi.fn(),
          submitQuestion: vi.fn(),
          finishAttempt: vi.fn().mockResolvedValue({
            quizAttempt: createQuizAttempt(groupId),
            problemsByTargetId: {},
          }),
        },
      }),
      getXapiSession,
    });

    store.getState().register(createRegistration());
    store.getState().registerQuiz(createQuizRegistration({ targetIds: ["target-one"] }));
    store.setState({
      durable: {
        problems: {},
        quizzes: { [groupId]: createQuizAttempt(groupId) },
      },
    });
    store.getState().setLocalResponse(registrationIdentity(), { choice: "option-a" });

    await expect(store.getState().finishQuizAttempt({ groupId: "quiz-one" })).resolves.toBeNull();

    expect(store.getState().durable.quizzes[groupId]?.status).toBe("in_progress");
    expect(store.getState().requests[groupId]).toMatchObject({
      operation: "quiz-finish",
      status: "error",
      error: "Quiz finish must return a terminal attempt",
    });
    expect(getXapiSession).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "score above maximum",
      passingScore: 0.5,
      score: 2,
      maxScore: 1,
      successStatus: "passed" as const,
      error: "Quiz host response score exceeds maxScore",
    },
    {
      name: "success disagreeing with threshold",
      passingScore: 0.75,
      score: 1,
      maxScore: 2,
      successStatus: "passed" as const,
      error: "Quiz host response successStatus does not match passingScore",
    },
    {
      name: "missing success on a new terminal transition",
      passingScore: 0.75,
      score: 1,
      maxScore: 2,
      successStatus: null,
      error: "Quiz host response newly terminal successStatus is required",
    },
    {
      name: "success without a pass criterion",
      passingScore: null,
      score: 1,
      maxScore: 2,
      successStatus: "passed" as const,
      error: "Quiz host response successStatus requires passingScore",
    },
  ])("rejects a newly terminal Quiz with $name without committing", async (testCase) => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz-one");
    const current = createQuizAttempt(groupId);
    const terminal = createQuizAttempt(groupId, {
      status: "completed",
      currentTargetId: null,
      submittedTargetIds: ["target-one", "target-two"],
      finishedAt: "2026-07-16T12:05:00.000Z",
      score: testCase.score,
      maxScore: testCase.maxScore,
      successStatus: testCase.successStatus,
      resultsByTargetId: {
        "target-one": assessmentResult(),
        "target-two": assessmentResult(),
      },
    });
    const getXapiSession = vi.fn();
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        quiz: {
          startAttempt: vi.fn(),
          submitQuestion: vi.fn(),
          finishAttempt: vi.fn().mockResolvedValue({
            quizAttempt: terminal,
            problemsByTargetId: {},
          }),
        },
      }),
      getXapiSession,
    });
    const secondIdentity = registrationIdentity({
      problemId: "block-two",
      targetId: "target-two",
    });
    store.getState().register(createRegistration());
    store
      .getState()
      .register(createRegistration({ problemId: "block-two", targetId: "target-two" }));
    store.getState().registerQuiz(
      createQuizRegistration({
        settings: {
          ...quizSettings,
          passingScore: testCase.passingScore,
        },
      }),
    );
    store.setState({
      durable: { problems: {}, quizzes: { [groupId]: current } },
    });
    store.getState().setLocalResponse(registrationIdentity(), { choice: "option-a" });
    store.getState().setLocalResponse(secondIdentity, { choice: "option-b" });

    await expect(store.getState().finishQuizAttempt({ groupId: "quiz-one" })).resolves.toBeNull();

    expect(store.getState().durable.quizzes[groupId]).toEqual(current);
    expect(store.getState().requests[groupId]).toMatchObject({
      operation: "quiz-finish",
      status: "error",
      error: testCase.error,
    });
    expect(getXapiSession).not.toHaveBeenCalled();
  });

  it("does not create a false terminal Quiz state when expiry finalization rejects", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz-one");
    const finishAttempt = vi.fn().mockRejectedValue(new Error("timeout persistence failed"));
    const getXapiSession = vi.fn();
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        quiz: { startAttempt: vi.fn(), submitQuestion: vi.fn(), finishAttempt },
      }),
      getXapiSession,
    });

    store.getState().register(createRegistration());
    store.getState().registerQuiz(
      createQuizRegistration({
        targetIds: ["target-one"],
        settings: { ...quizSettings, reviewTiming: "after_quiz" },
      }),
    );
    store.setState({
      durable: { problems: {}, quizzes: { [groupId]: createQuizAttempt(groupId) } },
    });
    store.getState().setLocalResponse(registrationIdentity(), { choice: "option-a" });

    await expect(store.getState().expireQuizAttempt({ groupId: "quiz-one" })).resolves.toBeNull();
    expect(store.getState().durable.quizzes[groupId]?.status).toBe("in_progress");
    expect(store.getState().requests[groupId]).toMatchObject({
      operation: "quiz-expire",
      status: "error",
      error: "timeout persistence failed",
    });
    expect(getXapiSession).not.toHaveBeenCalled();
  });

  it("reveals completed full-review Quiz answers only from authoritative host state", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz-one");
    const revealedAttempt = createQuizAttempt(groupId, {
      status: "completed",
      currentTargetId: null,
      submittedTargetIds: ["target-one"],
      finishedAt: "2026-07-16T12:05:00.000Z",
      score: 1,
      maxScore: 1,
      resultsByTargetId: { "target-one": assessmentResult() },
      answerReviewAuthorized: true,
    });
    const revealAnswers = vi.fn().mockResolvedValue({
      quizAttempt: revealedAttempt,
      problemsByTargetId: {},
    });
    const getXapiSession = vi.fn();
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        quiz: {
          startAttempt: vi.fn(),
          submitQuestion: vi.fn(),
          finishAttempt: vi.fn(),
          revealAnswers,
        },
      }),
      getXapiSession,
    });

    store.getState().register(createRegistration());
    store.getState().registerQuiz(
      createQuizRegistration({
        targetIds: ["target-one"],
        settings: { ...quizSettings, reviewDetail: "full_review" },
      }),
    );
    store.setState({
      durable: {
        problems: {},
        quizzes: {
          [groupId]: createQuizAttempt(groupId, {
            status: "completed",
            currentTargetId: null,
            finishedAt: "2026-07-16T12:04:00.000Z",
            score: 1,
            maxScore: 1,
          }),
        },
      },
    });

    await expect(store.getState().revealQuizAnswers({ groupId: "quiz-one" })).resolves.toEqual(
      revealedAttempt,
    );
    expect(revealAnswers).toHaveBeenCalledWith({ attemptId: "attempt-one", groupId });
    expect(store.getState().durable.quizzes[groupId]).toEqual(revealedAttempt);
    expect(getXapiSession).not.toHaveBeenCalled();
  });

  it("prevents binary item answers from being reconstructed in result-only review", () => {
    const result = assessmentResult({
      isCorrect: false,
      score: 0.5,
      items: {
        "multi-select-option": {
          correct: false,
          given: false,
          expected: true,
        },
        "hotspot-region": {
          correct: true,
          given: true,
          expected: true,
        },
      },
    });

    expect(redactQuizResult(result, "none", true)).toBeNull();
    expect(redactQuizResult(result, "result_only", false)).toBeNull();

    const resultOnly = redactQuizResult(result, "result_only", true);
    expect(AssessmentResultSchema.parse(resultOnly)).toEqual({
      isCorrect: false,
      score: 0.5,
      maxScore: 1,
      feedback: null,
      items: {},
    });

    const fullReview = redactQuizResult(result, "full_review", true);
    expect(AssessmentResultSchema.parse(fullReview)).toEqual(result);
  });

  it("rejects a host attempt for another group without changing durable Quiz state", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz-one");
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        quiz: {
          startAttempt: vi.fn().mockResolvedValue({
            quizAttempt: createQuizAttempt("another-group"),
            problemsByTargetId: {},
          }),
          submitQuestion: vi.fn(),
          finishAttempt: vi.fn(),
        },
      }),
    });
    store.getState().registerQuiz(createQuizRegistration());

    await expect(store.getState().startQuizAttempt({ groupId: "quiz-one" })).resolves.toBeNull();
    expect(store.getState().durable.quizzes).toEqual({});
    expect(store.getState().requests[groupId]).toMatchObject({
      operation: "quiz-start",
      status: "error",
      error: "Quiz host response groupId does not match the registered group",
    });
  });

  it("preserves Quiz attempt and problem state when question submission rejects", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz-one");
    const attempt = createQuizAttempt(groupId);
    const getXapiSession = vi.fn();
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        quiz: {
          startAttempt: vi.fn(),
          submitQuestion: vi.fn().mockRejectedValue(new Error("question rejected")),
          finishAttempt: vi.fn(),
        },
      }),
      getXapiSession,
    });
    const problemId = scopeAssessmentProblemId("artifact-one", "block-one");
    store.getState().register(createRegistration());
    store.getState().registerQuiz(createQuizRegistration());
    store.setState({ durable: { problems: {}, quizzes: { [groupId]: attempt } } });
    store.getState().setLocalResponse(registrationIdentity(), { choice: "option-a" });

    await expect(
      store.getState().submitQuizQuestion({ groupId: "quiz-one" }, registrationIdentity()),
    ).resolves.toBeNull();
    expect(store.getState().durable.quizzes[groupId]).toEqual(attempt);
    expect(store.getState().durable.problems[problemId]).toMatchObject({
      response: { kind: "single-select", optionId: "option-a" },
      attemptNumber: 0,
      submitted: false,
      submissionResult: null,
    });
    expect(getXapiSession).not.toHaveBeenCalled();
  });

  it("rejects a Quiz question response for another host attempt", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz-one");
    const current = createQuizAttempt(groupId);
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        quiz: {
          startAttempt: vi.fn(),
          submitQuestion: vi.fn().mockResolvedValue({
            quizAttempt: createQuizAttempt(groupId, { attemptId: "attempt-two" }),
            problemsByTargetId: {},
          }),
          finishAttempt: vi.fn(),
        },
      }),
    });
    store.getState().register(createRegistration());
    store.getState().registerQuiz(createQuizRegistration());
    store.setState({ durable: { problems: {}, quizzes: { [groupId]: current } } });
    store.getState().setLocalResponse(registrationIdentity(), { choice: "option-a" });

    await expect(
      store.getState().submitQuizQuestion({ groupId: "quiz-one" }, registrationIdentity()),
    ).resolves.toBeNull();
    expect(store.getState().durable.quizzes[groupId]).toEqual(current);
    expect(store.getState().requests[groupId]).toMatchObject({
      status: "error",
      error: "Quiz host response attemptId does not match the current attempt",
    });
  });

  it("does not replay a stale terminal Quiz response after a newer terminal commit", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz-one");
    const stale = deferred<{
      quizAttempt: QuizAttemptState;
      problemsByTargetId: Record<string, AssessmentProblemSnapshot>;
    }>();
    const result = assessmentResult();
    const staleProblem: AssessmentProblemSnapshot = {
      ...createProblemSnapshot(),
      attemptNumber: 1,
      submitted: true,
      submissionResult: result,
    };
    const currentProblem: AssessmentProblemSnapshot = {
      ...createProblemSnapshot(),
      attemptNumber: 2,
      submitted: true,
      submissionResult: result,
    };
    const terminalAttempt = createQuizAttempt(groupId, {
      status: "completed",
      currentTargetId: null,
      submittedTargetIds: ["target-one"],
      finishedAt: "2026-07-16T12:05:00.000Z",
      score: 1,
      maxScore: 1,
      successStatus: "passed",
      resultsByTargetId: { "target-one": result },
    });
    const submitQuestion = vi
      .fn()
      .mockImplementationOnce(() => stale.promise)
      .mockResolvedValueOnce({
        quizAttempt: terminalAttempt,
        problemsByTargetId: { "target-one": currentProblem },
      });
    const xapi = createSessionDouble();
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        quiz: {
          startAttempt: vi.fn(),
          submitQuestion,
          finishAttempt: vi.fn(),
        },
      }),
      getXapiSession: () => xapi.session,
    });
    const identity = registrationIdentity();

    store.getState().register(createRegistration());
    store.getState().registerQuiz(
      createQuizRegistration({
        targetIds: ["target-one"],
        settings: { ...quizSettings, passingScore: 0.5 },
      }),
    );
    store.setState({
      durable: {
        problems: {},
        quizzes: { [groupId]: createQuizAttempt(groupId) },
      },
    });
    store.getState().setLocalResponse(identity, { choice: "option-a" });

    const staleSubmission = store.getState().submitQuizQuestion({ groupId: "quiz-one" }, identity);
    await expect(
      store.getState().submitQuizQuestion({ groupId: "quiz-one" }, identity),
    ).resolves.toEqual(terminalAttempt);
    stale.resolve({
      quizAttempt: terminalAttempt,
      problemsByTargetId: { "target-one": staleProblem },
    });
    await expect(staleSubmission).resolves.toBeNull();

    expect(xapi.record.mock.calls.map(([draft]) => draft)).toEqual([
      buildAnsweredStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        targetId: "target-one",
        interactionKind: "single-select",
        result,
        attemptNumber: 2,
        quiz: { quizId: "quiz-one", attemptId: "attempt-one" },
      }),
      buildQuizCompletedStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        quizId: "quiz-one",
        attemptId: "attempt-one",
        startedAt: "2026-07-16T12:00:00.000Z",
        finishedAt: "2026-07-16T12:05:00.000Z",
      }),
      buildQuizSuccessStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        quizId: "quiz-one",
        attemptId: "attempt-one",
        successStatus: "passed",
        score: 1,
        maxScore: 1,
      }),
    ]);
  });

  it("preserves the in-progress Quiz when explicit finish rejects", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz-one");
    const current = createQuizAttempt(groupId);
    const getXapiSession = vi.fn();
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        quiz: {
          startAttempt: vi.fn(),
          submitQuestion: vi.fn(),
          finishAttempt: vi.fn().mockRejectedValue(new Error("finish rejected")),
        },
      }),
      getXapiSession,
    });
    const secondIdentity = registrationIdentity({
      problemId: "block-two",
      targetId: "target-two",
    });
    store.getState().register(createRegistration());
    store
      .getState()
      .register(createRegistration({ problemId: "block-two", targetId: "target-two" }));
    store.getState().registerQuiz(createQuizRegistration());
    store.setState({ durable: { problems: {}, quizzes: { [groupId]: current } } });
    store.getState().setLocalResponse(registrationIdentity(), { choice: "option-a" });
    store.getState().setLocalResponse(secondIdentity, { choice: "option-b" });

    await expect(store.getState().finishQuizAttempt({ groupId: "quiz-one" })).resolves.toBeNull();
    expect(store.getState().durable.quizzes[groupId]).toEqual(current);
    expect(store.getState().requests[groupId]).toMatchObject({
      operation: "quiz-finish",
      status: "error",
      error: "finish rejected",
    });
    expect(getXapiSession).not.toHaveBeenCalled();
  });

  it("records authoritative failed success for an expired attempt", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz-one");
    const result = assessmentResult({ isCorrect: false, score: 0 });
    const expired = createQuizAttempt(groupId, {
      status: "expired",
      currentTargetId: null,
      submittedTargetIds: ["target-one"],
      finishedAt: "2026-07-16T12:05:00.000Z",
      score: 0,
      maxScore: 1,
      successStatus: "failed",
      resultsByTargetId: { "target-one": result },
    });
    const finishAttempt = vi.fn().mockResolvedValue({
      quizAttempt: expired,
      problemsByTargetId: {},
    });
    const xapi = createSessionDouble();
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        quiz: { startAttempt: vi.fn(), submitQuestion: vi.fn(), finishAttempt },
      }),
      getXapiSession: () => xapi.session,
    });
    store.getState().register(createRegistration());
    store.getState().registerQuiz(
      createQuizRegistration({
        targetIds: ["target-one"],
        settings: { ...quizSettings, reviewTiming: "after_quiz", passingScore: 0.5 },
      }),
    );
    store.setState({
      durable: { problems: {}, quizzes: { [groupId]: createQuizAttempt(groupId) } },
    });
    store.getState().setLocalResponse(registrationIdentity(), { choice: "option-a" });

    await expect(store.getState().expireQuizAttempt({ groupId: "quiz-one" })).resolves.toEqual(
      expired,
    );
    expect(finishAttempt).toHaveBeenCalledWith({
      attemptId: "attempt-one",
      groupId,
      responsesByTargetId: {
        "target-one": { kind: "single-select", optionId: "option-a" },
      },
    });
    expect(store.getState().durable.quizzes[groupId]).toEqual(expired);
    expect(xapi.record.mock.calls.map(([draft]) => draft)).toEqual([
      buildQuizCompletedStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        quizId: "quiz-one",
        attemptId: "attempt-one",
        startedAt: "2026-07-16T12:00:00.000Z",
        finishedAt: "2026-07-16T12:05:00.000Z",
      }),
      buildQuizSuccessStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        quizId: "quiz-one",
        attemptId: "attempt-one",
        successStatus: "failed",
        score: 0,
        maxScore: 1,
      }),
    ]);
  });

  it("records timer-expiry's intermediate answer once before completion", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz-one");
    const result = assessmentResult();
    const problem = {
      ...createProblemSnapshot(),
      attemptNumber: 1,
      submitted: true,
      submissionResult: result,
    };
    const submittedAttempt = createQuizAttempt(groupId, {
      currentTargetId: null,
      submittedTargetIds: ["target-one"],
      resultsByTargetId: { "target-one": result },
    });
    const expiredAttempt = createQuizAttempt(groupId, {
      status: "expired",
      currentTargetId: null,
      submittedTargetIds: ["target-one"],
      finishedAt: "2026-07-16T12:05:00.000Z",
      score: 1,
      maxScore: 1,
      resultsByTargetId: { "target-one": result },
    });
    const submitQuestion = vi.fn().mockResolvedValue({
      quizAttempt: submittedAttempt,
      problemsByTargetId: { "target-one": problem },
    });
    const finishAttempt = vi.fn().mockResolvedValue({
      quizAttempt: expiredAttempt,
      problemsByTargetId: { "target-one": problem },
    });
    const xapi = createSessionDouble();
    const getXapiSession = vi.fn(() => xapi.session);
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        quiz: { startAttempt: vi.fn(), submitQuestion, finishAttempt },
      }),
      getXapiSession,
    });

    store.getState().register(createRegistration());
    store.getState().registerQuiz(
      createQuizRegistration({
        targetIds: ["target-one"],
      }),
    );
    store.setState({
      durable: {
        problems: {},
        quizzes: { [groupId]: createQuizAttempt(groupId) },
      },
    });
    store.getState().setLocalResponse(registrationIdentity(), { choice: "option-a" });

    await expect(store.getState().expireQuizAttempt({ groupId: "quiz-one" })).resolves.toEqual(
      expiredAttempt,
    );

    expect(submitQuestion).toHaveBeenCalledOnce();
    expect(finishAttempt).toHaveBeenCalledOnce();
    expect(getXapiSession).toHaveBeenCalledTimes(2);
    expect(xapi.record.mock.calls.map(([draft]) => draft)).toEqual([
      buildAnsweredStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        targetId: "target-one",
        interactionKind: "single-select",
        result,
        attemptNumber: 1,
        quiz: { quizId: "quiz-one", attemptId: "attempt-one" },
      }),
      buildQuizCompletedStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        quizId: "quiz-one",
        attemptId: "attempt-one",
        startedAt: "2026-07-16T12:00:00.000Z",
        finishedAt: "2026-07-16T12:05:00.000Z",
      }),
    ]);
  });

  it("preserves a completed Quiz when answer reveal rejects", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz-one");
    const completed = createQuizAttempt(groupId, {
      status: "completed",
      currentTargetId: null,
      finishedAt: "2026-07-16T12:05:00.000Z",
      score: 0,
      maxScore: 1,
    });
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        quiz: {
          startAttempt: vi.fn(),
          submitQuestion: vi.fn(),
          finishAttempt: vi.fn(),
          revealAnswers: vi.fn().mockRejectedValue(new Error("review denied")),
        },
      }),
    });
    store.getState().registerQuiz(
      createQuizRegistration({
        targetIds: ["target-one"],
        settings: { ...quizSettings, reviewDetail: "full_review" },
      }),
    );
    store.setState({ durable: { problems: {}, quizzes: { [groupId]: completed } } });

    await expect(store.getState().revealQuizAnswers({ groupId: "quiz-one" })).resolves.toBeNull();
    expect(store.getState().durable.quizzes[groupId]).toEqual(completed);
    expect(store.getState().requests[groupId]).toMatchObject({
      operation: "quiz-reveal-answers",
      status: "error",
      error: "review denied",
    });
  });

  it("commits an immediate check and its attempt only after authoritative success", async () => {
    const canonicalProblem = {
      ...createProblemSnapshot(),
      response: { kind: "single-select" as const, optionId: "option-b" },
      attemptNumber: 4,
      checkResult: assessmentResult(),
    };
    const check = vi.fn().mockResolvedValue({ problem: canonicalProblem });
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({ check }),
    });
    const registration = createRegistration({
      config: {
        ...createRegistration().config,
        settings: { ...createRegistration().config.settings, feedbackMode: "immediate" },
      },
    });
    const identity = registrationIdentity();
    const problemId = scopeAssessmentProblemId("artifact-one", "block-one");

    store.getState().register(registration);
    store.getState().setLocalResponse(identity, { choice: "option-b" });

    await expect(store.getState().check(identity)).resolves.toEqual(assessmentResult());
    expect(check).toHaveBeenCalledWith({
      problemId,
      targetId: "target-one",
      interactionKind: "single-select",
      response: { kind: "single-select", optionId: "option-b" },
      expectedAttemptNumber: 0,
    });
    expect(store.getState().durable.problems[problemId]).toEqual(canonicalProblem);
    expect(store.getState().requests[problemId]).toBeUndefined();
  });

  it("rejects a canonical standalone outcome whose response kind mismatches registration", async () => {
    const check = vi.fn().mockResolvedValue({
      problem: {
        ...createProblemSnapshot(),
        response: { kind: "multi-select", optionIds: ["option-b"] },
        attemptNumber: 1,
        checkResult: assessmentResult(),
      },
    });
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({ check }),
    });
    const registration = createRegistration({
      config: {
        ...createRegistration().config,
        settings: { ...createRegistration().config.settings, feedbackMode: "immediate" },
      },
    });
    const identity = registrationIdentity();
    const problemId = scopeAssessmentProblemId("artifact-one", "block-one");

    store.getState().register(registration);
    store.getState().setLocalResponse(identity, { choice: "option-b" });
    const before = store.getState().durable.problems[problemId];

    await expect(store.getState().check(identity)).resolves.toBeNull();
    expect(store.getState().durable.problems[problemId]).toEqual(before);
    expect(store.getState().requests[problemId]).toMatchObject({
      operation: "check",
      status: "error",
      error:
        "Assessment host response kind multi-select does not match registration interactionKind single-select",
    });
  });

  it("preserves attempts and the last check result when a check rejects", async () => {
    const port = createAssessmentPort({
      check: vi
        .fn()
        .mockResolvedValueOnce({
          problem: {
            ...createProblemSnapshot(),
            attemptNumber: 1,
            checkResult: assessmentResult({ isCorrect: false, score: 0 }),
          },
        })
        .mockRejectedValueOnce(new Error("offline")),
    });
    const store = createAssessmentStore({ artifactId: "artifact-one", assessmentPort: port });
    const registration = createRegistration({
      config: {
        ...createRegistration().config,
        settings: { ...createRegistration().config.settings, feedbackMode: "immediate" },
      },
    });
    const identity = registrationIdentity();
    const problemId = scopeAssessmentProblemId("artifact-one", "block-one");

    store.getState().register(registration);
    store.getState().setLocalResponse(identity, { choice: "option-a" });
    await store.getState().check(identity);
    await expect(store.getState().check(identity)).resolves.toBeNull();

    expect(store.getState().durable.problems[problemId]).toMatchObject({
      attemptNumber: 1,
      checkResult: assessmentResult({ isCorrect: false, score: 0 }),
    });
    expect(store.getState().requests[problemId]).toMatchObject({
      operation: "check",
      status: "error",
      error: "offline",
    });
  });

  it("commits submit state only after success and allows retry after rejection", async () => {
    const canonicalProblem = {
      ...createProblemSnapshot(),
      attemptNumber: 1,
      submitted: true,
      submissionResult: assessmentResult(),
    };
    const submit = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ problem: canonicalProblem });
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({ submit }),
    });
    const identity = registrationIdentity();
    const problemId = scopeAssessmentProblemId("artifact-one", "block-one");

    store.getState().register(
      createRegistration({
        config: {
          ...createRegistration().config,
          settings: { ...createRegistration().config.settings, maxAttempts: 1 },
        },
      }),
    );
    store.getState().setLocalResponse(identity, { choice: "option-a" });

    await expect(store.getState().submit(identity)).resolves.toBeNull();
    expect(store.getState().durable.problems[problemId]).toMatchObject({
      response: { kind: "single-select", optionId: "option-a" },
      attemptNumber: 0,
      submitted: false,
      submissionResult: null,
    });

    await expect(store.getState().submit(identity)).resolves.toEqual(assessmentResult());
    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit).toHaveBeenLastCalledWith({
      problemId,
      targetId: "target-one",
      interactionKind: "single-select",
      response: { kind: "single-select", optionId: "option-a" },
      expectedAttemptNumber: 0,
    });
    expect(store.getState().durable.problems[problemId]).toEqual(canonicalProblem);
    expect(store.getState().reset(identity)).toBe(false);
    expect(store.getState().setLocalResponse(identity, { choice: "option-b" })).toBe(false);
    await expect(store.getState().submit(identity)).resolves.toBeNull();
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it("records a standalone answer only after its authoritative result commits", async () => {
    const canonicalProblem = {
      ...createProblemSnapshot(),
      attemptNumber: 3,
      submitted: true as const,
      submissionResult: assessmentResult({
        isCorrect: false,
        score: 0.25,
        items: {
          "private-item": {
            correct: false,
            expected: "PRIVATE_ANSWER",
            given: "PRIVATE_RESPONSE",
          },
        },
      }),
    };
    let store!: ReturnType<typeof createAssessmentStore>;
    let problemAtRecord: AssessmentProblemSnapshot | undefined;
    const xapi = createSessionDouble(() => {
      problemAtRecord =
        store.getState().durable.problems[scopeAssessmentProblemId("artifact-one", "block-one")];
    });
    store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        submit: vi.fn().mockResolvedValue({ problem: canonicalProblem }),
      }),
      getXapiSession: () => xapi.session,
    });
    const identity = registrationIdentity();

    store.getState().register(createRegistration());
    store.getState().setLocalResponse(identity, { choice: "option-a" });

    await expect(store.getState().submit(identity)).resolves.toEqual(
      canonicalProblem.submissionResult,
    );

    expect(problemAtRecord).toEqual(canonicalProblem);
    expect(xapi.record).toHaveBeenCalledExactlyOnceWith(
      buildAnsweredStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        targetId: "target-one",
        interactionKind: "single-select",
        result: canonicalProblem.submissionResult,
        attemptNumber: 3,
      }),
    );
    expect(JSON.stringify(xapi.record.mock.calls)).not.toContain("PRIVATE_");
  });

  it("resolves the current xAPI session when a standalone answer becomes authoritative", async () => {
    const pending = deferred<{ problem: AssessmentProblemSnapshot }>();
    const xapi = createSessionDouble();
    let currentSession: XapiSession | null = null;
    const getXapiSession = vi.fn(() => currentSession);
    const canonicalProblem = {
      ...createProblemSnapshot(),
      attemptNumber: 1,
      submitted: true as const,
      submissionResult: assessmentResult(),
    };
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({ submit: () => pending.promise }),
      getXapiSession,
    });
    const identity = registrationIdentity();

    store.getState().register(createRegistration());
    store.getState().setLocalResponse(identity, { choice: "option-a" });
    const submission = store.getState().submit(identity);
    expect(getXapiSession).not.toHaveBeenCalled();

    currentSession = xapi.session;
    pending.resolve({ problem: canonicalProblem });
    await expect(submission).resolves.toEqual(canonicalProblem.submissionResult);

    expect(getXapiSession).toHaveBeenCalledOnce();
    expect(xapi.record).toHaveBeenCalledOnce();
  });

  it("keeps a successful standalone submission when xAPI recording throws", async () => {
    const canonicalProblem = {
      ...createProblemSnapshot(),
      attemptNumber: 1,
      submitted: true as const,
      submissionResult: assessmentResult(),
    };
    const xapi = createSessionDouble(() => {
      throw new Error("recording unavailable");
    });
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        submit: vi.fn().mockResolvedValue({ problem: canonicalProblem }),
      }),
      getXapiSession: () => xapi.session,
    });
    const identity = registrationIdentity();
    const problemId = scopeAssessmentProblemId("artifact-one", "block-one");

    store.getState().register(createRegistration());
    store.getState().setLocalResponse(identity, { choice: "option-a" });

    await expect(store.getState().submit(identity)).resolves.toEqual(
      canonicalProblem.submissionResult,
    );
    expect(store.getState().durable.problems[problemId]).toEqual(canonicalProblem);
    expect(store.getState().requests[problemId]).toBeUndefined();
  });

  it("does not record a standalone response without an authoritative result", async () => {
    const xapi = createSessionDouble();
    const canonicalProblem = {
      ...createProblemSnapshot(),
      attemptNumber: 1,
    };
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        submit: vi.fn().mockResolvedValue({ problem: canonicalProblem }),
      }),
      getXapiSession: () => xapi.session,
    });
    const identity = registrationIdentity();

    store.getState().register(createRegistration());
    store.getState().setLocalResponse(identity, { choice: "option-a" });

    await expect(store.getState().submit(identity)).resolves.toBeNull();
    expect(xapi.record).not.toHaveBeenCalled();
  });

  it("keeps non-authoritative assessment operations out of xAPI", async () => {
    const xapi = createSessionDouble();
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        check: vi.fn().mockResolvedValue({
          problem: {
            ...createProblemSnapshot(),
            attemptNumber: 1,
            checkResult: assessmentResult(),
          },
        }),
        revealAnswer: vi.fn().mockResolvedValue({
          answerKey: {
            kind: "single-select",
            correctOptionId: "option-b",
            feedbackByOptionId: {},
          },
        }),
      }),
      getXapiSession: () => xapi.session,
    });
    const identity = registrationIdentity();

    store.getState().register(createRegistration());
    expect(store.getState().setLocalResponse(identity, { choice: "option-a" })).toBe(true);
    await expect(store.getState().check(identity)).resolves.toEqual(assessmentResult());
    await expect(store.getState().revealAnswer(identity)).resolves.toMatchObject({
      answerKey: { kind: "single-select", correctOptionId: "option-b" },
    });
    expect(store.getState().reset(identity)).toBe(true);

    expect(xapi.record).not.toHaveBeenCalled();
  });

  it("resets a retryable problem while preserving attempt history and bounds durable hints", async () => {
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        submit: vi.fn().mockResolvedValue({
          problem: {
            ...createProblemSnapshot(),
            attemptNumber: 1,
            submitted: true,
            submissionResult: assessmentResult({ isCorrect: false, score: 0 }),
          },
        }),
      }),
    });
    const identity = registrationIdentity();
    const problemId = scopeAssessmentProblemId("artifact-one", "block-one");

    store.getState().register(
      createRegistration({
        config: {
          ...createRegistration().config,
          settings: { ...createRegistration().config.settings, maxAttempts: 2 },
        },
      }),
    );
    store.getState().setLocalResponse(identity, { choice: "option-a" });
    await expect(store.getState().revealHint(identity)).resolves.toBe(true);
    await store.getState().submit(identity);
    expect(store.getState().reset(identity)).toBe(true);
    expect(store.getState().durable.problems[problemId]?.hintsShown).toBe(0);
    await expect(store.getState().revealHint(identity)).resolves.toBe(true);
    await expect(store.getState().revealHint(identity)).resolves.toBe(true);
    await expect(store.getState().revealHint(identity)).resolves.toBe(false);

    expect(store.getState().durable.problems[problemId]).toEqual({
      response: null,
      attemptNumber: 1,
      hintsShown: 2,
      checkResult: null,
      submitted: false,
      submissionResult: null,
    });
  });

  it("commits an authoritative hint count only after the host succeeds", async () => {
    const pending = deferred<{ problem: AssessmentProblemSnapshot }>();
    const revealHint = vi.fn(() => pending.promise);
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({ revealHint }),
    });
    const identity = registrationIdentity();
    const problemId = scopeAssessmentProblemId("artifact-one", "block-one");

    store.getState().register(createRegistration());
    const revealPromise = store.getState().revealHint(identity);

    expect(revealHint).toHaveBeenCalledWith({
      problemId,
      targetId: "target-one",
      interactionKind: "single-select",
      hintsShown: 1,
    });
    expect(store.getState().requests[problemId]).toMatchObject({
      operation: "reveal-hint",
      status: "pending",
    });
    expect(store.getState().durable.problems[problemId]?.hintsShown ?? 0).toBe(0);

    pending.resolve({
      problem: {
        ...createProblemSnapshot(),
        attemptNumber: 3,
        hintsShown: 1,
      },
    });

    await expect(revealPromise).resolves.toBe(true);
    expect(store.getState().durable.problems[problemId]).toMatchObject({
      attemptNumber: 3,
      hintsShown: 1,
    });
    expect(store.getState().requests[problemId]).toBeUndefined();
  });

  it("records a persisted hint only after its authoritative count commits", async () => {
    const pending = deferred<{ problem: AssessmentProblemSnapshot }>();
    let store!: ReturnType<typeof createAssessmentStore>;
    let hintsAtRecord: number | undefined;
    const xapi = createSessionDouble(() => {
      hintsAtRecord =
        store.getState().durable.problems[scopeAssessmentProblemId("artifact-one", "block-one")]
          ?.hintsShown;
    });
    store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({ revealHint: () => pending.promise }),
      getXapiSession: () => xapi.session,
    });
    const identity = registrationIdentity();

    store.getState().register(createRegistration());
    const reveal = store.getState().revealHint(identity);
    expect(xapi.record).not.toHaveBeenCalled();

    pending.resolve({ problem: { ...createProblemSnapshot(), hintsShown: 1 } });
    await expect(reveal).resolves.toBe(true);

    expect(hintsAtRecord).toBe(1);
    expect(xapi.record).toHaveBeenCalledExactlyOnceWith(
      buildHintInteractedStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        targetId: "target-one",
        hintNumber: 1,
      }),
    );
  });

  it("does not record a persisted hint when authoritative count does not increase", async () => {
    const xapi = createSessionDouble();
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        revealHint: vi.fn().mockResolvedValue({
          problem: { ...createProblemSnapshot(), hintsShown: 1 },
        }),
      }),
      getXapiSession: () => xapi.session,
    });
    const identity = registrationIdentity();
    const problemId = scopeAssessmentProblemId("artifact-one", "block-one");

    store.getState().register(createRegistration());
    store.setState({
      durable: {
        problems: { [problemId]: { ...createProblemSnapshot(), hintsShown: 1 } },
        quizzes: {},
      },
    });

    await expect(store.getState().revealHint(identity)).resolves.toBe(true);

    expect(store.getState().durable.problems[problemId]?.hintsShown).toBe(1);
    expect(xapi.record).not.toHaveBeenCalled();
  });

  it("does not record a locally revealed hint without persistence authority", async () => {
    const xapi = createSessionDouble();
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort(),
      getXapiSession: () => xapi.session,
    });
    const identity = registrationIdentity();

    store.getState().register(createRegistration());

    await expect(store.getState().revealHint(identity)).resolves.toBe(true);
    expect(xapi.record).not.toHaveBeenCalled();
  });

  it("keeps a persisted hint reveal when xAPI recording throws", async () => {
    const xapi = createSessionDouble(() => {
      throw new Error("recording unavailable");
    });
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        revealHint: vi.fn().mockResolvedValue({
          problem: { ...createProblemSnapshot(), hintsShown: 1 },
        }),
      }),
      getXapiSession: () => xapi.session,
    });
    const identity = registrationIdentity();
    const problemId = scopeAssessmentProblemId("artifact-one", "block-one");

    store.getState().register(createRegistration());

    await expect(store.getState().revealHint(identity)).resolves.toBe(true);
    expect(store.getState().durable.problems[problemId]?.hintsShown).toBe(1);
    expect(store.getState().requests[problemId]).toBeUndefined();
  });

  it("allows only one in-flight host hint reveal per problem", async () => {
    const pending = deferred<{ problem: AssessmentProblemSnapshot }>();
    const revealHint = vi.fn(() => pending.promise);
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({ revealHint }),
    });
    const identity = registrationIdentity();

    store.getState().register(createRegistration());
    const firstReveal = store.getState().revealHint(identity);
    await expect(store.getState().revealHint(identity)).resolves.toBe(false);

    expect(revealHint).toHaveBeenCalledOnce();
    pending.resolve({ problem: { ...createProblemSnapshot(), hintsShown: 1 } });
    await expect(firstReveal).resolves.toBe(true);
  });

  it("keeps the prior hint count on host failure and allows retry", async () => {
    const revealHint = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ problem: { ...createProblemSnapshot(), hintsShown: 1 } });
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({ revealHint }),
    });
    const identity = registrationIdentity();
    const problemId = scopeAssessmentProblemId("artifact-one", "block-one");

    store.getState().register(createRegistration());

    await expect(store.getState().revealHint(identity)).resolves.toBe(false);
    expect(store.getState().durable.problems[problemId]?.hintsShown ?? 0).toBe(0);
    expect(store.getState().requests[problemId]).toMatchObject({
      operation: "reveal-hint",
      status: "error",
      error: "offline",
    });

    await expect(store.getState().revealHint(identity)).resolves.toBe(true);
    expect(revealHint).toHaveBeenCalledTimes(2);
    expect(store.getState().durable.problems[problemId]?.hintsShown).toBe(1);
  });

  it("ignores stale host hint reveal completions", async () => {
    const stale = deferred<{ problem: AssessmentProblemSnapshot }>();
    const xapi = createSessionDouble();
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({ revealHint: () => stale.promise }),
      getXapiSession: () => xapi.session,
    });
    const identity = registrationIdentity();
    const problemId = scopeAssessmentProblemId("artifact-one", "block-one");

    store.getState().register(createRegistration());
    const staleReveal = store.getState().revealHint(identity);
    store.getState().setLocalResponse(identity, { choice: "option-a" });
    stale.resolve({ problem: { ...createProblemSnapshot(), hintsShown: 1 } });

    await expect(staleReveal).resolves.toBe(false);
    expect(store.getState().durable.problems[problemId]?.hintsShown).toBe(0);
    expect(xapi.record).not.toHaveBeenCalled();
  });

  it("rejects invalid canonical hint outcomes and installs a valid canonical problem", async () => {
    const revealHint = vi
      .fn()
      .mockResolvedValueOnce({ problem: { ...createProblemSnapshot(), attemptNumber: -1 } })
      .mockResolvedValueOnce({
        problem: { ...createProblemSnapshot(), attemptNumber: 2, hintsShown: 1 },
      });
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({ revealHint }),
    });
    const identity = registrationIdentity();
    const problemId = scopeAssessmentProblemId("artifact-one", "block-one");

    store.getState().register(createRegistration());
    await expect(store.getState().revealHint(identity)).resolves.toBe(false);
    expect(store.getState().requests[problemId]).toMatchObject({
      status: "error",
    });

    await expect(store.getState().revealHint(identity)).resolves.toBe(true);
    expect(store.getState().durable.problems[problemId]).toMatchObject({
      attemptNumber: 2,
      hintsShown: 1,
    });
  });

  it("keeps successful answer reveal transient and preserves it on later failure", async () => {
    const revealAnswer = vi
      .fn()
      .mockResolvedValueOnce({
        answerKey: { kind: "single-select", correctOptionId: "option-b", feedbackByOptionId: {} },
      })
      .mockRejectedValueOnce(new Error("denied"));
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({ revealAnswer }),
    });
    const identity = registrationIdentity();
    const problemId = scopeAssessmentProblemId("artifact-one", "block-one");

    store.getState().register(createRegistration());
    store.getState().setLocalResponse(identity, { choice: "option-a" });

    const reveal = await store.getState().revealAnswer(identity);
    expect(reveal).toEqual({
      answerKey: { kind: "single-select", correctOptionId: "option-b", feedbackByOptionId: {} },
    });
    expect(store.getState().transient.revealedAnswers[problemId]).toEqual(reveal);
    expect(store.getState().durable.problems[problemId]).not.toHaveProperty("revealedAnswer");

    await expect(store.getState().revealAnswer(identity)).resolves.toBeNull();
    expect(store.getState().transient.revealedAnswers[problemId]).toEqual(reveal);
    expect(store.getState().requests[problemId]).toMatchObject({
      status: "error",
      error: "denied",
    });
  });

  it("rejects missing and interaction-kind-mismatched problem actions without mutation", async () => {
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort(),
    });
    const wrongIdentity = registrationIdentity({ interactionKind: "multi-select" });

    expect(store.getState().setLocalResponse(registrationIdentity(), { choice: "option-a" })).toBe(
      false,
    );
    store.getState().register(createRegistration());
    expect(store.getState().setLocalResponse(wrongIdentity, { choice: "option-a" })).toBe(false);
    await expect(store.getState().check(wrongIdentity)).resolves.toBeNull();
    await expect(store.getState().submit(wrongIdentity)).resolves.toBeNull();
    expect(store.getState().reset(wrongIdentity)).toBe(false);
    await expect(store.getState().revealHint(wrongIdentity)).resolves.toBe(false);
    await expect(store.getState().revealAnswer(wrongIdentity)).resolves.toBeNull();
    expect(store.getState().durable.problems).toEqual({});
  });

  it("rejects a codec that emits a different canonical interaction kind", () => {
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort(),
    });
    const registration = createRegistration({
      response: {
        ...createRegistration().response,
        toContractResponse: () => ({ kind: "multi-select", optionIds: ["option-a"] }),
      },
    });

    store.getState().register(registration);

    expect(store.getState().setLocalResponse(registrationIdentity(), { choice: "option-a" })).toBe(
      false,
    );
    expect(store.getState().durable.problems).toEqual({});
  });

  it("makes an in-flight check inert when the learner changes the response", async () => {
    const pending = deferred<{ problem: AssessmentProblemSnapshot }>();
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({ check: () => pending.promise }),
    });
    const identity = registrationIdentity();
    const problemId = scopeAssessmentProblemId("artifact-one", "block-one");

    store.getState().register(createRegistration());
    store.getState().setLocalResponse(identity, { choice: "option-a" });
    const checkPromise = store.getState().check(identity);
    expect(store.getState().requests[problemId]?.status).toBe("pending");

    store.getState().setLocalResponse(identity, { choice: "option-b" });
    pending.resolve({
      problem: { ...createProblemSnapshot(), attemptNumber: 1, checkResult: assessmentResult() },
    });

    await expect(checkPromise).resolves.toBeNull();
    expect(store.getState().durable.problems[problemId]).toMatchObject({
      response: { kind: "single-select", optionId: "option-b" },
      attemptNumber: 0,
      checkResult: null,
    });
    expect(store.getState().requests[problemId]).toBeUndefined();
  });

  it("allows only the newest overlapping submit request to commit", async () => {
    const older = deferred<{ problem: AssessmentProblemSnapshot }>();
    const newer = deferred<{ problem: AssessmentProblemSnapshot }>();
    const submit = vi.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const xapi = createSessionDouble();
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({ submit }),
      getXapiSession: () => xapi.session,
    });
    const identity = registrationIdentity();
    const problemId = scopeAssessmentProblemId("artifact-one", "block-one");

    store.getState().register(createRegistration());
    store.getState().setLocalResponse(identity, { choice: "option-a" });
    const olderPromise = store.getState().submit(identity);
    const newerPromise = store.getState().submit(identity);

    expect(store.getState().durable.problems[problemId]).toMatchObject({
      attemptNumber: 0,
      submitted: false,
      submissionResult: null,
    });
    expect(xapi.record).not.toHaveBeenCalled();

    newer.resolve({
      problem: {
        ...createProblemSnapshot(),
        attemptNumber: 1,
        submitted: true,
        submissionResult: assessmentResult(),
      },
    });
    await expect(newerPromise).resolves.toEqual(assessmentResult());
    older.reject(new Error("late failure"));
    await expect(olderPromise).resolves.toBeNull();

    expect(store.getState().durable.problems[problemId]).toMatchObject({
      attemptNumber: 1,
      submitted: true,
      submissionResult: assessmentResult(),
    });
    expect(store.getState().requests[problemId]).toBeUndefined();
    expect(xapi.record).toHaveBeenCalledOnce();
  });

  it("records predictable transient errors when the port or an optional capability is absent", async () => {
    const problemId = scopeAssessmentProblemId("artifact-one", "block-one");
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz-one");
    const withoutPort = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: null,
    });
    withoutPort.getState().register(createRegistration());
    withoutPort.getState().setLocalResponse(registrationIdentity(), { choice: "option-a" });

    await expect(withoutPort.getState().submit(registrationIdentity())).resolves.toBeNull();
    expect(withoutPort.getState().requests[problemId]).toMatchObject({
      operation: "submit",
      status: "error",
      error: "Assessment submission is unavailable",
    });
    expect(withoutPort.getState().durable.problems[problemId]).toMatchObject({
      attemptNumber: 0,
      submitted: false,
      submissionResult: null,
    });
    await expect(withoutPort.getState().revealAnswer(registrationIdentity())).resolves.toBeNull();
    expect(withoutPort.getState().requests[problemId]).toMatchObject({
      operation: "reveal-answer",
      status: "error",
      error: "Assessment answer reveal is unavailable",
    });

    withoutPort.getState().registerQuiz(createQuizRegistration());
    await expect(
      withoutPort.getState().startQuizAttempt({ groupId: "quiz-one" }),
    ).resolves.toBeNull();
    expect(withoutPort.getState().requests[groupId]).toMatchObject({
      operation: "quiz-start",
      status: "error",
      error: "Quiz start is unavailable",
    });

    const withoutCheck = createAssessmentStore({
      artifactId: "artifact-two",
      assessmentPort: createAssessmentPort(),
    });
    withoutCheck.getState().register(createRegistration());
    withoutCheck.getState().setLocalResponse(registrationIdentity(), { choice: "option-a" });
    await expect(withoutCheck.getState().check(registrationIdentity())).resolves.toBeNull();
    expect(
      withoutCheck.getState().requests[scopeAssessmentProblemId("artifact-two", "block-one")],
    ).toMatchObject({ status: "error", error: "Assessment check is unavailable" });
  });

  it("creates isolated state for each artifact", () => {
    const first = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort(),
    });
    const second = createAssessmentStore({
      artifactId: "artifact-two",
      assessmentPort: createAssessmentPort(),
    });

    expect(first).not.toBe(second);
    expect(first.getState().artifactId).toBe("artifact-one");
    expect(second.getState().artifactId).toBe("artifact-two");
  });

  it("builds artifact-scoped problem and group identities", () => {
    expect(scopeAssessmentProblemId("artifact-one", "block-one")).toBe(
      "artifact:artifact-one/block:block-one",
    );
    expect(scopeAssessmentGroupId("artifact-one", "quiz-one")).toBe(
      "artifact:artifact-one/group:quiz-one",
    );
    expect(scopeAssessmentProblemId("artifact-two", "block-one")).not.toBe(
      scopeAssessmentProblemId("artifact-one", "block-one"),
    );
    expect(scopeAssessmentGroupId("artifact-two", "quiz-one")).not.toBe(
      scopeAssessmentGroupId("artifact-one", "quiz-one"),
    );
  });

  it("rejects blank identity components", () => {
    expect(() => scopeAssessmentProblemId(" ", "block-one")).toThrow(/artifactId/);
    expect(() => scopeAssessmentProblemId("artifact-one", " ")).toThrow(/problemId/);
    expect(() => scopeAssessmentGroupId("artifact-one", " ")).toThrow(/groupId/);
    expect(() =>
      createAssessmentStore({ artifactId: " ", assessmentPort: createAssessmentPort() }),
    ).toThrow(/artifactId/);
  });

  it("shares no durable or request state between artifacts with identical local ids", () => {
    const first = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort(),
    });
    const second = createAssessmentStore({
      artifactId: "artifact-two",
      assessmentPort: createAssessmentPort(),
    });
    const firstProblemId = scopeAssessmentProblemId("artifact-one", "block-one");
    const firstGroupId = scopeAssessmentGroupId("artifact-one", "quiz-one");
    const firstRequest: AssessmentRequestState = {
      ownerId: firstProblemId,
      requestId: "request-one",
      operation: "submit",
      status: "pending",
      error: null,
    };
    const secondProblemId = scopeAssessmentProblemId("artifact-two", "block-one");
    const secondRequest: AssessmentRequestState = {
      ownerId: secondProblemId,
      requestId: "request-one",
      operation: "submit",
      status: "error",
      error: "host unavailable",
    };

    first.setState({
      durable: {
        problems: { [firstProblemId]: createProblemSnapshot() },
        quizzes: { [firstGroupId]: createQuizAttempt("quiz-one") },
      },
      requests: { [firstProblemId]: firstRequest },
    });
    second.setState({ requests: { [secondProblemId]: secondRequest } });

    expect(Object.keys(first.getState().durable.problems)).toEqual([firstProblemId]);
    expect(Object.keys(first.getState().durable.quizzes)).toEqual([firstGroupId]);
    expect(first.getState().requests[firstProblemId]).toEqual(firstRequest);
    expect(second.getState().durable).toEqual({ problems: {}, quizzes: {} });
    expect(second.getState().requests[secondProblemId]).toEqual(secondRequest);
    expect(second.getState().requests[firstProblemId]).toBeUndefined();
    expect(secondProblemId).not.toBe(firstProblemId);
    expect(scopeAssessmentGroupId("artifact-two", "quiz-one")).not.toBe(firstGroupId);
  });

  it("replaces a matching registration without changing durable state", () => {
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort(),
    });
    const problemId = scopeAssessmentProblemId("artifact-one", "block-one");
    const original = createRegistration();
    const replacement = createRegistration({
      config: {
        ...original.config,
        hintsTotal: 4,
      },
    });

    store.setState({
      durable: {
        problems: { [problemId]: createProblemSnapshot() },
        quizzes: {},
      },
    });

    expect(store.getState().register(original)).toBe(true);
    expect(store.getState().register(replacement)).toBe(true);
    expect(store.getState().registrations[problemId]?.problemId).toBe(problemId);
    expect(store.getState().registrations[problemId]?.config.hintsTotal).toBe(4);
    expect(store.getState().durable.problems[problemId]).toEqual(createProblemSnapshot());
  });

  it("binds a hydrated canonical target record to a distinct runtime problem id", () => {
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort(),
    });
    const canonicalProblemId = scopeAssessmentProblemId("artifact-one", "target-one");
    const runtimeProblemId = scopeAssessmentProblemId("artifact-one", "block-one");
    const hydrated = createProblemSnapshot();
    store.setState({
      durable: { problems: { [canonicalProblemId]: hydrated }, quizzes: {} },
    });

    expect(store.getState().register(createRegistration())).toBe(true);

    expect(store.getState().durable.problems[canonicalProblemId]).toBeUndefined();
    expect(store.getState().durable.problems[runtimeProblemId]).toEqual(hydrated);
    expect(store.getState().transient.responseReady[runtimeProblemId]).toBe(true);

    expect(store.getState().unregister(registrationIdentity())).toBe(true);
    expect(store.getState().durable.problems[runtimeProblemId]).toEqual(hydrated);
    expect(store.getState().targetBindings[runtimeProblemId]).toBe("target-one");
    expect(store.getState().transient.responseReady).toEqual({});
  });

  it("rejects a hydrated response whose kind conflicts with registration without mutation", () => {
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort(),
    });
    const canonicalProblemId = scopeAssessmentProblemId("artifact-one", "target-one");
    store.setState({
      durable: { problems: { [canonicalProblemId]: createProblemSnapshot() }, quizzes: {} },
    });
    const before = JSON.stringify(store.getState().durable);

    expect(() =>
      store.getState().register(createRegistration({ interactionKind: "multi-select" })),
    ).toThrow(/interactionKind/);

    expect(JSON.stringify(store.getState().durable)).toBe(before);
    expect(store.getState().registrations).toEqual({});
    expect(store.getState().transient.responseReady).toEqual({});
  });

  it("rejects a hydrated response that the registered capability cannot decode", () => {
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort(),
    });
    const canonicalProblemId = scopeAssessmentProblemId("artifact-one", "target-one");
    store.setState({
      durable: { problems: { [canonicalProblemId]: createProblemSnapshot() }, quizzes: {} },
    });

    expect(() =>
      store.getState().register(
        createRegistration({
          response: {
            ...createRegistration().response,
            fromContractResponse: () => {
              throw new Error("unsupported canonical option");
            },
          },
        }),
      ),
    ).toThrow(/capability/);

    expect(store.getState().durable.problems[canonicalProblemId]).toEqual(createProblemSnapshot());
    expect(store.getState().registrations).toEqual({});
  });

  it("updates an existing registration and reports a missing one", () => {
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort(),
    });
    const problemId = scopeAssessmentProblemId("artifact-one", "block-one");
    const original = createRegistration();
    const update = createRegistration({
      config: {
        ...original.config,
        hintsTotal: 5,
      },
    });

    expect(store.getState().update(update)).toBe(false);
    expect(store.getState().register(original)).toBe(true);
    expect(store.getState().update(update)).toBe(true);
    expect(store.getState().registrations[problemId]?.config.hintsTotal).toBe(5);
  });

  it("rejects registration identity changes", () => {
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort(),
    });

    store.getState().register(createRegistration());

    expect(() => store.getState().register(createRegistration({ targetId: "target-two" }))).toThrow(
      /targetId/,
    );
    expect(() =>
      store.getState().update(createRegistration({ interactionKind: "multi-select" })),
    ).toThrow(/interactionKind/);
    expect(() =>
      store.getState().unregister(registrationIdentity({ targetId: "target-two" })),
    ).toThrow(/targetId/);
  });

  it("unregisters only a matching registration and preserves durable state", () => {
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort(),
    });
    const problemId = scopeAssessmentProblemId("artifact-one", "block-one");

    expect(store.getState().unregister(registrationIdentity())).toBe(false);
    store.getState().register(createRegistration());
    store.setState({
      durable: {
        problems: { [problemId]: createProblemSnapshot() },
        quizzes: {},
      },
    });

    expect(store.getState().unregister(registrationIdentity())).toBe(true);
    expect(store.getState().registrations).toEqual({});
    expect(store.getState().durable.problems[problemId]).toEqual(createProblemSnapshot());
    expect(store.getState().targetBindings[problemId]).toBe("target-one");
  });

  it("keeps matching local registrations isolated between artifacts", () => {
    const first = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort(),
    });
    const second = createAssessmentStore({
      artifactId: "artifact-two",
      assessmentPort: createAssessmentPort(),
    });
    const firstRegistration = createRegistration();
    const secondRegistration = createRegistration({
      config: { ...firstRegistration.config, hintsTotal: 7 },
    });
    const firstProblemId = scopeAssessmentProblemId("artifact-one", "block-one");
    const secondProblemId = scopeAssessmentProblemId("artifact-two", "block-one");

    first.getState().register(firstRegistration);
    second.getState().register(secondRegistration);

    expect(first.getState().registrations[firstProblemId]?.config.hintsTotal).toBe(2);
    expect(first.getState().registrations[secondProblemId]).toBeUndefined();
    expect(second.getState().registrations[secondProblemId]?.config.hintsTotal).toBe(7);
    expect(second.getState().registrations[firstProblemId]).toBeUndefined();
  });

  it("keeps durable contract values structurally separate from registration and request state", () => {
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort(),
    });
    const problemId = scopeAssessmentProblemId("artifact-one", "block-one");
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz-one");
    const problem = createProblemSnapshot();
    const quiz = createQuizAttempt("quiz-one");

    store.getState().register(createRegistration());
    store.setState({
      durable: {
        problems: { [problemId]: problem },
        quizzes: { [groupId]: quiz },
      },
      requests: {
        [problemId]: {
          ownerId: problemId,
          requestId: "request-one",
          operation: "check",
          status: "pending",
          error: null,
        },
      },
    });

    expect(
      AssessmentProblemSnapshotSchema.parse(store.getState().durable.problems[problemId]),
    ).toEqual(problem);
    expect(QuizAttemptStateSchema.parse(store.getState().durable.quizzes[groupId])).toEqual(quiz);
    expect(JSON.parse(JSON.stringify(store.getState().durable))).toEqual({
      problems: { [problemId]: problem },
      quizzes: { [groupId]: quiz },
    });
    expect(store.getState().durable).not.toHaveProperty("registrations");
    expect(store.getState().durable).not.toHaveProperty("requests");
    expect(store.getState().registrations[problemId]?.response).toBeDefined();
  });

  it("keeps store factories isolated without runtime lifecycle fields", () => {
    const first = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort(),
    });
    const second = createAssessmentStore({
      artifactId: "artifact-two",
      assessmentPort: createAssessmentPort(),
    });
    const firstProblemId = scopeAssessmentProblemId("artifact-one", "block-one");
    const secondProblemId = scopeAssessmentProblemId("artifact-two", "block-one");
    const firstGroupId = scopeAssessmentGroupId("artifact-one", "quiz-one");
    const secondGroupId = scopeAssessmentGroupId("artifact-two", "quiz-one");

    first.getState().register(createRegistration());
    second.getState().register(createRegistration());
    first.setState({
      durable: {
        problems: { [firstProblemId]: createProblemSnapshot() },
        quizzes: { [firstGroupId]: createQuizAttempt("quiz-one") },
      },
      requests: {
        [firstProblemId]: {
          ownerId: firstProblemId,
          requestId: "request-one",
          operation: "submit",
          status: "pending",
          error: null,
        },
      },
    });
    second.setState({
      durable: {
        problems: { [secondProblemId]: createProblemSnapshot() },
        quizzes: { [secondGroupId]: createQuizAttempt("quiz-one") },
      },
    });
    expect(first.getState().register(createRegistration({ problemId: "block-two" }))).toBe(true);
    expect(Object.keys(first.getState()).sort()).toEqual([
      "artifactId",
      "check",
      "durable",
      "expireQuizAttempt",
      "finishQuizAttempt",
      "quizRegistrations",
      "register",
      "registerQuiz",
      "registrations",
      "requests",
      "reset",
      "revealAnswer",
      "revealHint",
      "revealQuizAnswers",
      "setLocalResponse",
      "startQuizAttempt",
      "submit",
      "submitQuizQuestion",
      "targetBindings",
      "transient",
      "unregister",
      "unregisterQuiz",
      "update",
      "updateQuiz",
    ]);
    expect(first.getState().durable.problems[firstProblemId]).toEqual(createProblemSnapshot());
    expect(first.getState().durable.quizzes[firstGroupId]).toEqual(createQuizAttempt("quiz-one"));
    expect(second.getState().durable.problems[secondProblemId]).toEqual(createProblemSnapshot());
    expect(second.getState().durable.quizzes[secondGroupId]).toEqual(createQuizAttempt("quiz-one"));
    expect(second.getState().registrations[secondProblemId]).toBeDefined();
  });
});
