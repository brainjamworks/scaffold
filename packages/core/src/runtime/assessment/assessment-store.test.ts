import { describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import type {
  AssessmentProblemSnapshot,
  AssessmentResult,
  QuizAssessmentSettings,
  QuizAttemptState,
  Score,
} from "@scaffold/contracts";
import {
  AssessmentInteractionContractSchema,
  AssessmentProblemSnapshotSchema,
  AssessmentResponseValueSchema,
  AssessmentResultSchema,
  QuizAttemptStateSchema,
  SingleSelectResponseSchema,
} from "@scaffold/contracts";
import type { AssessmentPort, AssessmentQuizCommandOutcome } from "../../host/ports/assessment";
import type {
  AssessmentLearningEventDefinition,
  CoreLearningEventInput,
} from "../learning-events/catalogue";
import type { LearningEventSession } from "../learning-events/session";
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
    score: { scaled: 1 },
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
  recordImplementation: (input: CoreLearningEventInput) => void = () => undefined,
) {
  const record = vi.fn<(input: CoreLearningEventInput) => void>(recordImplementation);
  const session: LearningEventSession = Object.freeze({
    rootActivityId: ROOT_ACTIVITY_ID,
    start: vi.fn(),
    record,
    recordBlock: vi.fn(),
    terminate: vi.fn(async () => undefined),
    getState: () => ({ status: "dormant" as const }),
  });
  return { session, record };
}

function answeredInput(input: {
  readonly rootActivityId: string;
  readonly targetId: string;
  readonly definition: AssessmentLearningEventDefinition;
  readonly response: z.input<typeof AssessmentResponseValueSchema> | null;
  readonly result: Pick<AssessmentResult, "isCorrect" | "score">;
  readonly attemptNumber: number;
  readonly quiz?: { readonly quizId: string; readonly attemptId: string } | null;
}): CoreLearningEventInput {
  const { rootActivityId: _rootActivityId, ...event } = input;
  return {
    type: "assessment.answered",
    ...event,
    response: event.response === null ? null : AssessmentResponseValueSchema.parse(event.response),
    result: { isCorrect: event.result.isCorrect, score: event.result.score },
  };
}

function hintInput(input: {
  readonly rootActivityId: string;
  readonly targetId: string;
  readonly definition: AssessmentLearningEventDefinition;
  readonly hintNumber: number;
}): CoreLearningEventInput {
  const { rootActivityId: _rootActivityId, ...event } = input;
  return { type: "assessment.hint-interacted", ...event };
}

function quizAttemptedInput(input: {
  readonly rootActivityId: string;
  readonly quizId: string;
  readonly attemptId: string;
}): CoreLearningEventInput {
  const { rootActivityId: _rootActivityId, ...event } = input;
  return { type: "quiz.attempted", ...event };
}

function quizCompletedInput(input: {
  readonly rootActivityId: string;
  readonly quizId: string;
  readonly attemptId: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
}): CoreLearningEventInput {
  const { rootActivityId: _rootActivityId, ...event } = input;
  return { type: "quiz.completed", ...event };
}

function quizSuccessInput(input: {
  readonly rootActivityId: string;
  readonly quizId: string;
  readonly attemptId: string;
  readonly successStatus: "passed" | "failed";
  readonly score: Score;
}): CoreLearningEventInput {
  const { rootActivityId: _rootActivityId, ...event } = input;
  const { successStatus, ...success } = event;
  return { type: successStatus === "passed" ? "quiz.passed" : "quiz.failed", ...success };
}

function assessmentLearningEventDefinition(): AssessmentLearningEventDefinition {
  return {
    activityDescription: "Which answer is correct?",
    interaction: AssessmentInteractionContractSchema.parse({
      kind: "single-select",
      options: [
        { id: "option_00001", label: "Paris" },
        { id: "option_00002", label: "Madrid" },
      ],
    }),
  };
}

function createProblemSnapshot(): AssessmentProblemSnapshot {
  return AssessmentProblemSnapshotSchema.parse({
    response: { kind: "single-select", optionId: "option_00001" },
    attemptNumber: 0,
    hintsShown: 0,
    checkResult: null,
    submitted: false,
    submissionResult: null,
  });
}

