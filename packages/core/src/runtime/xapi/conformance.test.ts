import { describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import {
  AssessmentProblemSnapshotSchema,
  QuizAttemptStateSchema,
  type AssessmentProblemSnapshot,
  type AssessmentResult,
  type LearnerActivityRecord,
  type QuizAssessmentSettings,
  type QuizAttemptState,
} from "@scaffold/contracts";
import {
  XapiStatementTemplateSchema,
  type XapiPort,
  type XapiStatementTemplate,
} from "@scaffold/core/ports";
import type { AssessmentPort } from "../../host/ports/assessment";
import type { LearnerActivityPort } from "../../host/ports/learner-activity";
import {
  createAssessmentStore,
  scopeAssessmentProblemId,
} from "../assessment/assessment-store";
import type {
  AssessmentRegistrationIdentity,
  AssessmentRegistrationInput,
} from "../assessment/types";
import { createLearnerActivityStore } from "../learner-activity/store";
import {
  XAPI_ACTIVITY_TYPES,
  XAPI_EXTENSIONS,
  XAPI_SESSION_MAX_PENDING_STATEMENTS,
  XAPI_VERBS,
  buildLearnerActivityInteractedStatementDraft,
  createAssessmentActivityId,
  createHintActivityId,
  createLearnerActivityId,
  createQuizActivityId,
  createXapiSession,
  type XapiSessionAccessor,
} from "./index";

const ROOT_ACTIVITY_ID = "https://lms.example.test/courses/course-one";
const EVENT_START = "2026-07-25T10:00:00.000Z";
const ARTIFACT_ID = "course-one";
const LEARNER_ACTIVITY_BLOCK_ID = "checklist-one";
const STANDALONE_PROBLEM_ID = "standalone-block";
const STANDALONE_TARGET_ID = "standalone-target";
const HINT_PROBLEM_ID = "hint-block";
const HINT_TARGET_ID = "hint-target";
const QUIZ_PROBLEM_ID = "quiz-block";
const QUIZ_TARGET_ID = "quiz-target";
const QUIZ_ID = "quiz-one";
const QUIZ_ATTEMPT_ID = "quiz-attempt-one";
const LOCAL_RESPONSE_ID = "local option";
const AUTHORITATIVE_RESPONSE_ID = "authoritative option";

const PRIVATE_VALUES = Object.freeze([
  "PRIVATE_ITEM_RESPONSE",
  "PRIVATE_ANSWER",
  "PRIVATE_FEEDBACK",
  "PRIVATE_ITEM_FEEDBACK",
  "PRIVATE_HINT_TEXT",
  "PRIVATE_LEARNER_DATA",
  "PRIVATE_ACTOR",
  "PRIVATE_CREDENTIAL",
  "PRIVATE_ENDPOINT",
]);

const PROHIBITED_KEYS = new Set([
  "actor",
  "answerKey",
  "attachments",
  "authority",
  "correct",
  "credential",
  "data",
  "endpoint",
  "expected",
  "feedback",
  "given",
  "hintText",
  "items",
  "platform",
  "registration",
  "stored",
  "version",
]);

const ALLOWED_TEMPLATE_KEYS = new Set([
  "verb",
  "object",
  "result",
  "context",
  "id",
  "timestamp",
  "display",
  "en",
  "objectType",
  "definition",
  "name",
  "type",
  "interactionType",
  "extensions",
  "score",
  "scaled",
  "raw",
  "min",
  "max",
  "success",
  "completion",
  "response",
  "duration",
  "contextActivities",
  "parent",
  ...Object.values(XAPI_EXTENSIONS),
]);

const APPROVED_VERB_IDS = new Set(Object.values(XAPI_VERBS).map((verb) => verb.id));
const APPROVED_ACTIVITY_TYPES: ReadonlySet<string> = new Set(Object.values(XAPI_ACTIVITY_TYPES));
const APPROVED_EXTENSION_IDS: ReadonlySet<string> = new Set(Object.values(XAPI_EXTENSIONS));

function assessmentResult(overrides: Partial<AssessmentResult> = {}): AssessmentResult {
  return {
    isCorrect: true,
    score: 1,
    maxScore: 1,
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
        given: "PRIVATE_ITEM_RESPONSE",
        feedback: {
          kind: "rich-text",
          document: {
            type: "doc",
            content: [{ type: "text", text: "PRIVATE_ITEM_FEEDBACK" }],
          },
        },
      },
    },
    ...overrides,
  };
}