function createQuizAttempt(
  groupId: string,
  overrides: Partial<z.input<typeof QuizAttemptStateSchema>> = {},
): QuizAttemptState {
  return QuizAttemptStateSchema.parse({
    attemptId: "attempt-one",
    groupId,
    status: "in_progress",
    currentTargetId: "target_00001",
    submittedTargetIds: [],
    startedAt: "2026-07-16T12:00:00.000Z",
    finishedAt: null,
    expiresAt: null,
    score: null,
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
    authoredBlockId: "block_000001",
    targetId: "target_00001",
    interactionKind: "single-select",
    response: {
      schema: z.object({ choice: z.string().nullable() }),
      toContractResponse: (response) =>
        SingleSelectResponseSchema.parse({
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
      learningEventDefinition: assessmentLearningEventDefinition(),
    },
    ...overrides,
  };
}

function registrationIdentity(
  overrides: Partial<AssessmentRegistrationIdentity> = {},
): AssessmentRegistrationIdentity {
  return {
    authoredBlockId: "block_000001",
    targetId: "target_00001",
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
    groupId: "quiz__000001",
    targetIds: ["target_00001", "target_00002"],
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
    const problemId = scopeAssessmentProblemId("artifact-one", "block_000001");

    store.getState().register(createRegistration());

    expect(store.getState().setLocalResponse(identity, { choice: "option_00002" })).toBe(true);
    expect(store.getState().durable.problems[problemId]?.response).toEqual({
      kind: "single-select",
      optionId: "option_00002",
    });
    expect(store.getState().setLocalResponse(identity, { choice: 42 })).toBe(false);
    expect(store.getState().durable.problems[problemId]?.response).toEqual({
      kind: "single-select",
      optionId: "option_00002",
    });
  });

  it("registers Quiz configuration separately from durable attempt state", () => {
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort(),
    });
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz__000001");

    expect(
      store.getState().registerQuiz(createQuizRegistration({ groupId: " quiz__000001 " })),
    ).toBe(true);
    expect(store.getState().quizRegistrations[groupId]).toEqual({
      groupId,
      authoredGroupId: "quiz__000001",
      targetIds: ["target_00001", "target_00002"],
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
    expect(store.getState().unregisterQuiz({ groupId: "quiz__000001" })).toBe(true);
    expect(store.getState().quizRegistrations).toEqual({});
  });

  it("starts a Quiz through its scoped group identity and commits only a matching host attempt", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz__000001");
    const hostAttempt = createQuizAttempt(groupId);
    const startAttempt = vi.fn().mockResolvedValue({
      quizAttempt: hostAttempt,
      problemsByTargetId: {},
    });
    const durableAtRecord: QuizAttemptState[] = [];
    let store!: ReturnType<typeof createAssessmentStore>;
    const sessionDouble = createSessionDouble(() => {
      const attempt = store.getState().durable.quizzes[groupId];
      if (attempt) durableAtRecord.push(attempt);
    });
    const getLearningEventSession = vi.fn(() => sessionDouble.session);
    store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        quiz: {
          startAttempt,
          submitQuestion: vi.fn(),
          finishAttempt: vi.fn(),
        },
      }),
      getLearningEventSession: getLearningEventSession,
    });

    store.getState().registerQuiz(createQuizRegistration());

    await expect(store.getState().startQuizAttempt({ groupId: "quiz__000001" })).resolves.toEqual(
      hostAttempt,
    );
    expect(startAttempt).toHaveBeenCalledWith({ groupId });
    expect(store.getState().durable.quizzes[groupId]).toEqual(hostAttempt);
    expect(store.getState().requests[groupId]).toBeUndefined();
    expect(getLearningEventSession).toHaveBeenCalledOnce();
    expect(sessionDouble.record).toHaveBeenCalledWith(
      quizAttemptedInput({
        rootActivityId: ROOT_ACTIVITY_ID,
        quizId: "quiz__000001",
        attemptId: "attempt-one",
      }),
    );
    expect(durableAtRecord).toEqual([hostAttempt]);
  });

  it("does not record the same authoritative Quiz attempt twice", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz__000001");
    const hostAttempt = createQuizAttempt(groupId);
    const startAttempt = vi.fn().mockResolvedValue({
      quizAttempt: hostAttempt,
      problemsByTargetId: {},
    });
    const sessionDouble = createSessionDouble();
    const getLearningEventSession = vi.fn(() => sessionDouble.session);
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        quiz: {
          startAttempt,
          submitQuestion: vi.fn(),
          finishAttempt: vi.fn(),
        },
      }),
      getLearningEventSession: getLearningEventSession,
    });
    store.getState().registerQuiz(createQuizRegistration());

    await expect(store.getState().startQuizAttempt({ groupId: "quiz__000001" })).resolves.toEqual(
      hostAttempt,
    );
    await expect(store.getState().startQuizAttempt({ groupId: "quiz__000001" })).resolves.toEqual(
      hostAttempt,
    );

    expect(startAttempt).toHaveBeenCalledTimes(2);
    expect(getLearningEventSession).toHaveBeenCalledOnce();
    expect(sessionDouble.record).toHaveBeenCalledOnce();
  });

  it("records only the current response when Quiz starts overlap", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz__000001");
    const firstOutcome = deferred<AssessmentQuizCommandOutcome>();
    const secondOutcome = deferred<AssessmentQuizCommandOutcome>();
    const firstAttempt = createQuizAttempt(groupId);
    const secondAttempt = createQuizAttempt(groupId, { attemptId: "attempt-two" });
    const startAttempt = vi
      .fn()
      .mockReturnValueOnce(firstOutcome.promise)
      .mockReturnValueOnce(secondOutcome.promise);
    const sessionDouble = createSessionDouble();
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        quiz: {
          startAttempt,
          submitQuestion: vi.fn(),
          finishAttempt: vi.fn(),
        },
      }),
      getLearningEventSession: () => sessionDouble.session,
    });
    store.getState().registerQuiz(createQuizRegistration());

    const firstStart = store.getState().startQuizAttempt({ groupId: "quiz__000001" });
    const secondStart = store.getState().startQuizAttempt({ groupId: "quiz__000001" });
    secondOutcome.resolve({ quizAttempt: secondAttempt, problemsByTargetId: {} });
    await expect(secondStart).resolves.toEqual(secondAttempt);
    firstOutcome.resolve({ quizAttempt: firstAttempt, problemsByTargetId: {} });
    await expect(firstStart).resolves.toBeNull();

    expect(store.getState().durable.quizzes[groupId]).toEqual(secondAttempt);
    expect(sessionDouble.record).toHaveBeenCalledOnce();
    expect(sessionDouble.record).toHaveBeenCalledWith(
      quizAttemptedInput({
        rootActivityId: ROOT_ACTIVITY_ID,
        quizId: "quiz__000001",
        attemptId: "attempt-two",
      }),
    );
  });

  it("keeps an authoritative Quiz start successful when Learning Events are unavailable", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz__000001");
    const hostAttempt = createQuizAttempt(groupId);
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        quiz: {
          startAttempt: vi.fn().mockResolvedValue({
            quizAttempt: hostAttempt,
            problemsByTargetId: {},
          }),
          submitQuestion: vi.fn(),
          finishAttempt: vi.fn(),
        },
      }),
      getLearningEventSession: () => null,
    });
    store.getState().registerQuiz(createQuizRegistration());

    await expect(store.getState().startQuizAttempt({ groupId: "quiz__000001" })).resolves.toEqual(
      hostAttempt,
    );
    expect(store.getState().durable.quizzes[groupId]).toEqual(hostAttempt);
  });

  it.each(["session accessor", "statement builder", "session record"] as const)(
    "keeps an authoritative Quiz start successful when the Learning Event %s throws",
    async (failurePoint) => {
      const groupId = scopeAssessmentGroupId("artifact-one", "quiz__000001");
      const hostAttempt = createQuizAttempt(groupId);
      const sessionDouble = createSessionDouble(() => {
        throw new Error("recording failed");
      });
      const invalidRootSession: LearningEventSession = Object.freeze({
        ...sessionDouble.session,
        rootActivityId: "not an IRI",
      });
      const store = createAssessmentStore({
        artifactId: "artifact-one",
        assessmentPort: createAssessmentPort({
          quiz: {
            startAttempt: vi.fn().mockResolvedValue({
              quizAttempt: hostAttempt,
              problemsByTargetId: {},
            }),
            submitQuestion: vi.fn(),
            finishAttempt: vi.fn(),
          },
        }),
        getLearningEventSession:
          failurePoint === "session accessor"
            ? () => {
                throw new Error("session unavailable");
              }
            : failurePoint === "statement builder"
              ? () => invalidRootSession
              : () => sessionDouble.session,
      });
      store.getState().registerQuiz(createQuizRegistration());

      await expect(store.getState().startQuizAttempt({ groupId: "quiz__000001" })).resolves.toEqual(
        hostAttempt,
      );
      expect(store.getState().durable.quizzes[groupId]).toEqual(hostAttempt);
    },
  );

  it("does not record a rejected Quiz start", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz__000001");
    const getLearningEventSession = vi.fn();
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        quiz: {
          startAttempt: vi.fn().mockRejectedValue(new Error("start rejected")),
          submitQuestion: vi.fn(),
          finishAttempt: vi.fn(),
        },
      }),
      getLearningEventSession: getLearningEventSession,
    });
    store.getState().registerQuiz(createQuizRegistration());

    await expect(
      store.getState().startQuizAttempt({ groupId: "quiz__000001" }),
    ).resolves.toBeNull();
    expect(store.getState().durable.quizzes).toEqual({});
    expect(store.getState().requests[groupId]).toMatchObject({
      operation: "quiz-start",
      status: "error",
      error: "start rejected",
    });
    expect(getLearningEventSession).not.toHaveBeenCalled();
  });

  it("preserves historical null success returned by ensure-start", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz__000001");
    const terminalAttempt = createQuizAttempt(groupId, {
      status: "completed",
      currentTargetId: null,
      finishedAt: "2026-07-16T12:05:00.000Z",
      score: { scaled: 1 },
      successStatus: null,
    });
    const getLearningEventSession = vi.fn();
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
      getLearningEventSession: getLearningEventSession,
    });
    store.getState().registerQuiz(
      createQuizRegistration({
        settings: { ...quizSettings, passingScore: 0.5 },
      }),
    );

    await expect(store.getState().startQuizAttempt({ groupId: "quiz__000001" })).resolves.toEqual(
      terminalAttempt,
    );
    expect(store.getState().durable.quizzes[groupId]).toEqual(terminalAttempt);
    expect(getLearningEventSession).not.toHaveBeenCalled();
  });

  it("submits a Quiz question with its canonical response and applies authoritative target state", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz__000001");
    const result = assessmentResult({ isCorrect: false, score: { scaled: 0 } });
    const canonicalProblem = {
      ...createProblemSnapshot(),
      attemptNumber: 5,
      checkResult: result,
      submitted: true,
      submissionResult: result,
    };
    const submitQuestion = vi.fn().mockResolvedValue({
      quizAttempt: createQuizAttempt(groupId, {
        currentTargetId: "target_00002",
        submittedTargetIds: ["target_00001"],
        resultsByTargetId: { target_00001: result },
      }),
      problemsByTargetId: { target_00001: canonicalProblem },
    });
    const sessionDouble = createSessionDouble();
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        quiz: {
          startAttempt: vi.fn(),
          submitQuestion,
          finishAttempt: vi.fn(),
        },
      }),
      getLearningEventSession: () => sessionDouble.session,
    });
    const identity = registrationIdentity();
    const problemId = scopeAssessmentProblemId("artifact-one", "block_000001");
    const learningEventDefinition = assessmentLearningEventDefinition();
    const registrationConfig = {
      ...createRegistration().config,
      learningEventDefinition,
    };

    store.getState().register(
      createRegistration({
        config: registrationConfig,
      }),
    );
    store.getState().registerQuiz(createQuizRegistration());
    store.setState({
      durable: {
        problems: {},
        quizzes: { [groupId]: createQuizAttempt(groupId) },
      },
    });
    store.getState().setLocalResponse(identity, { choice: "option_00001" });

    await expect(
      store.getState().submitQuizQuestion({ groupId: "quiz__000001" }, identity),
    ).resolves.toMatchObject({ currentTargetId: "target_00002" });
    expect(submitQuestion).toHaveBeenCalledWith({
      attemptId: "attempt-one",
      groupId,
      targetId: "target_00001",
      response: { kind: "single-select", optionId: "option_00001" },
      expectedAttemptNumber: 0,
    });
    expect(store.getState().durable.problems[problemId]).toEqual(canonicalProblem);
    expect(sessionDouble.record).toHaveBeenCalledExactlyOnceWith(
      answeredInput({
        rootActivityId: ROOT_ACTIVITY_ID,
        targetId: "target_00001",
        definition: learningEventDefinition,
        response: canonicalProblem.response,
        result,
        attemptNumber: 5,
        quiz: { quizId: "quiz__000001", attemptId: "attempt-one" },
      }),
    );
  });

  it("records a terminal final question as answered, completed, then passed", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz__000001");
    const result = assessmentResult({
      feedback: {
        kind: "rich-text",
        document: {
          type: "doc",
          content: [{ type: "text", text: "PRIVATE_FEEDBACK" }],
        },
      },
      items: {
        privat_00001: {
          correct: true,
          expected: "PRIVATE_ANSWER",
          given: "PRIVATE_RESPONSE",
        },
      },
    });
    const terminalAttempt = createQuizAttempt(groupId, {
      status: "completed",
      currentTargetId: null,
      submittedTargetIds: ["target_00001"],
      finishedAt: "2026-07-16T12:05:00.000Z",
      score: { scaled: 1 },
      successStatus: "passed",
      resultsByTargetId: { target_00001: result },
    });
    const problem: AssessmentProblemSnapshot = {
      ...createProblemSnapshot(),
      attemptNumber: 1,
      submitted: true,
      submissionResult: result,
    };
    const sessionDouble = createSessionDouble();
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        quiz: {
          startAttempt: vi.fn(),
          submitQuestion: vi.fn().mockResolvedValue({
            quizAttempt: terminalAttempt,
            problemsByTargetId: { target_00001: problem },
          }),
          finishAttempt: vi.fn(),
        },
      }),
      getLearningEventSession: () => sessionDouble.session,
    });
    const identity = registrationIdentity();

    store.getState().register(createRegistration());
    store.getState().registerQuiz(
      createQuizRegistration({
        targetIds: ["target_00001"],
        settings: { ...quizSettings, passingScore: 0.5 },
      }),
    );
    store.setState({
      durable: {
        problems: {},
        quizzes: { [groupId]: createQuizAttempt(groupId) },
      },
    });
    store.getState().setLocalResponse(identity, { choice: "option_00001" });

    await expect(
      store.getState().submitQuizQuestion({ groupId: "quiz__000001" }, identity),
    ).resolves.toEqual(terminalAttempt);

    expect(sessionDouble.record.mock.calls.map(([draft]) => draft)).toEqual([
      answeredInput({
        rootActivityId: ROOT_ACTIVITY_ID,
        targetId: "target_00001",
        definition: assessmentLearningEventDefinition(),
        response: problem.response,
        result,
        attemptNumber: 1,
        quiz: { quizId: "quiz__000001", attemptId: "attempt-one" },
      }),
      quizCompletedInput({
        rootActivityId: ROOT_ACTIVITY_ID,
        quizId: "quiz__000001",
        attemptId: "attempt-one",
        startedAt: "2026-07-16T12:00:00.000Z",
        finishedAt: "2026-07-16T12:05:00.000Z",
      }),
      quizSuccessInput({
        rootActivityId: ROOT_ACTIVITY_ID,
        quizId: "quiz__000001",
        attemptId: "attempt-one",
        successStatus: "passed",
        score: { scaled: 1 },
      }),
    ]);
    expect(JSON.stringify(sessionDouble.record.mock.calls)).not.toContain("PRIVATE_");
  });

  it("records equal-valued Quiz retries as distinct authoritative attempts", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz__000001");
    const result = assessmentResult({ isCorrect: false, score: { scaled: 0 } });
    const submitQuestion = vi
      .fn()
      .mockResolvedValueOnce({
        quizAttempt: createQuizAttempt(groupId),
        problemsByTargetId: {
          target_00001: {
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
          target_00001: {
            ...createProblemSnapshot(),
            attemptNumber: 2,
            submitted: true,
            submissionResult: result,
          },
        },
      });
    const sessionDouble = createSessionDouble();
    const getLearningEventSession = vi.fn(() => sessionDouble.session);
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        quiz: {
          startAttempt: vi.fn(),
          submitQuestion,
          finishAttempt: vi.fn(),
        },
      }),
      getLearningEventSession: getLearningEventSession,
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
    store.getState().setLocalResponse(identity, { choice: "option_00001" });

    await store.getState().submitQuizQuestion({ groupId: "quiz__000001" }, identity);
    await store.getState().submitQuizQuestion({ groupId: "quiz__000001" }, identity);

    expect(submitQuestion).toHaveBeenNthCalledWith(2, {
      attemptId: "attempt-one",
      groupId,
      targetId: "target_00001",
      response: { kind: "single-select", optionId: "option_00001" },
      expectedAttemptNumber: 1,
    });
    expect(sessionDouble.record.mock.calls.map(([draft]) => draft)).toEqual(
      [1, 2].map((attemptNumber) =>
        answeredInput({
          rootActivityId: ROOT_ACTIVITY_ID,
          targetId: "target_00001",
          definition: assessmentLearningEventDefinition(),
          response: { kind: "single-select", optionId: "option_00001" },
          result,
          attemptNumber,
          quiz: { quizId: "quiz__000001", attemptId: "attempt-one" },
        }),
      ),
    );
    expect(getLearningEventSession).toHaveBeenCalledTimes(2);
  });

  it("does not record unchanged, lower, or redacted Quiz problem attempts", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz__000001");
    const result = assessmentResult();
    const submitQuestion = vi
      .fn()
      .mockResolvedValueOnce({
        quizAttempt: createQuizAttempt(groupId),
        problemsByTargetId: {
          target_00001: {
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
          target_00001: {
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
          target_00001: {
            ...createProblemSnapshot(),
            attemptNumber: 2,
            submissionResult: null,
          },
        },
      });
    const sessionDouble = createSessionDouble();
    const getLearningEventSession = vi.fn(() => sessionDouble.session);
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        quiz: {
          startAttempt: vi.fn(),
          submitQuestion,
          finishAttempt: vi.fn(),
        },
      }),
      getLearningEventSession: getLearningEventSession,
    });
    const identity = registrationIdentity();
    const problemId = scopeAssessmentProblemId("artifact-one", "block_000001");

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

    await store.getState().submitQuizQuestion({ groupId: "quiz__000001" }, identity);
    await store.getState().submitQuizQuestion({ groupId: "quiz__000001" }, identity);
    await store.getState().submitQuizQuestion({ groupId: "quiz__000001" }, identity);

    expect(submitQuestion).toHaveBeenCalledTimes(3);
    expect(store.getState().durable.problems[problemId]).toMatchObject({
      attemptNumber: 2,
      submitted: false,
      submissionResult: null,
    });
    expect(sessionDouble.record).not.toHaveBeenCalled();
    expect(getLearningEventSession).not.toHaveBeenCalled();
  });

  it("records explicit-finish answers before completion and authoritative success", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz__000001");
    const firstResult = assessmentResult();
    const secondResult = assessmentResult({ isCorrect: false, score: { scaled: 0 } });
    const canonicalFirstProblem = {
      ...createProblemSnapshot(),
      attemptNumber: 7,
      submitted: true,
      submissionResult: firstResult,
    };
    const canonicalSecondProblem = {
      ...createProblemSnapshot(),
      response: { kind: "single-select" as const, optionId: "option_00002" },
      attemptNumber: 8,
      submitted: true,
      submissionResult: secondResult,
    };
    const finishAttempt = vi.fn().mockResolvedValue({
      quizAttempt: createQuizAttempt(groupId, {
        status: "completed",
        currentTargetId: null,
        submittedTargetIds: ["target_00001", "target_00002"],
        finishedAt: "2026-07-16T12:05:00.000Z",
        score: { scaled: 1, raw: 2, min: 0, max: 2 },
        successStatus: "passed",
        resultsByTargetId: {
          target_00001: firstResult,
          target_00002: secondResult,
        },
      }),
      problemsByTargetId: {
        target_00002: canonicalSecondProblem,
        target_00001: canonicalFirstProblem,
      },
    });
    const sessionDouble = createSessionDouble(() => {
      throw new Error("recording unavailable");
    });
    const getLearningEventSession = vi.fn(() => sessionDouble.session);
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        quiz: { startAttempt: vi.fn(), submitQuestion: vi.fn(), finishAttempt },
      }),
      getLearningEventSession: getLearningEventSession,
    });
    const secondIdentity = registrationIdentity({
      authoredBlockId: "block_000002",
      targetId: "target_00002",
    });

    store.getState().register(createRegistration());
    store
      .getState()
      .register(createRegistration({ authoredBlockId: "block_000002", targetId: "target_00002" }));
    store.getState().registerQuiz(
      createQuizRegistration({
        settings: { ...quizSettings, passingScore: 0.5 },
      }),
    );
    store.setState({
      durable: { problems: {}, quizzes: { [groupId]: createQuizAttempt(groupId) } },
    });
    store.getState().setLocalResponse(registrationIdentity(), { choice: "option_00001" });
    await expect(
      store.getState().finishQuizAttempt({ groupId: "quiz__000001" }),
    ).resolves.toBeNull();
    expect(finishAttempt).not.toHaveBeenCalled();

    store.getState().setLocalResponse(secondIdentity, { choice: "option_00002" });
    await expect(
      store.getState().finishQuizAttempt({ groupId: "quiz__000001" }),
    ).resolves.toMatchObject({
      status: "completed",
      score: { scaled: 1, raw: 2, min: 0, max: 2 },
    });
    expect(finishAttempt).toHaveBeenCalledWith({
      attemptId: "attempt-one",
      groupId,
      responsesByTargetId: {
        target_00001: { kind: "single-select", optionId: "option_00001" },
        target_00002: { kind: "single-select", optionId: "option_00002" },
      },
    });
    expect(
      store.getState().durable.problems[scopeAssessmentProblemId("artifact-one", "block_000001")],
    ).toEqual(canonicalFirstProblem);
    expect(
      store.getState().durable.problems[scopeAssessmentProblemId("artifact-one", "block_000002")],
    ).toEqual(canonicalSecondProblem);
    expect(getLearningEventSession).toHaveBeenCalledOnce();
    expect(sessionDouble.record.mock.calls.map(([draft]) => draft)).toEqual([
      answeredInput({
        rootActivityId: ROOT_ACTIVITY_ID,
        targetId: "target_00001",
        definition: assessmentLearningEventDefinition(),
        response: canonicalFirstProblem.response,
        result: firstResult,
        attemptNumber: 7,
        quiz: { quizId: "quiz__000001", attemptId: "attempt-one" },
      }),
      answeredInput({
        rootActivityId: ROOT_ACTIVITY_ID,
        targetId: "target_00002",
        definition: assessmentLearningEventDefinition(),
        response: canonicalSecondProblem.response,
        result: secondResult,
        attemptNumber: 8,
        quiz: { quizId: "quiz__000001", attemptId: "attempt-one" },
      }),
      quizCompletedInput({
        rootActivityId: ROOT_ACTIVITY_ID,
        quizId: "quiz__000001",
        attemptId: "attempt-one",
        startedAt: "2026-07-16T12:00:00.000Z",
        finishedAt: "2026-07-16T12:05:00.000Z",
      }),
      quizSuccessInput({
        rootActivityId: ROOT_ACTIVITY_ID,
        quizId: "quiz__000001",
        attemptId: "attempt-one",
        successStatus: "passed",
        score: { scaled: 1, raw: 2, min: 0, max: 2 },
      }),
    ]);
    expect(store.getState().durable.quizzes[groupId]).toMatchObject({
      status: "completed",
      successStatus: "passed",
    });
    expect(store.getState().requests[groupId]).toBeUndefined();
    await expect(
      store.getState().finishQuizAttempt({ groupId: "quiz__000001" }),
    ).resolves.toBeNull();
    expect(sessionDouble.record).toHaveBeenCalledTimes(4);
  });

  it.each([
    {
      name: "removes a target",
      replacementTargetIds: ["target_00002"],
    },
    {
      name: "reorders targets",
      replacementTargetIds: ["target_00002", "target_00001"],
    },
  ])(
    "records a finishing Quiz against its command registration when an update $name",
    async ({ replacementTargetIds }) => {
      const groupId = scopeAssessmentGroupId("artifact-one", "quiz__000001");
      const firstResult = assessmentResult();
      const secondResult = assessmentResult({ isCorrect: false, score: { scaled: 0 } });
      const firstProblem: AssessmentProblemSnapshot = {
        ...createProblemSnapshot(),
        attemptNumber: 1,
        submitted: true,
        submissionResult: firstResult,
      };
      const secondProblem: AssessmentProblemSnapshot = {
        ...createProblemSnapshot(),
        response: SingleSelectResponseSchema.parse({
          kind: "single-select",
          optionId: "option_00002",
        }),
        attemptNumber: 1,
        submitted: true,
        submissionResult: secondResult,
      };
      const terminalAttempt = createQuizAttempt(groupId, {
        status: "completed",
        currentTargetId: null,
        submittedTargetIds: ["target_00001", "target_00002"],
        finishedAt: "2026-07-16T12:05:00.000Z",
        score: { scaled: 0.5, raw: 1, min: 0, max: 2 },
        successStatus: null,
        resultsByTargetId: {
          target_00001: firstResult,
          target_00002: secondResult,
        },
      });
      const pending = deferred<{
        quizAttempt: QuizAttemptState;
        problemsByTargetId: Record<string, AssessmentProblemSnapshot>;
      }>();
      const sessionDouble = createSessionDouble();
      const store = createAssessmentStore({
        artifactId: "artifact-one",
        assessmentPort: createAssessmentPort({
          quiz: {
            startAttempt: vi.fn(),
            submitQuestion: vi.fn(),
            finishAttempt: () => pending.promise,
          },
        }),
        getLearningEventSession: () => sessionDouble.session,
      });
      const secondIdentity = registrationIdentity({
        authoredBlockId: "block_000002",
        targetId: "target_00002",
      });

      store.getState().register(createRegistration());
      store
        .getState()
        .register(
          createRegistration({ authoredBlockId: "block_000002", targetId: "target_00002" }),
        );
      store.getState().registerQuiz(createQuizRegistration());
      store.setState({
        durable: { problems: {}, quizzes: { [groupId]: createQuizAttempt(groupId) } },
      });
      store.getState().setLocalResponse(registrationIdentity(), { choice: "option_00001" });
      store.getState().setLocalResponse(secondIdentity, { choice: "option_00002" });

      const finishing = store.getState().finishQuizAttempt({ groupId: "quiz__000001" });
      expect(
        store.getState().updateQuiz(createQuizRegistration({ targetIds: replacementTargetIds })),
      ).toBe(true);
      pending.resolve({
        quizAttempt: terminalAttempt,
        problemsByTargetId: {
          target_00001: firstProblem,
          target_00002: secondProblem,
        },
      });

      await expect(finishing).resolves.toEqual(terminalAttempt);
      expect(sessionDouble.record.mock.calls.map(([draft]) => draft)).toEqual([
        answeredInput({
          rootActivityId: ROOT_ACTIVITY_ID,
          targetId: "target_00001",
          definition: assessmentLearningEventDefinition(),
          response: firstProblem.response,
          result: firstResult,
          attemptNumber: 1,
          quiz: { quizId: "quiz__000001", attemptId: "attempt-one" },
        }),
        answeredInput({
          rootActivityId: ROOT_ACTIVITY_ID,
          targetId: "target_00002",
          definition: assessmentLearningEventDefinition(),
          response: secondProblem.response,
          result: secondResult,
          attemptNumber: 1,
          quiz: { quizId: "quiz__000001", attemptId: "attempt-one" },
        }),
        quizCompletedInput({
          rootActivityId: ROOT_ACTIVITY_ID,
          quizId: "quiz__000001",
          attemptId: "attempt-one",
          startedAt: "2026-07-16T12:00:00.000Z",
          finishedAt: "2026-07-16T12:05:00.000Z",
        }),
      ]);
    },
  );

  it.each([
    {
      name: "failed success",
      passingScore: 0.75,
      score: { scaled: 0.5, raw: 1, min: 0, max: 2 },
      successStatus: "failed" as const,
    },
    {
      name: "completion without a threshold",
      passingScore: null,
      score: { scaled: 0.5, raw: 1, min: 0, max: 2 },
      successStatus: null,
    },
  ])("records explicit-finish $name from authoritative state", async (testCase) => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz__000001");
    const terminalAttempt = createQuizAttempt(groupId, {
      status: "completed",
      currentTargetId: null,
      submittedTargetIds: ["target_00001"],
      finishedAt: "2026-07-16T12:05:00.000Z",
      score: testCase.score,
      successStatus: testCase.successStatus,
      resultsByTargetId: { target_00001: assessmentResult() },
    });
    const finishAttempt = vi.fn().mockResolvedValue({
      quizAttempt: terminalAttempt,
      problemsByTargetId: {},
    });
    const sessionDouble = createSessionDouble();
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        quiz: { startAttempt: vi.fn(), submitQuestion: vi.fn(), finishAttempt },
      }),
      getLearningEventSession: () => sessionDouble.session,
    });

    store.getState().register(createRegistration());
    store.getState().registerQuiz(
      createQuizRegistration({
        targetIds: ["target_00001"],
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
    store.getState().setLocalResponse(registrationIdentity(), { choice: "option_00001" });

    await expect(store.getState().finishQuizAttempt({ groupId: "quiz__000001" })).resolves.toEqual(
      terminalAttempt,
    );

    const expectedDrafts: CoreLearningEventInput[] = [
      quizCompletedInput({
        rootActivityId: ROOT_ACTIVITY_ID,
        quizId: "quiz__000001",
        attemptId: "attempt-one",
        startedAt: "2026-07-16T12:00:00.000Z",
        finishedAt: "2026-07-16T12:05:00.000Z",
      }),
    ];
    if (testCase.successStatus !== null) {
      expectedDrafts.push(
        quizSuccessInput({
          rootActivityId: ROOT_ACTIVITY_ID,
          quizId: "quiz__000001",
          attemptId: "attempt-one",
          successStatus: testCase.successStatus,
          score: testCase.score,
        }),
      );
    }
    expect(sessionDouble.record.mock.calls.map(([draft]) => draft)).toEqual(expectedDrafts);
    expect(store.getState().durable.quizzes[groupId]).toEqual(terminalAttempt);

    await expect(
      store.getState().finishQuizAttempt({ groupId: "quiz__000001" }),
    ).resolves.toBeNull();
    expect(sessionDouble.record).toHaveBeenCalledTimes(expectedDrafts.length);
  });

  it.each(["throwing accessor", "invalid builder root"] as const)(
    "retains terminal authority with a %s",
    async (failureMode) => {
      const groupId = scopeAssessmentGroupId("artifact-one", "quiz__000001");
      const terminalAttempt = createQuizAttempt(groupId, {
        status: "completed",
        currentTargetId: null,
        submittedTargetIds: ["target_00001"],
        finishedAt: "2026-07-16T12:05:00.000Z",
        score: { scaled: 1 },
        successStatus: "passed",
        resultsByTargetId: { target_00001: assessmentResult() },
      });
      const record = vi.fn<(statement: CoreLearningEventInput) => void>();
      const invalidSession: LearningEventSession = Object.freeze({
        ...createSessionDouble().session,
        rootActivityId: "not-an-absolute-iri",
        record,
      });
      const getLearningEventSession: () => LearningEventSession | null =
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
        getLearningEventSession: getLearningEventSession,
      });

      store.getState().register(createRegistration());
      store.getState().registerQuiz(
        createQuizRegistration({
          targetIds: ["target_00001"],
          settings: { ...quizSettings, reviewTiming: "after_quiz", passingScore: 0.5 },
        }),
      );
      store.setState({
        durable: {
          problems: {},
          quizzes: { [groupId]: createQuizAttempt(groupId) },
        },
      });
      store.getState().setLocalResponse(registrationIdentity(), { choice: "option_00001" });

      await expect(
        store.getState().finishQuizAttempt({ groupId: "quiz__000001" }),
      ).resolves.toEqual(terminalAttempt);

      expect(store.getState().durable.quizzes[groupId]).toEqual(terminalAttempt);
      expect(store.getState().requests[groupId]).toBeUndefined();
      expect(record).toHaveBeenCalledTimes(failureMode === "invalid builder root" ? 2 : 0);
    },
  );

  it("retains terminal authority when the learning-event recorder fails", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz__000001");
    const terminalAttempt = createQuizAttempt(groupId, {
      status: "completed",
      currentTargetId: null,
      submittedTargetIds: ["target_00001"],
      finishedAt: "2026-07-16T12:05:00.000Z",
      score: { scaled: 1 },
      successStatus: "passed",
      resultsByTargetId: { target_00001: assessmentResult() },
    });
    const { session, record } = createSessionDouble(() => {
      throw new Error("delivery unavailable");
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
      getLearningEventSession: () => session,
    });

    store.getState().register(createRegistration());
    store.getState().registerQuiz(
      createQuizRegistration({
        targetIds: ["target_00001"],
        settings: { ...quizSettings, reviewTiming: "after_quiz", passingScore: 0.5 },
      }),
    );
    store.setState({
      durable: {
        problems: {},
        quizzes: { [groupId]: createQuizAttempt(groupId) },
      },
    });
    store.getState().setLocalResponse(registrationIdentity(), { choice: "option_00001" });

    await expect(store.getState().finishQuizAttempt({ groupId: "quiz__000001" })).resolves.toEqual(
      terminalAttempt,
    );
    await flushPromises();

    expect(record).toHaveBeenCalledTimes(2);
    expect(session.getState()).toMatchObject({ status: "dormant" });
    expect(store.getState().durable.quizzes[groupId]).toEqual(terminalAttempt);
    expect(store.getState().requests[groupId]).toBeUndefined();
  });

  it("rejects a still-in-progress explicit-finish response without recording", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz__000001");
    const getLearningEventSession = vi.fn();
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
      getLearningEventSession: getLearningEventSession,
    });

    store.getState().register(createRegistration());
    store.getState().registerQuiz(createQuizRegistration({ targetIds: ["target_00001"] }));
    store.setState({
      durable: {
        problems: {},
        quizzes: { [groupId]: createQuizAttempt(groupId) },
      },
    });
    store.getState().setLocalResponse(registrationIdentity(), { choice: "option_00001" });

    await expect(
      store.getState().finishQuizAttempt({ groupId: "quiz__000001" }),
    ).resolves.toBeNull();

    expect(store.getState().durable.quizzes[groupId]?.status).toBe("in_progress");
    expect(store.getState().requests[groupId]).toMatchObject({
      operation: "quiz-finish",
      status: "error",
      error: "Quiz finish must return a terminal attempt",
    });
    expect(getLearningEventSession).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "success disagreeing with an invalidly high scaled score",
      passingScore: 0.5,
      score: { scaled: 1 },
      successStatus: "failed" as const,
      error: "Quiz host response successStatus does not match passingScore",
    },
    {
      name: "success disagreeing with threshold",
      passingScore: 0.75,
      score: { scaled: 0.5, raw: 1, min: 0, max: 2 },
      successStatus: "passed" as const,
      error: "Quiz host response successStatus does not match passingScore",
    },
    {
      name: "missing success on a new terminal transition",
      passingScore: 0.75,
      score: { scaled: 0.5, raw: 1, min: 0, max: 2 },
      successStatus: null,
      error: "Quiz host response newly terminal successStatus is required",
    },
    {
      name: "success without a pass criterion",
      passingScore: null,
      score: { scaled: 0.5, raw: 1, min: 0, max: 2 },
      successStatus: "passed" as const,
      error: "Quiz host response successStatus requires passingScore",
    },
  ])("rejects a newly terminal Quiz with $name without committing", async (testCase) => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz__000001");
    const current = createQuizAttempt(groupId);
    const terminal = createQuizAttempt(groupId, {
      status: "completed",
      currentTargetId: null,
      submittedTargetIds: ["target_00001", "target_00002"],
      finishedAt: "2026-07-16T12:05:00.000Z",
      score: testCase.score,
      successStatus: testCase.successStatus,
      resultsByTargetId: {
        target_00001: assessmentResult(),
        target_00002: assessmentResult(),
      },
    });
    const getLearningEventSession = vi.fn();
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
      getLearningEventSession: getLearningEventSession,
    });
    const secondIdentity = registrationIdentity({
      authoredBlockId: "block_000002",
      targetId: "target_00002",
    });
    store.getState().register(createRegistration());
    store
      .getState()
      .register(createRegistration({ authoredBlockId: "block_000002", targetId: "target_00002" }));
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
    store.getState().setLocalResponse(registrationIdentity(), { choice: "option_00001" });
    store.getState().setLocalResponse(secondIdentity, { choice: "option_00002" });

    await expect(
      store.getState().finishQuizAttempt({ groupId: "quiz__000001" }),
    ).resolves.toBeNull();

    expect(store.getState().durable.quizzes[groupId]).toEqual(current);
    expect(store.getState().requests[groupId]).toMatchObject({
      operation: "quiz-finish",
      status: "error",
      error: testCase.error,
    });
    expect(getLearningEventSession).not.toHaveBeenCalled();
  });

  it("does not create a false terminal Quiz state when expiry finalization rejects", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz__000001");
    const finishAttempt = vi.fn().mockRejectedValue(new Error("timeout persistence failed"));
    const getLearningEventSession = vi.fn();
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        quiz: { startAttempt: vi.fn(), submitQuestion: vi.fn(), finishAttempt },
      }),
      getLearningEventSession: getLearningEventSession,
    });

    store.getState().register(createRegistration());
    store.getState().registerQuiz(
      createQuizRegistration({
        targetIds: ["target_00001"],
        settings: { ...quizSettings, reviewTiming: "after_quiz" },
      }),
    );
    store.setState({
      durable: { problems: {}, quizzes: { [groupId]: createQuizAttempt(groupId) } },
    });
    store.getState().setLocalResponse(registrationIdentity(), { choice: "option_00001" });

    await expect(
      store.getState().expireQuizAttempt({ groupId: "quiz__000001" }),
    ).resolves.toBeNull();
    expect(store.getState().durable.quizzes[groupId]?.status).toBe("in_progress");
    expect(store.getState().requests[groupId]).toMatchObject({
      operation: "quiz-expire",
      status: "error",
      error: "timeout persistence failed",
    });
    expect(getLearningEventSession).not.toHaveBeenCalled();
  });

  it("reveals completed full-review Quiz answers only from authoritative host state", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz__000001");
    const revealedAttempt = createQuizAttempt(groupId, {
      status: "completed",
      currentTargetId: null,
      submittedTargetIds: ["target_00001"],
      finishedAt: "2026-07-16T12:05:00.000Z",
      score: { scaled: 1 },
      resultsByTargetId: { target_00001: assessmentResult() },
      answerReviewAuthorized: true,
    });
    const revealAnswers = vi.fn().mockResolvedValue({
      quizAttempt: revealedAttempt,
      problemsByTargetId: {},
    });
    const getLearningEventSession = vi.fn();
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
      getLearningEventSession: getLearningEventSession,
    });

    store.getState().register(createRegistration());
    store.getState().registerQuiz(
      createQuizRegistration({
        targetIds: ["target_00001"],
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
            score: { scaled: 1 },
          }),
        },
      },
    });

    await expect(store.getState().revealQuizAnswers({ groupId: "quiz__000001" })).resolves.toEqual(
      revealedAttempt,
    );
    expect(revealAnswers).toHaveBeenCalledWith({ attemptId: "attempt-one", groupId });
    expect(store.getState().durable.quizzes[groupId]).toEqual(revealedAttempt);
    expect(getLearningEventSession).not.toHaveBeenCalled();
  });

  it("prevents binary item answers from being reconstructed in result-only review", () => {
    const result = assessmentResult({
      isCorrect: false,
      score: { scaled: 0.5 },
      items: {
        mulopt_00001: {
          correct: false,
          given: false,
          expected: true,
        },
        hotsp_000001: {
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
      score: { scaled: 0.5 },
      feedback: null,
      items: {},
    });

    const fullReview = redactQuizResult(result, "full_review", true);
    expect(AssessmentResultSchema.parse(fullReview)).toEqual(result);
  });

  it("rejects a host attempt for another group without changing durable Quiz state", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz__000001");
    const getLearningEventSession = vi.fn();
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        quiz: {
          startAttempt: vi.fn().mockResolvedValue({
            quizAttempt: createQuizAttempt(scopeAssessmentGroupId("artifact-one", "quiz__000003")),
            problemsByTargetId: {},
          }),
          submitQuestion: vi.fn(),
          finishAttempt: vi.fn(),
        },
      }),
      getLearningEventSession: getLearningEventSession,
    });
    store.getState().registerQuiz(createQuizRegistration());

    await expect(
      store.getState().startQuizAttempt({ groupId: "quiz__000001" }),
    ).resolves.toBeNull();
    expect(store.getState().durable.quizzes).toEqual({});
    expect(store.getState().requests[groupId]).toMatchObject({
      operation: "quiz-start",
      status: "error",
      error: "Quiz host response groupId does not match the registered group",
    });
    expect(getLearningEventSession).not.toHaveBeenCalled();
  });

  it("preserves Quiz attempt and problem state when question submission rejects", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz__000001");
    const attempt = createQuizAttempt(groupId);
    const getLearningEventSession = vi.fn();
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        quiz: {
          startAttempt: vi.fn(),
          submitQuestion: vi.fn().mockRejectedValue(new Error("question rejected")),
          finishAttempt: vi.fn(),
        },
      }),
      getLearningEventSession: getLearningEventSession,
    });
    const problemId = scopeAssessmentProblemId("artifact-one", "block_000001");
    store.getState().register(createRegistration());
    store.getState().registerQuiz(createQuizRegistration());
    store.setState({ durable: { problems: {}, quizzes: { [groupId]: attempt } } });
    store.getState().setLocalResponse(registrationIdentity(), { choice: "option_00001" });

    await expect(
      store.getState().submitQuizQuestion({ groupId: "quiz__000001" }, registrationIdentity()),
    ).resolves.toBeNull();
    expect(store.getState().durable.quizzes[groupId]).toEqual(attempt);
    expect(store.getState().durable.problems[problemId]).toMatchObject({
      response: { kind: "single-select", optionId: "option_00001" },
      attemptNumber: 0,
      submitted: false,
      submissionResult: null,
    });
    expect(getLearningEventSession).not.toHaveBeenCalled();
  });

  it("rejects a Quiz question response for another host attempt", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz__000001");
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
    store.getState().setLocalResponse(registrationIdentity(), { choice: "option_00001" });

    await expect(
      store.getState().submitQuizQuestion({ groupId: "quiz__000001" }, registrationIdentity()),
    ).resolves.toBeNull();
    expect(store.getState().durable.quizzes[groupId]).toEqual(current);
    expect(store.getState().requests[groupId]).toMatchObject({
      status: "error",
      error: "Quiz host response attemptId does not match the current attempt",
    });
  });

  it("does not replay a stale terminal Quiz response after a newer terminal commit", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz__000001");
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
      submittedTargetIds: ["target_00001"],
      finishedAt: "2026-07-16T12:05:00.000Z",
      score: { scaled: 1 },
      successStatus: "passed",
      resultsByTargetId: { target_00001: result },
    });
    const submitQuestion = vi
      .fn()
      .mockImplementationOnce(() => stale.promise)
      .mockResolvedValueOnce({
        quizAttempt: terminalAttempt,
        problemsByTargetId: { target_00001: currentProblem },
      });
    const sessionDouble = createSessionDouble();
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        quiz: {
          startAttempt: vi.fn(),
          submitQuestion,
          finishAttempt: vi.fn(),
        },
      }),
      getLearningEventSession: () => sessionDouble.session,
    });
    const identity = registrationIdentity();

    store.getState().register(createRegistration());
    store.getState().registerQuiz(
      createQuizRegistration({
        targetIds: ["target_00001"],
        settings: { ...quizSettings, passingScore: 0.5 },
      }),
    );
    store.setState({
      durable: {
        problems: {},
        quizzes: { [groupId]: createQuizAttempt(groupId) },
      },
    });
    store.getState().setLocalResponse(identity, { choice: "option_00001" });

    const staleSubmission = store
      .getState()
      .submitQuizQuestion({ groupId: "quiz__000001" }, identity);
    await expect(
      store.getState().submitQuizQuestion({ groupId: "quiz__000001" }, identity),
    ).resolves.toEqual(terminalAttempt);
    stale.resolve({
      quizAttempt: terminalAttempt,
      problemsByTargetId: { target_00001: staleProblem },
    });
    await expect(staleSubmission).resolves.toBeNull();

    expect(sessionDouble.record.mock.calls.map(([draft]) => draft)).toEqual([
      answeredInput({
        rootActivityId: ROOT_ACTIVITY_ID,
        targetId: "target_00001",
        definition: assessmentLearningEventDefinition(),
        response: { kind: "single-select", optionId: "option_00001" },
        result,
        attemptNumber: 2,
        quiz: { quizId: "quiz__000001", attemptId: "attempt-one" },
      }),
      quizCompletedInput({
        rootActivityId: ROOT_ACTIVITY_ID,
        quizId: "quiz__000001",
        attemptId: "attempt-one",
        startedAt: "2026-07-16T12:00:00.000Z",
        finishedAt: "2026-07-16T12:05:00.000Z",
      }),
      quizSuccessInput({
        rootActivityId: ROOT_ACTIVITY_ID,
        quizId: "quiz__000001",
        attemptId: "attempt-one",
        successStatus: "passed",
        score: { scaled: 1 },
      }),
    ]);
  });

  it("preserves the in-progress Quiz when explicit finish rejects", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz__000001");
    const current = createQuizAttempt(groupId);
    const getLearningEventSession = vi.fn();
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        quiz: {
          startAttempt: vi.fn(),
          submitQuestion: vi.fn(),
          finishAttempt: vi.fn().mockRejectedValue(new Error("finish rejected")),
        },
      }),
      getLearningEventSession: getLearningEventSession,
    });
    const secondIdentity = registrationIdentity({
      authoredBlockId: "block_000002",
      targetId: "target_00002",
    });
    store.getState().register(createRegistration());
    store
      .getState()
      .register(createRegistration({ authoredBlockId: "block_000002", targetId: "target_00002" }));
    store.getState().registerQuiz(createQuizRegistration());
    store.setState({ durable: { problems: {}, quizzes: { [groupId]: current } } });
    store.getState().setLocalResponse(registrationIdentity(), { choice: "option_00001" });
    store.getState().setLocalResponse(secondIdentity, { choice: "option_00002" });

    await expect(
      store.getState().finishQuizAttempt({ groupId: "quiz__000001" }),
    ).resolves.toBeNull();
    expect(store.getState().durable.quizzes[groupId]).toEqual(current);
    expect(store.getState().requests[groupId]).toMatchObject({
      operation: "quiz-finish",
      status: "error",
      error: "finish rejected",
    });
    expect(getLearningEventSession).not.toHaveBeenCalled();
  });

  it("records authoritative failed success for an expired attempt", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz__000001");
    const result = assessmentResult({ isCorrect: false, score: { scaled: 0 } });
    const expired = createQuizAttempt(groupId, {
      status: "expired",
      currentTargetId: null,
      submittedTargetIds: ["target_00001"],
      finishedAt: "2026-07-16T12:05:00.000Z",
      score: { scaled: 0 },
      successStatus: "failed",
      resultsByTargetId: { target_00001: result },
    });
    const finishAttempt = vi.fn().mockResolvedValue({
      quizAttempt: expired,
      problemsByTargetId: {},
    });
    const sessionDouble = createSessionDouble();
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        quiz: { startAttempt: vi.fn(), submitQuestion: vi.fn(), finishAttempt },
      }),
      getLearningEventSession: () => sessionDouble.session,
    });
    store.getState().register(createRegistration());
    store.getState().registerQuiz(
      createQuizRegistration({
        targetIds: ["target_00001"],
        settings: { ...quizSettings, reviewTiming: "after_quiz", passingScore: 0.5 },
      }),
    );
    store.setState({
      durable: { problems: {}, quizzes: { [groupId]: createQuizAttempt(groupId) } },
    });
    store.getState().setLocalResponse(registrationIdentity(), { choice: "option_00001" });

    await expect(store.getState().expireQuizAttempt({ groupId: "quiz__000001" })).resolves.toEqual(
      expired,
    );
    expect(finishAttempt).toHaveBeenCalledWith({
      attemptId: "attempt-one",
      groupId,
      responsesByTargetId: {
        target_00001: { kind: "single-select", optionId: "option_00001" },
      },
    });
    expect(store.getState().durable.quizzes[groupId]).toEqual(expired);
    expect(sessionDouble.record.mock.calls.map(([draft]) => draft)).toEqual([
      quizCompletedInput({
        rootActivityId: ROOT_ACTIVITY_ID,
        quizId: "quiz__000001",
        attemptId: "attempt-one",
        startedAt: "2026-07-16T12:00:00.000Z",
        finishedAt: "2026-07-16T12:05:00.000Z",
      }),
      quizSuccessInput({
        rootActivityId: ROOT_ACTIVITY_ID,
        quizId: "quiz__000001",
        attemptId: "attempt-one",
        successStatus: "failed",
        score: { scaled: 0 },
      }),
    ]);
  });

  it("records timer-expiry's intermediate answer once before completion", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz__000001");
    const result = assessmentResult();
    const problem = {
      ...createProblemSnapshot(),
      attemptNumber: 1,
      submitted: true,
      submissionResult: result,
    };
    const submittedAttempt = createQuizAttempt(groupId, {
      currentTargetId: null,
      submittedTargetIds: ["target_00001"],
      resultsByTargetId: { target_00001: result },
    });
    const expiredAttempt = createQuizAttempt(groupId, {
      status: "expired",
      currentTargetId: null,
      submittedTargetIds: ["target_00001"],
      finishedAt: "2026-07-16T12:05:00.000Z",
      score: { scaled: 1 },
      resultsByTargetId: { target_00001: result },
    });
    const submitQuestion = vi.fn().mockResolvedValue({
      quizAttempt: submittedAttempt,
      problemsByTargetId: { target_00001: problem },
    });
    const finishAttempt = vi.fn().mockResolvedValue({
      quizAttempt: expiredAttempt,
      problemsByTargetId: { target_00001: problem },
    });
    const sessionDouble = createSessionDouble();
    const getLearningEventSession = vi.fn(() => sessionDouble.session);
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        quiz: { startAttempt: vi.fn(), submitQuestion, finishAttempt },
      }),
      getLearningEventSession: getLearningEventSession,
    });

    store.getState().register(createRegistration());
    store.getState().registerQuiz(
      createQuizRegistration({
        targetIds: ["target_00001"],
      }),
    );
    store.setState({
      durable: {
        problems: {},
        quizzes: { [groupId]: createQuizAttempt(groupId) },
      },
    });
    store.getState().setLocalResponse(registrationIdentity(), { choice: "option_00001" });

    await expect(store.getState().expireQuizAttempt({ groupId: "quiz__000001" })).resolves.toEqual(
      expiredAttempt,
    );

    expect(submitQuestion).toHaveBeenCalledOnce();
    expect(finishAttempt).toHaveBeenCalledOnce();
    expect(getLearningEventSession).toHaveBeenCalledTimes(2);
    expect(sessionDouble.record.mock.calls.map(([draft]) => draft)).toEqual([
      answeredInput({
        rootActivityId: ROOT_ACTIVITY_ID,
        targetId: "target_00001",
        definition: assessmentLearningEventDefinition(),
        response: { kind: "single-select", optionId: "option_00001" },
        result,
        attemptNumber: 1,
        quiz: { quizId: "quiz__000001", attemptId: "attempt-one" },
      }),
      quizCompletedInput({
        rootActivityId: ROOT_ACTIVITY_ID,
        quizId: "quiz__000001",
        attemptId: "attempt-one",
        startedAt: "2026-07-16T12:00:00.000Z",
        finishedAt: "2026-07-16T12:05:00.000Z",
      }),
    ]);
  });

  it("preserves a completed Quiz when answer reveal rejects", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz__000001");
    const completed = createQuizAttempt(groupId, {
      status: "completed",
      currentTargetId: null,
      finishedAt: "2026-07-16T12:05:00.000Z",
      score: { scaled: 0 },
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
        targetIds: ["target_00001"],
        settings: { ...quizSettings, reviewDetail: "full_review" },
      }),
    );
    store.setState({ durable: { problems: {}, quizzes: { [groupId]: completed } } });

    await expect(
      store.getState().revealQuizAnswers({ groupId: "quiz__000001" }),
    ).resolves.toBeNull();
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
      response: { kind: "single-select" as const, optionId: "option_00002" },
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
    const problemId = scopeAssessmentProblemId("artifact-one", "block_000001");

    store.getState().register(registration);
    store.getState().setLocalResponse(identity, { choice: "option_00002" });

    await expect(store.getState().check(identity)).resolves.toEqual(assessmentResult());
    expect(check).toHaveBeenCalledWith({
      problemId,
      targetId: "target_00001",
      interactionKind: "single-select",
      response: { kind: "single-select", optionId: "option_00002" },
      expectedAttemptNumber: 0,
    });
    expect(store.getState().durable.problems[problemId]).toEqual(canonicalProblem);
    expect(store.getState().requests[problemId]).toBeUndefined();
  });

  it("rejects a canonical standalone outcome whose response kind mismatches registration", async () => {
    const check = vi.fn().mockResolvedValue({
      problem: {
        ...createProblemSnapshot(),
        response: { kind: "multi-select", optionIds: ["option_00002"] },
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
    const problemId = scopeAssessmentProblemId("artifact-one", "block_000001");

    store.getState().register(registration);
    store.getState().setLocalResponse(identity, { choice: "option_00002" });
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
            checkResult: assessmentResult({ isCorrect: false, score: { scaled: 0 } }),
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
    const problemId = scopeAssessmentProblemId("artifact-one", "block_000001");

    store.getState().register(registration);
    store.getState().setLocalResponse(identity, { choice: "option_00001" });
    await store.getState().check(identity);
    await expect(store.getState().check(identity)).resolves.toBeNull();

    expect(store.getState().durable.problems[problemId]).toMatchObject({
      attemptNumber: 1,
      checkResult: assessmentResult({ isCorrect: false, score: { scaled: 0 } }),
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
    const problemId = scopeAssessmentProblemId("artifact-one", "block_000001");

    store.getState().register(
      createRegistration({
        config: {
          ...createRegistration().config,
          settings: { ...createRegistration().config.settings, maxAttempts: 1 },
        },
      }),
    );
    store.getState().setLocalResponse(identity, { choice: "option_00001" });

    await expect(store.getState().submit(identity)).resolves.toBeNull();
    expect(store.getState().durable.problems[problemId]).toMatchObject({
      response: { kind: "single-select", optionId: "option_00001" },
      attemptNumber: 0,
      submitted: false,
      submissionResult: null,
    });

    await expect(store.getState().submit(identity)).resolves.toEqual(assessmentResult());
    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit).toHaveBeenLastCalledWith({
      problemId,
      targetId: "target_00001",
      interactionKind: "single-select",
      response: { kind: "single-select", optionId: "option_00001" },
      expectedAttemptNumber: 0,
    });
    expect(store.getState().durable.problems[problemId]).toEqual(canonicalProblem);
    expect(store.getState().reset(identity)).toBe(false);
    expect(store.getState().setLocalResponse(identity, { choice: "option_00002" })).toBe(false);
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
        score: { scaled: 0.25 },
        items: {
          privat_00001: {
            correct: false,
            expected: "PRIVATE_ANSWER",
            given: "PRIVATE_RESPONSE",
          },
        },
      }),
    };
    let store!: ReturnType<typeof createAssessmentStore>;
    let problemAtRecord: AssessmentProblemSnapshot | undefined;
    const sessionDouble = createSessionDouble(() => {
      problemAtRecord =
        store.getState().durable.problems[scopeAssessmentProblemId("artifact-one", "block_000001")];
    });
    store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        submit: vi.fn().mockResolvedValue({ problem: canonicalProblem }),
      }),
      getLearningEventSession: () => sessionDouble.session,
    });
    const identity = registrationIdentity();
    const learningEventDefinition = assessmentLearningEventDefinition();
    const registrationConfig = {
      ...createRegistration().config,
      learningEventDefinition,
    };

    store.getState().register(
      createRegistration({
        config: registrationConfig,
      }),
    );
    store.getState().setLocalResponse(identity, { choice: "option_00001" });

    await expect(store.getState().submit(identity)).resolves.toEqual(
      canonicalProblem.submissionResult,
    );

    expect(problemAtRecord).toEqual(canonicalProblem);
    expect(sessionDouble.record).toHaveBeenCalledExactlyOnceWith(
      answeredInput({
        rootActivityId: ROOT_ACTIVITY_ID,
        targetId: "target_00001",
        definition: learningEventDefinition,
        response: canonicalProblem.response,
        result: canonicalProblem.submissionResult,
        attemptNumber: 3,
      }),
    );
    expect(sessionDouble.record.mock.calls[0]?.[0]).toMatchObject({
      definition: expect.not.objectContaining({ correctResponsesPattern: expect.anything() }),
    });
    expect(JSON.stringify(sessionDouble.record.mock.calls)).not.toContain("PRIVATE_");
  });

  it("rejects a submitted standalone host outcome without a positive attempt", async () => {
    const sessionDouble = createSessionDouble();
    const invalidProblem = {
      ...createProblemSnapshot(),
      submitted: true as const,
      submissionResult: assessmentResult(),
    };
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        submit: vi.fn().mockResolvedValue({ problem: invalidProblem }),
      }),
      getLearningEventSession: () => sessionDouble.session,
    });
    const identity = registrationIdentity();
    const problemId = scopeAssessmentProblemId("artifact-one", "block_000001");

    store.getState().register(createRegistration());
    store.getState().setLocalResponse(identity, { choice: "option_00001" });

    await expect(store.getState().submit(identity)).resolves.toBeNull();

    expect(store.getState().durable.problems[problemId]).toMatchObject({
      attemptNumber: 0,
      submitted: false,
      submissionResult: null,
    });
    expect(store.getState().requests[problemId]).toMatchObject({
      status: "error",
      error: "Submitted assessment host response attemptNumber must be positive",
    });
    expect(sessionDouble.record).not.toHaveBeenCalled();
  });

  it("resolves the current Learning Event session when a standalone answer becomes authoritative", async () => {
    const pending = deferred<{ problem: AssessmentProblemSnapshot }>();
    const sessionDouble = createSessionDouble();
    let currentSession: LearningEventSession | null = null;
    const getLearningEventSession = vi.fn(() => currentSession);
    const canonicalProblem = {
      ...createProblemSnapshot(),
      attemptNumber: 1,
      submitted: true as const,
      submissionResult: assessmentResult(),
    };
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({ submit: () => pending.promise }),
      getLearningEventSession: getLearningEventSession,
    });
    const identity = registrationIdentity();

    store.getState().register(createRegistration());
    store.getState().setLocalResponse(identity, { choice: "option_00001" });
    const submission = store.getState().submit(identity);
    expect(getLearningEventSession).not.toHaveBeenCalled();

    currentSession = sessionDouble.session;
    pending.resolve({ problem: canonicalProblem });
    await expect(submission).resolves.toEqual(canonicalProblem.submissionResult);

    expect(getLearningEventSession).toHaveBeenCalledOnce();
    expect(sessionDouble.record).toHaveBeenCalledOnce();
  });

  it("keeps a successful standalone submission when Learning Event recording throws", async () => {
    const canonicalProblem = {
      ...createProblemSnapshot(),
      attemptNumber: 1,
      submitted: true as const,
      submissionResult: assessmentResult(),
    };
    const sessionDouble = createSessionDouble(() => {
      throw new Error("recording unavailable");
    });
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        submit: vi.fn().mockResolvedValue({ problem: canonicalProblem }),
      }),
      getLearningEventSession: () => sessionDouble.session,
    });
    const identity = registrationIdentity();
    const problemId = scopeAssessmentProblemId("artifact-one", "block_000001");

    store.getState().register(createRegistration());
    store.getState().setLocalResponse(identity, { choice: "option_00001" });

    await expect(store.getState().submit(identity)).resolves.toEqual(
      canonicalProblem.submissionResult,
    );
    expect(store.getState().durable.problems[problemId]).toEqual(canonicalProblem);
    expect(store.getState().requests[problemId]).toBeUndefined();
  });

  it("does not record a standalone response without an authoritative result", async () => {
    const sessionDouble = createSessionDouble();
    const canonicalProblem = {
      ...createProblemSnapshot(),
      attemptNumber: 1,
    };
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        submit: vi.fn().mockResolvedValue({ problem: canonicalProblem }),
      }),
      getLearningEventSession: () => sessionDouble.session,
    });
    const identity = registrationIdentity();

    store.getState().register(createRegistration());
    store.getState().setLocalResponse(identity, { choice: "option_00001" });

    await expect(store.getState().submit(identity)).resolves.toBeNull();
    expect(sessionDouble.record).not.toHaveBeenCalled();
  });

  it("keeps non-authoritative assessment operations out of Learning Events", async () => {
    const sessionDouble = createSessionDouble();
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
            correctOptionId: "option_00002",
            feedbackByOptionId: {},
          },
        }),
      }),
      getLearningEventSession: () => sessionDouble.session,
    });
    const identity = registrationIdentity();

    store.getState().register(createRegistration());
    expect(store.getState().setLocalResponse(identity, { choice: "option_00001" })).toBe(true);
    await expect(store.getState().check(identity)).resolves.toEqual(assessmentResult());
    await expect(store.getState().revealAnswer(identity)).resolves.toMatchObject({
      answerKey: { kind: "single-select", correctOptionId: "option_00002" },
    });
    expect(store.getState().reset(identity)).toBe(true);

    expect(sessionDouble.record).not.toHaveBeenCalled();
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
            submissionResult: assessmentResult({ isCorrect: false, score: { scaled: 0 } }),
          },
        }),
      }),
    });
    const identity = registrationIdentity();
    const problemId = scopeAssessmentProblemId("artifact-one", "block_000001");

    store.getState().register(
      createRegistration({
        config: {
          ...createRegistration().config,
          settings: { ...createRegistration().config.settings, maxAttempts: 2 },
        },
      }),
    );
    store.getState().setLocalResponse(identity, { choice: "option_00001" });
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
    const problemId = scopeAssessmentProblemId("artifact-one", "block_000001");

    store.getState().register(createRegistration());
    const revealPromise = store.getState().revealHint(identity);

    expect(revealHint).toHaveBeenCalledWith({
      problemId,
      targetId: "target_00001",
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
    const sessionDouble = createSessionDouble(() => {
      hintsAtRecord =
        store.getState().durable.problems[scopeAssessmentProblemId("artifact-one", "block_000001")]
          ?.hintsShown;
    });
    store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({ revealHint: () => pending.promise }),
      getLearningEventSession: () => sessionDouble.session,
    });
    const identity = registrationIdentity();
    const learningEventDefinition = assessmentLearningEventDefinition();
    const registrationConfig = {
      ...createRegistration().config,
      learningEventDefinition,
    };

    store.getState().register(
      createRegistration({
        config: registrationConfig,
      }),
    );
    const reveal = store.getState().revealHint(identity);
    expect(sessionDouble.record).not.toHaveBeenCalled();

    pending.resolve({ problem: { ...createProblemSnapshot(), hintsShown: 1 } });
    await expect(reveal).resolves.toBe(true);

    expect(hintsAtRecord).toBe(1);
    expect(sessionDouble.record).toHaveBeenCalledExactlyOnceWith(
      hintInput({
        rootActivityId: ROOT_ACTIVITY_ID,
        targetId: "target_00001",
        definition: learningEventDefinition,
        hintNumber: 1,
      }),
    );
  });

  it("does not record a persisted hint when authoritative count does not increase", async () => {
    const sessionDouble = createSessionDouble();
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        revealHint: vi.fn().mockResolvedValue({
          problem: { ...createProblemSnapshot(), hintsShown: 1 },
        }),
      }),
      getLearningEventSession: () => sessionDouble.session,
    });
    const identity = registrationIdentity();
    const problemId = scopeAssessmentProblemId("artifact-one", "block_000001");

    store.getState().register(createRegistration());
    store.setState({
      durable: {
        problems: { [problemId]: { ...createProblemSnapshot(), hintsShown: 1 } },
        quizzes: {},
      },
    });

    await expect(store.getState().revealHint(identity)).resolves.toBe(true);

    expect(store.getState().durable.problems[problemId]?.hintsShown).toBe(1);
    expect(sessionDouble.record).not.toHaveBeenCalled();
  });

  it("does not record a locally revealed hint without persistence authority", async () => {
    const sessionDouble = createSessionDouble();
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort(),
      getLearningEventSession: () => sessionDouble.session,
    });
    const identity = registrationIdentity();

    store.getState().register(createRegistration());

    await expect(store.getState().revealHint(identity)).resolves.toBe(true);
    expect(sessionDouble.record).not.toHaveBeenCalled();
  });

  it("keeps a persisted hint reveal when Learning Event recording throws", async () => {
    const sessionDouble = createSessionDouble(() => {
      throw new Error("recording unavailable");
    });
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({
        revealHint: vi.fn().mockResolvedValue({
          problem: { ...createProblemSnapshot(), hintsShown: 1 },
        }),
      }),
      getLearningEventSession: () => sessionDouble.session,
    });
    const identity = registrationIdentity();
    const problemId = scopeAssessmentProblemId("artifact-one", "block_000001");

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
    const problemId = scopeAssessmentProblemId("artifact-one", "block_000001");

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
    const sessionDouble = createSessionDouble();
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({ revealHint: () => stale.promise }),
      getLearningEventSession: () => sessionDouble.session,
    });
    const identity = registrationIdentity();
    const problemId = scopeAssessmentProblemId("artifact-one", "block_000001");

    store.getState().register(createRegistration());
    const staleReveal = store.getState().revealHint(identity);
    store.getState().setLocalResponse(identity, { choice: "option_00001" });
    stale.resolve({ problem: { ...createProblemSnapshot(), hintsShown: 1 } });

    await expect(staleReveal).resolves.toBe(false);
    expect(store.getState().durable.problems[problemId]?.hintsShown).toBe(0);
    expect(sessionDouble.record).not.toHaveBeenCalled();
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
    const problemId = scopeAssessmentProblemId("artifact-one", "block_000001");

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
        answerKey: {
          kind: "single-select",
          correctOptionId: "option_00002",
          feedbackByOptionId: {},
        },
      })
      .mockRejectedValueOnce(new Error("denied"));
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({ revealAnswer }),
    });
    const identity = registrationIdentity();
    const problemId = scopeAssessmentProblemId("artifact-one", "block_000001");

    store.getState().register(createRegistration());
    store.getState().setLocalResponse(identity, { choice: "option_00001" });

    const reveal = await store.getState().revealAnswer(identity);
    expect(reveal).toEqual({
      answerKey: { kind: "single-select", correctOptionId: "option_00002", feedbackByOptionId: {} },
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

    expect(
      store.getState().setLocalResponse(registrationIdentity(), { choice: "option_00001" }),
    ).toBe(false);
    store.getState().register(createRegistration());
    expect(store.getState().setLocalResponse(wrongIdentity, { choice: "option_00001" })).toBe(
      false,
    );
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
        toContractResponse: () =>
          AssessmentResponseValueSchema.parse({
            kind: "multi-select",
            optionIds: ["option_00001"],
          }),
      },
    });

    store.getState().register(registration);

    expect(
      store.getState().setLocalResponse(registrationIdentity(), { choice: "option_00001" }),
    ).toBe(false);
    expect(store.getState().durable.problems).toEqual({});
  });

  it("makes an in-flight check inert when the learner changes the response", async () => {
    const pending = deferred<{ problem: AssessmentProblemSnapshot }>();
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({ check: () => pending.promise }),
    });
    const identity = registrationIdentity();
    const problemId = scopeAssessmentProblemId("artifact-one", "block_000001");

    store.getState().register(createRegistration());
    store.getState().setLocalResponse(identity, { choice: "option_00001" });
    const checkPromise = store.getState().check(identity);
    expect(store.getState().requests[problemId]?.status).toBe("pending");

    store.getState().setLocalResponse(identity, { choice: "option_00002" });
    pending.resolve({
      problem: { ...createProblemSnapshot(), attemptNumber: 1, checkResult: assessmentResult() },
    });

    await expect(checkPromise).resolves.toBeNull();
    expect(store.getState().durable.problems[problemId]).toMatchObject({
      response: { kind: "single-select", optionId: "option_00002" },
      attemptNumber: 0,
      checkResult: null,
    });
    expect(store.getState().requests[problemId]).toBeUndefined();
  });

  it("allows only the newest overlapping submit request to commit", async () => {
    const older = deferred<{ problem: AssessmentProblemSnapshot }>();
    const newer = deferred<{ problem: AssessmentProblemSnapshot }>();
    const submit = vi.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const sessionDouble = createSessionDouble();
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort({ submit }),
      getLearningEventSession: () => sessionDouble.session,
    });
    const identity = registrationIdentity();
    const problemId = scopeAssessmentProblemId("artifact-one", "block_000001");

    store.getState().register(createRegistration());
    store.getState().setLocalResponse(identity, { choice: "option_00001" });
    const olderPromise = store.getState().submit(identity);
    const newerPromise = store.getState().submit(identity);

    expect(store.getState().durable.problems[problemId]).toMatchObject({
      attemptNumber: 0,
      submitted: false,
      submissionResult: null,
    });
    expect(sessionDouble.record).not.toHaveBeenCalled();

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
    expect(sessionDouble.record).toHaveBeenCalledOnce();
  });

  it("records predictable transient errors when the port or an optional capability is absent", async () => {
    const problemId = scopeAssessmentProblemId("artifact-one", "block_000001");
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz__000001");
    const withoutPort = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: null,
    });
    withoutPort.getState().register(createRegistration());
    withoutPort.getState().setLocalResponse(registrationIdentity(), { choice: "option_00001" });

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
      withoutPort.getState().startQuizAttempt({ groupId: "quiz__000001" }),
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
    withoutCheck.getState().setLocalResponse(registrationIdentity(), { choice: "option_00001" });
    await expect(withoutCheck.getState().check(registrationIdentity())).resolves.toBeNull();
    expect(
      withoutCheck.getState().requests[scopeAssessmentProblemId("artifact-two", "block_000001")],
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
    expect(scopeAssessmentProblemId("artifact-one", "block_000001")).toBe(
      "artifact:artifact-one/block:block_000001",
    );
    expect(scopeAssessmentGroupId("artifact-one", "quiz__000001")).toBe(
      "artifact:artifact-one/group:quiz__000001",
    );
    expect(scopeAssessmentProblemId("artifact-two", "block_000001")).not.toBe(
      scopeAssessmentProblemId("artifact-one", "block_000001"),
    );
    expect(scopeAssessmentGroupId("artifact-two", "quiz__000001")).not.toBe(
      scopeAssessmentGroupId("artifact-one", "quiz__000001"),
    );
  });

  it("rejects blank identity components", () => {
    expect(() => scopeAssessmentProblemId(" ", "block_000001")).toThrow(/artifactId/);
    expect(() => scopeAssessmentProblemId("artifact-one", " ")).toThrow(/authoredBlockId/);
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
    const firstProblemId = scopeAssessmentProblemId("artifact-one", "block_000001");
    const firstGroupId = scopeAssessmentGroupId("artifact-one", "quiz__000001");
    const firstRequest: AssessmentRequestState = {
      ownerId: firstProblemId,
      requestId: "request-one",
      operation: "submit",
      status: "pending",
      error: null,
    };
    const secondProblemId = scopeAssessmentProblemId("artifact-two", "block_000001");
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
        quizzes: { [firstGroupId]: createQuizAttempt(firstGroupId) },
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
    expect(scopeAssessmentGroupId("artifact-two", "quiz__000001")).not.toBe(firstGroupId);
  });

  it("replaces a matching registration without changing durable state", () => {
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort(),
    });
    const problemId = scopeAssessmentProblemId("artifact-one", "block_000001");
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
    const canonicalProblemId = scopeAssessmentProblemId("artifact-one", "target_00001");
    const runtimeProblemId = scopeAssessmentProblemId("artifact-one", "block_000001");
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
    expect(store.getState().targetBindings[runtimeProblemId]).toBe("target_00001");
    expect(store.getState().transient.responseReady).toEqual({});
  });

  it("rejects a hydrated response whose kind conflicts with registration without mutation", () => {
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort(),
    });
    const canonicalProblemId = scopeAssessmentProblemId("artifact-one", "target_00001");
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
    const canonicalProblemId = scopeAssessmentProblemId("artifact-one", "target_00001");
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
    const problemId = scopeAssessmentProblemId("artifact-one", "block_000001");
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

  it("recomputes response readiness when an existing registration changes", () => {
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort(),
    });
    const problemId = scopeAssessmentProblemId("artifact-one", "block-one");
    const original = createRegistration();
    const stricter = createRegistration({
      response: {
        ...original.response,
        hasResponse: () => false,
      },
    });

    expect(store.getState().register(original)).toBe(true);
    expect(store.getState().setLocalResponse(registrationIdentity(), { choice: "option-a" })).toBe(
      true,
    );
    expect(store.getState().transient.responseReady[problemId]).toBe(true);

    expect(store.getState().update(stricter)).toBe(true);
    expect(store.getState().transient.responseReady[problemId]).toBe(false);
    expect(store.getState().durable.problems[problemId]?.response).toEqual({
      kind: "single-select",
      optionId: "option-a",
    });
  });

  it("rejects registration identity changes", () => {
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort(),
    });

    store.getState().register(createRegistration());

    expect(() =>
      store.getState().register(createRegistration({ targetId: "target_00002" })),
    ).toThrow(/targetId/);
    expect(() =>
      store.getState().update(createRegistration({ interactionKind: "multi-select" })),
    ).toThrow(/interactionKind/);
    expect(() =>
      store.getState().unregister(registrationIdentity({ targetId: "target_00002" })),
    ).toThrow(/targetId/);
  });

  it("unregisters only a matching registration and preserves durable state", () => {
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: createAssessmentPort(),
    });
    const problemId = scopeAssessmentProblemId("artifact-one", "block_000001");

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
    expect(store.getState().targetBindings[problemId]).toBe("target_00001");
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
    const firstProblemId = scopeAssessmentProblemId("artifact-one", "block_000001");
    const secondProblemId = scopeAssessmentProblemId("artifact-two", "block_000001");

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
    const problemId = scopeAssessmentProblemId("artifact-one", "block_000001");
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz__000001");
    const problem = createProblemSnapshot();
    const quiz = createQuizAttempt(groupId);

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
    const firstProblemId = scopeAssessmentProblemId("artifact-one", "block_000001");
    const secondProblemId = scopeAssessmentProblemId("artifact-two", "block_000001");
    const firstGroupId = scopeAssessmentGroupId("artifact-one", "quiz__000001");
    const secondGroupId = scopeAssessmentGroupId("artifact-two", "quiz__000001");

    first.getState().register(createRegistration());
    second.getState().register(createRegistration());
    first.setState({
      durable: {
        problems: { [firstProblemId]: createProblemSnapshot() },
        quizzes: { [firstGroupId]: createQuizAttempt(firstGroupId) },
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
        quizzes: { [secondGroupId]: createQuizAttempt(secondGroupId) },
      },
    });
    expect(first.getState().register(createRegistration({ authoredBlockId: "block_000002" }))).toBe(
      true,
    );
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
    expect(first.getState().durable.quizzes[firstGroupId]).toEqual(createQuizAttempt(firstGroupId));
    expect(second.getState().durable.problems[secondProblemId]).toEqual(createProblemSnapshot());
    expect(second.getState().durable.quizzes[secondGroupId]).toEqual(
      createQuizAttempt(secondGroupId),
    );
    expect(second.getState().registrations[secondProblemId]).toBeDefined();
  });
});