function problemSnapshot(
  overrides: Partial<AssessmentProblemSnapshot> = {},
): AssessmentProblemSnapshot {
  return AssessmentProblemSnapshotSchema.parse({
    response: null,
    attemptNumber: 0,
    hintsShown: 0,
    checkResult: null,
    submitted: false,
    submissionResult: null,
    ...overrides,
  });
}

function quizAttempt(groupId: string, overrides: Partial<QuizAttemptState> = {}): QuizAttemptState {
  return QuizAttemptStateSchema.parse({
    attemptId: QUIZ_ATTEMPT_ID,
    groupId,
    status: "in_progress",
    currentTargetId: QUIZ_TARGET_ID,
    submittedTargetIds: [],
    startedAt: "2026-07-25T09:55:00.000Z",
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

function registration(problemId: string, targetId: string): AssessmentRegistrationInput {
  return {
    problemId,
    targetId,
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
  };
}

function identity(problemId: string, targetId: string): AssessmentRegistrationIdentity {
  return {
    problemId,
    targetId,
    interactionKind: "single-select",
  };
}

const quizSettings: QuizAssessmentSettings = {
  allowBacktracking: false,
  reviewTiming: "after_each_answer",
  reviewDetail: "result_only",
  attemptsPerQuestion: 2,
  isGraded: true,
  passingScore: 0.5,
  timer: { enabled: true, durationSeconds: 300 },
};

function createAssessmentPort(successStatus: "passed" | "failed"): AssessmentPort {
  const standaloneResult = assessmentResult({
    isCorrect: false,
    score: 0.25,
  });
  const quizResult = assessmentResult({
    isCorrect: successStatus === "passed",
    score: successStatus === "passed" ? 1 : 0.25,
  });

  return {
    type: "runtime",
    submit: async () => ({
      problem: problemSnapshot({
        response: { kind: "single-select", optionId: AUTHORITATIVE_RESPONSE_ID },
        attemptNumber: 3,
        submitted: true,
        submissionResult: standaloneResult,
      }),
    }),
    revealHint: async () => {
      const outcome = {
        problem: problemSnapshot({ hintsShown: 1 }),
        hintText: "PRIVATE_HINT_TEXT",
      };
      return outcome;
    },
    quiz: {
      startAttempt: async ({ groupId }) => ({
        quizAttempt: quizAttempt(groupId),
        problemsByTargetId: {},
      }),
      submitQuestion: async ({ groupId }) => ({
        quizAttempt: quizAttempt(groupId, {
          status: "completed",
          currentTargetId: null,
          submittedTargetIds: [QUIZ_TARGET_ID],
          finishedAt: "2026-07-25T10:00:30.000Z",
          score: successStatus === "passed" ? 1 : 0.25,
          maxScore: 1,
          successStatus,
          resultsByTargetId: { [QUIZ_TARGET_ID]: quizResult },
        }),
        problemsByTargetId: {
          [QUIZ_TARGET_ID]: problemSnapshot({
            response: { kind: "single-select", optionId: AUTHORITATIVE_RESPONSE_ID },
            attemptNumber: 1,
            submitted: true,
            submissionResult: quizResult,
          }),
        },
      }),
      finishAttempt: async ({ groupId }) => ({
        quizAttempt: quizAttempt(groupId),
        problemsByTargetId: {},
      }),
    },
  };
}

function createInMemoryXapiPort(accept: XapiPort["send"] = async () => undefined): {
  readonly port: XapiPort;
  readonly accepted: XapiStatementTemplate[];
} {
  const accepted: XapiStatementTemplate[] = [];
  return {
    port: {
      activityId: ROOT_ACTIVITY_ID,
      send: async (statement) => {
        await accept(statement);
        accepted.push(statement);
      },
    },
    accepted,
  };
}

function createDeterministicSession(port: XapiPort) {
  let uuidSequence = 0;
  let eventSequence = 0;
  let monotonicTime = 1_000;
  const session = createXapiSession({
    port,
    courseTitle: "Course One",
    createUuid: () => {
      uuidSequence += 1;
      return `00000000-0000-4000-8000-${uuidSequence.toString(16).padStart(12, "0")}`;
    },
    now: () => {
      const timestamp = new Date(Date.parse(EVENT_START) + eventSequence * 1_000);
      eventSequence += 1;
      return timestamp;
    },
    monotonicNow: () => monotonicTime,
  });

  return {
    session,
    setMonotonicTime: (value: number) => {
      monotonicTime = value;
    },
  };
}

function learnerActivityRecord(
  data: LearnerActivityRecord["data"],
  overrides: Partial<LearnerActivityRecord> = {},
): LearnerActivityRecord {
  return {
    activityKind: "checklist",
    data,
    completed: false,
    updatedAt: "2026-07-25T09:50:00.000Z",
    ...overrides,
  };
}

async function recordLearnerActivitySequence(getXapiSession: XapiSessionAccessor): Promise<void> {
  const store = createConformanceLearnerActivityStore(getXapiSession);
  await recordLearnerActivityProgress(store);
  await recordLearnerActivityCompletion(store);
}

function createConformanceLearnerActivityStore(
  getXapiSession?: XapiSessionAccessor,
): ReturnType<typeof createLearnerActivityStore> {
  const learnerActivityPort: LearnerActivityPort = {
    load: async () => null,
    save: async ({ record }) =>
      learnerActivityRecord(record.data, {
        activityKind: record.activityKind,
        completed: record.completed,
        updatedAt: "2026-07-25T10:00:30.000Z",
      }),
  };
  const store = createLearnerActivityStore({
    artifactId: ARTIFACT_ID,
    learnerActivityPort,
    ...(getXapiSession ? { getXapiSession } : {}),
  });
  store.setState({
    activities: {
      [LEARNER_ACTIVITY_BLOCK_ID]: learnerActivityRecord({ checked: [] }),
    },
    hydration: { status: "ready", error: null },
  });
  return store;
}

async function recordLearnerActivityProgress(
  store: ReturnType<typeof createLearnerActivityStore>,
): Promise<void> {
  expect(
    store.getState().setData(LEARNER_ACTIVITY_BLOCK_ID, {
      checked: ["first"],
      privateLearnerData: "PRIVATE_LEARNER_DATA",
    }),
  ).toBe(true);
  await vi.waitFor(() =>
    expect(store.getState().saves[LEARNER_ACTIVITY_BLOCK_ID]?.status).toBe("idle"),
  );
}

async function recordLearnerActivityCompletion(
  store: ReturnType<typeof createLearnerActivityStore>,
): Promise<void> {
  expect(store.getState().setCompleted(LEARNER_ACTIVITY_BLOCK_ID, true)).toBe(true);
  await vi.waitFor(() =>
    expect(store.getState().saves[LEARNER_ACTIVITY_BLOCK_ID]?.status).toBe("idle"),
  );
}

function createConformanceAssessmentStore(
  getXapiSession: XapiSessionAccessor | undefined,
  successStatus: "passed" | "failed",
): ReturnType<typeof createAssessmentStore> {
  return createAssessmentStore({
    artifactId: ARTIFACT_ID,
    assessmentPort: createAssessmentPort(successStatus),
    ...(getXapiSession ? { getXapiSession } : {}),
  });
}

async function recordStandaloneAndHint(
  store: ReturnType<typeof createAssessmentStore>,
): Promise<void> {
  await recordStandalone(store);
  await recordPersistedHint(store);
}

async function recordStandalone(
  store: ReturnType<typeof createAssessmentStore>,
): Promise<AssessmentResult> {
  const standaloneIdentity = identity(STANDALONE_PROBLEM_ID, STANDALONE_TARGET_ID);

  expect(store.getState().register(registration(STANDALONE_PROBLEM_ID, STANDALONE_TARGET_ID))).toBe(
    true,
  );
  expect(store.getState().setLocalResponse(standaloneIdentity, { choice: LOCAL_RESPONSE_ID })).toBe(
    true,
  );
  const result = await store.getState().submit(standaloneIdentity);
  expect(result).toMatchObject({
    isCorrect: false,
    score: 0.25,
  });
  if (result === null) {
    throw new Error("Expected the authoritative standalone result");
  }
  return result;
}

async function recordPersistedHint(store: ReturnType<typeof createAssessmentStore>): Promise<void> {
  const hintIdentity = identity(HINT_PROBLEM_ID, HINT_TARGET_ID);
  expect(store.getState().register(registration(HINT_PROBLEM_ID, HINT_TARGET_ID))).toBe(true);
  await expect(store.getState().revealHint(hintIdentity)).resolves.toBe(true);
}

async function recordTerminalQuiz(
  store: ReturnType<typeof createAssessmentStore>,
  successStatus: "passed" | "failed",
): Promise<void> {
  const quizIdentity = identity(QUIZ_PROBLEM_ID, QUIZ_TARGET_ID);

  expect(store.getState().register(registration(QUIZ_PROBLEM_ID, QUIZ_TARGET_ID))).toBe(true);
  expect(
    store.getState().registerQuiz({
      groupId: QUIZ_ID,
      targetIds: [QUIZ_TARGET_ID],
      settings: quizSettings,
    }),
  ).toBe(true);
  await expect(store.getState().startQuizAttempt({ groupId: QUIZ_ID })).resolves.toMatchObject({
    attemptId: QUIZ_ATTEMPT_ID,
    status: "in_progress",
  });
  expect(store.getState().setLocalResponse(quizIdentity, { choice: LOCAL_RESPONSE_ID })).toBe(true);
  await expect(
    store.getState().submitQuizQuestion({ groupId: QUIZ_ID }, quizIdentity),
  ).resolves.toMatchObject({
    status: "completed",
    successStatus,
  });
}

interface OperationalStores {
  readonly learnerActivity: ReturnType<typeof createLearnerActivityStore>;
  readonly assessment: ReturnType<typeof createAssessmentStore>;
}

interface OperationalResult {
  readonly learnerActivity: LearnerActivityRecord;
  readonly assessmentResult: AssessmentResult;
  readonly assessmentProblem: AssessmentProblemSnapshot;
}

function createOperationalStores(getXapiSession?: XapiSessionAccessor): OperationalStores {
  return {
    learnerActivity: createConformanceLearnerActivityStore(getXapiSession),
    assessment: createConformanceAssessmentStore(getXapiSession, "passed"),
  };
}

function operationalResult(
  stores: OperationalStores,
  assessmentResultValue: AssessmentResult,
): OperationalResult {
  const learnerActivity = stores.learnerActivity.getState().activities[LEARNER_ACTIVITY_BLOCK_ID];
  const assessmentProblem =
    stores.assessment.getState().durable.problems[
      scopeAssessmentProblemId(ARTIFACT_ID, STANDALONE_PROBLEM_ID)
    ];
  expect(learnerActivity).toBeDefined();
  expect(assessmentProblem).toBeDefined();
  if (learnerActivity === undefined || assessmentProblem === undefined) {
    throw new Error("Expected both authoritative operational records");
  }
  return {
    learnerActivity,
    assessmentResult: assessmentResultValue,
    assessmentProblem,
  };
}

async function recordOperationalScenario(
  getXapiSession?: XapiSessionAccessor,
  afterLearnerActivity?: () => Promise<void>,
): Promise<OperationalResult> {
  const stores = createOperationalStores(getXapiSession);
  await recordLearnerActivityProgress(stores.learnerActivity);
  await afterLearnerActivity?.();
  const result = await recordStandalone(stores.assessment);
  return operationalResult(stores, result);
}

function deferredAcceptance(): {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function operationalActivityIds(): Set<string> {
  return new Set([
    ROOT_ACTIVITY_ID,
    createLearnerActivityId(ROOT_ACTIVITY_ID, LEARNER_ACTIVITY_BLOCK_ID),
    createAssessmentActivityId(ROOT_ACTIVITY_ID, STANDALONE_TARGET_ID),
  ]);
}

function collectTemplateDetails(
  value: unknown,
  keys: Set<string>,
  activityIds: string[],
  activityTypes: string[],
  extensionIds: string[],
): void {
  if (Array.isArray(value)) {
    for (const child of value) {
      collectTemplateDetails(child, keys, activityIds, activityTypes, extensionIds);
    }
    return;
  }
  if (typeof value !== "object" || value === null) return;

  const record = value as Record<string, unknown>;
  if (record.objectType === "Activity" && typeof record.id === "string") {
    activityIds.push(record.id);
    const definition = record.definition;
    if (typeof definition === "object" && definition !== null) {
      const activityType = (definition as Record<string, unknown>).type;
      if (typeof activityType === "string") {
        activityTypes.push(activityType);
      }
    }
  }

  for (const [key, child] of Object.entries(record)) {
    keys.add(key);
    if (key === "extensions" && typeof child === "object" && child !== null) {
      extensionIds.push(...Object.keys(child));
    }
    collectTemplateDetails(child, keys, activityIds, activityTypes, extensionIds);
  }
}

function expectConformantTemplates(
  statements: readonly XapiStatementTemplate[],
  approvedActivityIds: ReadonlySet<string>,
): void {
  expect(statements.length).toBeGreaterThan(0);
  expect(new Set(statements.map((statement) => statement.id)).size).toBe(statements.length);

  for (const statement of statements) {
    expect(XapiStatementTemplateSchema.parse(statement)).toStrictEqual(statement);
    expect(APPROVED_VERB_IDS.has(statement.verb.id)).toBe(true);

    const keys = new Set<string>();
    const activityIds: string[] = [];
    const activityTypes: string[] = [];
    const extensionIds: string[] = [];
    collectTemplateDetails(statement, keys, activityIds, activityTypes, extensionIds);

    expect([...keys].filter((key) => !ALLOWED_TEMPLATE_KEYS.has(key))).toStrictEqual([]);
    expect([...keys].filter((key) => PROHIBITED_KEYS.has(key))).toStrictEqual([]);
    expect(activityIds.filter((activityId) => !approvedActivityIds.has(activityId))).toStrictEqual(
      [],
    );
    expect(
      activityTypes.filter((activityType) => !APPROVED_ACTIVITY_TYPES.has(activityType)),
    ).toStrictEqual([]);
    expect(
      extensionIds.filter((extensionId) => !APPROVED_EXTENSION_IDS.has(extensionId)),
    ).toStrictEqual([]);

    const serialized = JSON.stringify(statement);
    for (const privateValue of PRIVATE_VALUES) {
      expect(serialized).not.toContain(privateValue);
    }
  }
}

function approvedActivityIds(includeLearnerAndStandalone: boolean): Set<string> {
  return new Set([
    ROOT_ACTIVITY_ID,
    createAssessmentActivityId(ROOT_ACTIVITY_ID, QUIZ_TARGET_ID),
    createQuizActivityId(ROOT_ACTIVITY_ID, QUIZ_ID),
    ...(includeLearnerAndStandalone
      ? [
          createLearnerActivityId(ROOT_ACTIVITY_ID, LEARNER_ACTIVITY_BLOCK_ID),
          createAssessmentActivityId(ROOT_ACTIVITY_ID, STANDALONE_TARGET_ID),
          createAssessmentActivityId(ROOT_ACTIVITY_ID, HINT_TARGET_ID),
          createHintActivityId(ROOT_ACTIVITY_ID, HINT_TARGET_ID, 1),
        ]
      : []),
  ]);
}

describe("Core xAPI conformance", () => {
  it("accepts one ordered lifecycle, learner-activity, and assessment sequence", async () => {
    const { port, accepted } = createInMemoryXapiPort();
    const { session, setMonotonicTime } = createDeterministicSession(port);
    const getXapiSession = () => session;
    const assessmentStore = createConformanceAssessmentStore(getXapiSession, "passed");

    session.start();
    await recordLearnerActivitySequence(getXapiSession);
    await recordStandaloneAndHint(assessmentStore);
    await recordTerminalQuiz(assessmentStore, "passed");
    setMonotonicTime(31_000);
    await session.terminate();

    expect(accepted.map((statement) => statement.verb.id)).toStrictEqual([
      XAPI_VERBS.initialized.id,
      XAPI_VERBS.interacted.id,
      XAPI_VERBS.completed.id,
      XAPI_VERBS.answered.id,
      XAPI_VERBS.interacted.id,
      XAPI_VERBS.attempted.id,
      XAPI_VERBS.answered.id,
      XAPI_VERBS.completed.id,
      XAPI_VERBS.passed.id,
      XAPI_VERBS.terminated.id,
    ]);
    expect(accepted.map((statement) => statement.id)).toStrictEqual(
      Array.from(
        { length: accepted.length },
        (_, index) => `00000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, "0")}`,
      ),
    );
    expect(accepted.map((statement) => statement.timestamp)).toStrictEqual(
      Array.from({ length: accepted.length }, (_, index) =>
        new Date(Date.parse(EVENT_START) + index * 1_000).toISOString(),
      ),
    );

    expect(accepted[0]).toMatchObject({
      object: {
        id: ROOT_ACTIVITY_ID,
        definition: { type: XAPI_ACTIVITY_TYPES.course },
      },
    });
    expect(accepted[1]).toMatchObject({
      object: {
        id: createLearnerActivityId(ROOT_ACTIVITY_ID, LEARNER_ACTIVITY_BLOCK_ID),
        definition: {
          extensions: {
            [XAPI_EXTENSIONS.learnerActivityKind]: "checklist",
          },
        },
      },
      context: {
        contextActivities: { parent: [{ id: ROOT_ACTIVITY_ID }] },
      },
    });
    expect(accepted[2]).toMatchObject({
      result: { completion: true },
    });
    expect(accepted[3]).toMatchObject({
      object: {
        id: createAssessmentActivityId(ROOT_ACTIVITY_ID, STANDALONE_TARGET_ID),
        definition: {
          interactionType: "choice",
          extensions: {
            [XAPI_EXTENSIONS.assessmentInteractionKind]: "single-select",
          },
        },
      },
      result: {
        success: false,
        score: { scaled: 0.25 },
        response: "authoritative%20option",
        extensions: {
          [XAPI_EXTENSIONS.assessmentAttemptNumber]: 3,
        },
      },
      context: {
        contextActivities: { parent: [{ id: ROOT_ACTIVITY_ID }] },
      },
    });
    expect(accepted[4]).toMatchObject({
      object: {
        id: createHintActivityId(ROOT_ACTIVITY_ID, HINT_TARGET_ID, 1),
      },
      result: {
        extensions: { [XAPI_EXTENSIONS.hintNumber]: 1 },
      },
      context: {
        contextActivities: {
          parent: [
            {
              id: createAssessmentActivityId(ROOT_ACTIVITY_ID, HINT_TARGET_ID),
            },
          ],
        },
      },
    });
    expect(accepted[5]).toMatchObject({
      object: { id: createQuizActivityId(ROOT_ACTIVITY_ID, QUIZ_ID) },
      context: {
        contextActivities: { parent: [{ id: ROOT_ACTIVITY_ID }] },
        extensions: {
          [XAPI_EXTENSIONS.quizAttemptId]: QUIZ_ATTEMPT_ID,
        },
      },
    });
    expect(accepted[6]).toMatchObject({
      object: {
        id: createAssessmentActivityId(ROOT_ACTIVITY_ID, QUIZ_TARGET_ID),
      },
      result: {
        response: "authoritative%20option",
        extensions: {
          [XAPI_EXTENSIONS.assessmentAttemptNumber]: 1,
        },
      },
      context: {
        contextActivities: {
          parent: [{ id: createQuizActivityId(ROOT_ACTIVITY_ID, QUIZ_ID) }],
        },
        extensions: {
          [XAPI_EXTENSIONS.quizAttemptId]: QUIZ_ATTEMPT_ID,
        },
      },
    });
    expect(accepted[7]).toMatchObject({
      object: { id: createQuizActivityId(ROOT_ACTIVITY_ID, QUIZ_ID) },
      result: { completion: true, duration: "PT330S" },
      context: {
        contextActivities: { parent: [{ id: ROOT_ACTIVITY_ID }] },
        extensions: {
          [XAPI_EXTENSIONS.quizAttemptId]: QUIZ_ATTEMPT_ID,
        },
      },
    });
    expect(accepted[8]).toMatchObject({
      result: {
        success: true,
        score: { scaled: 1, raw: 1, min: 0, max: 1 },
      },
    });
    expect(accepted[9]).toMatchObject({
      object: { id: ROOT_ACTIVITY_ID },
      result: { duration: "PT30S" },
    });

    expectConformantTemplates(accepted, approvedActivityIds(true));
  });

  it("copies an authoritative failed quiz outcome into conformant templates", async () => {
    const { port, accepted } = createInMemoryXapiPort();
    const { session, setMonotonicTime } = createDeterministicSession(port);
    const assessmentStore = createConformanceAssessmentStore(() => session, "failed");

    await recordTerminalQuiz(assessmentStore, "failed");
    setMonotonicTime(31_000);
    await session.terminate();

    expect(accepted.map((statement) => statement.verb.id)).toStrictEqual([
      XAPI_VERBS.initialized.id,
      XAPI_VERBS.attempted.id,
      XAPI_VERBS.answered.id,
      XAPI_VERBS.completed.id,
      XAPI_VERBS.failed.id,
      XAPI_VERBS.terminated.id,
    ]);
    expect(accepted[4]).toMatchObject({
      result: {
        success: false,
        score: { scaled: 0.25, raw: 0.25, min: 0, max: 1 },
      },
    });

    expectConformantTemplates(accepted, approvedActivityIds(false));
  });

  it("preserves operational authority across unavailable and failed recording", async () => {
    const acceptingPort = createInMemoryXapiPort();
    const acceptingSession = createDeterministicSession(acceptingPort.port);
    const baseline = await recordOperationalScenario(() => acceptingSession.session);
    acceptingSession.setMonotonicTime(31_000);
    await acceptingSession.session.terminate();
    expect(acceptingPort.accepted.map((statement) => statement.verb.id)).toStrictEqual([
      XAPI_VERBS.initialized.id,
      XAPI_VERBS.interacted.id,
      XAPI_VERBS.answered.id,
      XAPI_VERBS.terminated.id,
    ]);
    expectConformantTemplates(acceptingPort.accepted, operationalActivityIds());

    const absent = await recordOperationalScenario();

    let rejectionAttempt = 0;
    const rejectSecondAcceptance = vi.fn<XapiPort["send"]>(async () => {
      rejectionAttempt += 1;
      if (rejectionAttempt === 2) {
        throw new Error("host rejected the learning Statement");
      }
    });
    const rejectingPort = createInMemoryXapiPort(rejectSecondAcceptance);
    const rejectingSession = createDeterministicSession(rejectingPort.port);
    const rejected = await recordOperationalScenario(
      () => rejectingSession.session,
      async () => {
        await vi.waitFor(() =>
          expect(rejectingSession.session.getState()).toMatchObject({
            status: "active",
            delivery: "failed",
          }),
        );
      },
    );
    expect(rejectSecondAcceptance).toHaveBeenCalledTimes(2);
    expect(rejectingPort.accepted.map((statement) => statement.verb.id)).toStrictEqual([
      XAPI_VERBS.initialized.id,
    ]);
    expectConformantTemplates(rejectingPort.accepted, new Set([ROOT_ACTIVITY_ID]));
    await rejectingSession.session.terminate();
    expect(rejectingSession.session.getState()).toMatchObject({
      status: "terminated",
      delivery: "failed",
    });

    const heldOverflowAcceptance = deferredAcceptance();
    const acceptOverflow = vi.fn<XapiPort["send"]>(() => heldOverflowAcceptance.promise);
    const overflowPort = createInMemoryXapiPort(acceptOverflow);
    const overflowSession = createDeterministicSession(overflowPort.port);
    overflowSession.session.start();
    await vi.waitFor(() => expect(acceptOverflow).toHaveBeenCalledOnce());
    for (let index = 1; index < XAPI_SESSION_MAX_PENDING_STATEMENTS; index += 1) {
      overflowSession.session.record(
        buildLearnerActivityInteractedStatementDraft({
          rootActivityId: ROOT_ACTIVITY_ID,
          blockId: `overflow-${index}`,
          activityKind: "checklist",
        }),
      );
    }
    overflowSession.session.record(
      buildLearnerActivityInteractedStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        blockId: "overflow",
        activityKind: "checklist",
      }),
    );
    expect(overflowSession.session.getState()).toMatchObject({
      status: "active",
      delivery: "failed",
    });
    const overflowed = await recordOperationalScenario(() => overflowSession.session);
    expect(acceptOverflow).toHaveBeenCalledOnce();
    heldOverflowAcceptance.resolve();
    await vi.waitFor(() => expect(overflowPort.accepted).toHaveLength(1));
    expectConformantTemplates(overflowPort.accepted, new Set([ROOT_ACTIVITY_ID]));
    await overflowSession.session.terminate();
    expect(overflowSession.session.getState()).toMatchObject({
      status: "terminated",
      delivery: "failed",
    });

    const heldShutdownAcceptance = deferredAcceptance();
    let shutdownAttempt = 0;
    const acceptShutdown = vi.fn<XapiPort["send"]>(() => {
      shutdownAttempt += 1;
      return shutdownAttempt === 1 ? heldShutdownAcceptance.promise : Promise.resolve();
    });
    const shutdownPort = createInMemoryXapiPort(acceptShutdown);
    const shutdownSession = createDeterministicSession(shutdownPort.port);
    shutdownSession.session.start();
    await vi.waitFor(() => expect(acceptShutdown).toHaveBeenCalledOnce());
    shutdownSession.setMonotonicTime(31_000);
    const termination = shutdownSession.session.terminate();
    expect(shutdownSession.session.getState()).toMatchObject({
      status: "terminating",
      delivery: "accepting",
    });
    const shutdownStores = createOperationalStores(() => shutdownSession.session);
    await recordLearnerActivityProgress(shutdownStores.learnerActivity);
    expect(shutdownSession.session.getState()).toMatchObject({
      status: "terminating",
      delivery: "accepting",
    });
    expect(acceptShutdown).toHaveBeenCalledOnce();
    heldShutdownAcceptance.resolve();
    await termination;
    expect(shutdownSession.session.getState()).toMatchObject({
      status: "terminated",
      delivery: "accepted",
    });
    const shutdownAssessmentResult = await recordStandalone(shutdownStores.assessment);
    const shutDown = operationalResult(shutdownStores, shutdownAssessmentResult);
    expect(acceptShutdown).toHaveBeenCalledTimes(2);
    expect(shutdownPort.accepted.map((statement) => statement.verb.id)).toStrictEqual([
      XAPI_VERBS.initialized.id,
      XAPI_VERBS.terminated.id,
    ]);
    expectConformantTemplates(shutdownPort.accepted, new Set([ROOT_ACTIVITY_ID]));

    for (const [condition, result] of Object.entries({
      absent,
      rejected,
      overflowed,
      shutDown,
    })) {
      expect({ condition, result }).toStrictEqual({
        condition,
        result: baseline,
      });
    }
  });
});
