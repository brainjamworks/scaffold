import { describe, expect, it } from "vite-plus/test";

import {
  LearningEventSchema,
  type LearningEvent,
  type LearningEventActivity,
  type LearningEventContext,
  type LearningEventJsonValue,
  type Score,
} from "../../host/ports/learning-events";
import {
  LEARNING_EVENT_ACTIVITY_TYPES,
  LEARNING_EVENT_EXTENSIONS,
  LEARNING_EVENT_VERBS,
  buildLearningEventDraft,
  CoreLearningEventInputSchema,
  type CoreLearningEventInput,
} from "./catalogue";

const ROOT_ACTIVITY_ID = "https://lms.example.test/contents/standards-one";
const EVENT_TIMESTAMP = "2026-08-05T10:00:00.000Z";
const CMI5_CATEGORY_ID = "https://w3id.org/xapi/cmi5/context/categories/cmi5";
const CMI5_MOVEON_CATEGORY_ID = "https://w3id.org/xapi/cmi5/context/categories/moveon";
const CMI5_SESSION_ID_EXTENSION = "https://w3id.org/xapi/cmi5/context/extensions/sessionid";
const HOST_PLACEMENT_EXTENSION = "https://lms.example.test/xapi/extensions/placement";
const REGISTRATION_ID = "00000000-0000-4000-8000-000000000099";
const PUBLISHER_ACTIVITY_ID = "https://publisher.example.test/content/standards-one";
const CMI5_SESSION_ID = "session-42";

const TRUSTED_ACTOR = Object.freeze({
  objectType: "Agent" as const,
  account: Object.freeze({
    homePage: "https://lms.example.test",
    name: "learner-42",
  }),
});

const TRUSTED_CMI5_LAUNCH_CONTEXT = Object.freeze({
  registration: REGISTRATION_ID,
  publisherActivityId: PUBLISHER_ACTIVITY_ID,
  sessionId: CMI5_SESSION_ID,
});

const ANSWERED_INPUT = {
  type: "assessment.answered",
  targetId: "question-one",
  definition: {
    activityDescription: "Which city is the capital of France?",
    interaction: {
      kind: "single-select",
      options: [
        { id: "option-a", label: "Paris" },
        { id: "option-b", label: "Madrid" },
      ],
    },
  },
  response: { kind: "single-select", optionId: "option-a" },
  result: { isCorrect: true, score: { scaled: 1 } },
  attemptNumber: 2,
  quiz: { quizId: "quiz-one", attemptId: "quiz-attempt-one" },
} as const satisfies CoreLearningEventInput;

function materializeEvent(input: CoreLearningEventInput, sequence = 1): LearningEvent {
  return LearningEventSchema.parse({
    ...buildLearningEventDraft(input, {
      rootActivityId: ROOT_ACTIVITY_ID,
      title: "Standards content",
    }),
    id: `00000000-0000-4000-8000-${sequence.toString(16).padStart(12, "0")}`,
    timestamp: new Date(Date.parse(EVENT_TIMESTAMP) + sequence * 1_000).toISOString(),
  });
}

interface TrustedActor {
  readonly objectType: "Agent";
  readonly account: {
    readonly homePage: string;
    readonly name: string;
  };
}

interface HostContext {
  readonly registration?: string;
  readonly contextActivities?: LearningEventContext["contextActivities"];
  readonly extensions?: Readonly<Record<string, LearningEventJsonValue>>;
}

interface EnrichedContext extends LearningEventContext {
  readonly registration?: string;
}

interface OrdinaryXapiStatement extends LearningEvent {
  readonly actor: TrustedActor;
  readonly context?: EnrichedContext;
}

interface TrustedCmi5LaunchContext {
  readonly registration: string;
  readonly publisherActivityId: string;
  readonly sessionId: string;
}

function rejectCollisions(
  core: Readonly<Record<string, unknown>> | undefined,
  host: Readonly<Record<string, unknown>> | undefined,
  field: string,
): void {
  const coreKeys = new Set(Object.keys(core ?? {}));
  const collision = Object.keys(host ?? {}).find((key) => coreKeys.has(key));
  if (collision !== undefined) {
    throw new Error(`Host ${field} collides with Core-owned ${collision}`);
  }
}

function enrichOrdinaryXapi(
  event: LearningEvent,
  actor: TrustedActor,
  hostContext: HostContext,
): OrdinaryXapiStatement {
  rejectCollisions(
    event.context?.contextActivities,
    hostContext.contextActivities,
    "contextActivities",
  );
  rejectCollisions(event.context?.extensions, hostContext.extensions, "extensions");

  const contextActivities = {
    ...event.context?.contextActivities,
    ...hostContext.contextActivities,
  };
  const extensions = {
    ...event.context?.extensions,
    ...hostContext.extensions,
  };
  const context: EnrichedContext = {
    ...event.context,
    ...(hostContext.registration === undefined ? {} : { registration: hostContext.registration }),
    ...(Object.keys(contextActivities).length === 0 ? {} : { contextActivities }),
    ...(Object.keys(extensions).length === 0 ? {} : { extensions }),
  };

  return {
    ...event,
    actor,
    ...(Object.keys(context).length === 0 ? {} : { context }),
  };
}

function buildCmi5HostContext(
  event: LearningEvent,
  launchContext: TrustedCmi5LaunchContext,
): HostContext {
  const hasCompletionOrSuccess =
    event.result?.completion !== undefined || event.result?.success !== undefined;
  const isCmi5Allowed = event.verb.id === LEARNING_EVENT_VERBS.progressed.id;

  return {
    registration: launchContext.registration,
    contextActivities: {
      grouping: [
        {
          objectType: "Activity",
          id: launchContext.publisherActivityId,
        },
      ],
      ...(isCmi5Allowed
        ? {}
        : {
            category: [
              { objectType: "Activity" as const, id: CMI5_CATEGORY_ID },
              ...(hasCompletionOrSuccess
                ? [{ objectType: "Activity" as const, id: CMI5_MOVEON_CATEGORY_ID }]
                : []),
            ],
          }),
    },
    extensions: {
      [CMI5_SESSION_ID_EXTENSION]: launchContext.sessionId,
    },
  };
}

type Cmi5Projection =
  | { readonly status: "unsupported" }
  | {
      readonly status: "accepted";
      readonly lifecycle: "initialized";
    }
  | {
      readonly status: "accepted";
      readonly lifecycle: "terminated";
      readonly duration: string;
    }
  | { readonly status: "accepted"; readonly outcome: "progressed"; readonly progress: number }
  | {
      readonly status: "accepted";
      readonly outcome: "completed";
      readonly completion: true;
      readonly duration: string;
    }
  | {
      readonly status: "accepted";
      readonly outcome: "passed" | "failed";
      readonly success: boolean;
      readonly duration: string;
      readonly score?: Score;
    };

function projectCmi5Semantics(event: LearningEvent): Cmi5Projection {
  if (
    event.object.id !== ROOT_ACTIVITY_ID ||
    event.object.definition?.type !== LEARNING_EVENT_ACTIVITY_TYPES.content
  ) {
    return { status: "unsupported" };
  }

  switch (event.verb.id) {
    case LEARNING_EVENT_VERBS.initialized.id:
      return { status: "accepted", lifecycle: "initialized" };
    case LEARNING_EVENT_VERBS.terminated.id:
      if (event.result?.duration === undefined) return { status: "unsupported" };
      return {
        status: "accepted",
        lifecycle: "terminated",
        duration: event.result.duration,
      };
    case LEARNING_EVENT_VERBS.progressed.id: {
      const progress = event.result?.extensions?.[LEARNING_EVENT_EXTENSIONS.progress];
      if (
        !Number.isInteger(progress) ||
        typeof progress !== "number" ||
        progress < 0 ||
        progress > 99
      ) {
        throw new Error("Invalid cmi5 progress input");
      }
      return { status: "accepted", outcome: "progressed", progress };
    }
    case LEARNING_EVENT_VERBS.completed.id:
      if (event.result?.completion !== true || event.result.duration === undefined) {
        return { status: "unsupported" };
      }
      return {
        status: "accepted",
        outcome: "completed",
        completion: true,
        duration: event.result.duration,
      };
    case LEARNING_EVENT_VERBS.passed.id:
    case LEARNING_EVENT_VERBS.failed.id:
      if (event.result?.success === undefined || event.result.duration === undefined) {
        return { status: "unsupported" };
      }
      return {
        status: "accepted",
        outcome: event.result.success ? "passed" : "failed",
        success: event.result.success,
        duration: event.result.duration,
        ...(event.result.score === undefined ? {} : { score: event.result.score }),
      };
    default:
      return { status: "unsupported" };
  }
}

interface ScormInteraction {
  readonly id: string;
  readonly type: string;
  readonly learnerResponse?: string;
  readonly result: "correct" | "incorrect" | "neutral";
  readonly description?: string;
  readonly latency?: string;
}

interface ScormRuntimeState {
  readonly completionStatus: "unknown" | "completed";
  readonly successStatus: "unknown" | "passed" | "failed";
  readonly score: Score | null;
  readonly progressMeasure: number | null;
  readonly interactions: readonly ScormInteraction[];
}

type ScormProjection =
  | { readonly status: "accepted"; readonly state: ScormRuntimeState }
  | { readonly status: "unsupported"; readonly state: ScormRuntimeState };

const EMPTY_SCORM_STATE: ScormRuntimeState = Object.freeze({
  completionStatus: "unknown",
  successStatus: "unknown",
  score: null,
  progressMeasure: null,
  interactions: Object.freeze([]),
});

function withScore(state: ScormRuntimeState, score: Score | undefined): ScormRuntimeState {
  return score === undefined ? state : { ...state, score };
}

function reduceScorm(state: ScormRuntimeState, event: LearningEvent): ScormProjection {
  if (
    event.verb.id === LEARNING_EVENT_VERBS.answered.id &&
    event.object.definition?.type === LEARNING_EVENT_ACTIVITY_TYPES.assessmentQuestion &&
    event.object.definition.interactionType !== undefined
  ) {
    const result =
      event.result?.success === true
        ? "correct"
        : event.result?.success === false
          ? "incorrect"
          : "neutral";
    return {
      status: "accepted",
      state: {
        ...state,
        interactions: [
          ...state.interactions,
          {
            id: event.object.id,
            type: event.object.definition.interactionType,
            ...(event.result?.response === undefined
              ? {}
              : { learnerResponse: event.result.response }),
            result,
            ...(event.object.definition.description?.en === undefined
              ? {}
              : { description: event.object.definition.description.en }),
            ...(event.result?.duration === undefined ? {} : { latency: event.result.duration }),
          },
        ],
      },
    };
  }

  const isRootOutcome =
    event.object.id === ROOT_ACTIVITY_ID &&
    event.object.definition?.type === LEARNING_EVENT_ACTIVITY_TYPES.content;
  if (!isRootOutcome) return { status: "unsupported", state };

  switch (event.verb.id) {
    case LEARNING_EVENT_VERBS.progressed.id: {
      const progress = event.result?.extensions?.[LEARNING_EVENT_EXTENSIONS.progress];
      if (
        !Number.isInteger(progress) ||
        typeof progress !== "number" ||
        progress < 0 ||
        progress > 99
      ) {
        throw new Error("Invalid SCORM progress input");
      }
      return {
        status: "accepted",
        state: { ...state, progressMeasure: progress / 100 },
      };
    }
    case LEARNING_EVENT_VERBS.completed.id:
      if (event.result?.completion !== true) return { status: "unsupported", state };
      return {
        status: "accepted",
        state: { ...state, completionStatus: "completed" },
      };
    case LEARNING_EVENT_VERBS.passed.id:
    case LEARNING_EVENT_VERBS.failed.id:
      if (event.result?.success === undefined) return { status: "unsupported", state };
      return {
        status: "accepted",
        state: withScore(
          { ...state, successStatus: event.result.success ? "passed" : "failed" },
          event.result.score,
        ),
      };
    default:
      return { status: "unsupported", state };
  }
}

describe("ordinary xAPI projection sufficiency", () => {
  it("preserves Core-owned meaning while adding trusted Actor and non-conflicting Context", () => {
    const event = materializeEvent(ANSWERED_INPUT);
    const serializedEvent = JSON.stringify(event);
    const statement = enrichOrdinaryXapi(event, TRUSTED_ACTOR, {
      registration: REGISTRATION_ID,
      contextActivities: {
        grouping: [
          {
            objectType: "Activity",
            id: "https://lms.example.test/courses/course-one",
          },
        ],
        category: [
          {
            objectType: "Activity",
            id: CMI5_CATEGORY_ID,
          },
        ],
      },
      extensions: { [HOST_PLACEMENT_EXTENSION]: "placement-one" },
    });

    expect(statement.actor).toStrictEqual(TRUSTED_ACTOR);
    expect(statement.context).toMatchObject({
      registration: REGISTRATION_ID,
      contextActivities: {
        parent: event.context?.contextActivities?.parent,
        grouping: [{ id: "https://lms.example.test/courses/course-one" }],
        category: [{ id: CMI5_CATEGORY_ID }],
      },
      extensions: {
        ...event.context?.extensions,
        [HOST_PLACEMENT_EXTENSION]: "placement-one",
      },
    });
    for (const field of ["id", "timestamp", "verb", "object", "result"] as const) {
      expect(JSON.stringify(statement[field])).toBe(JSON.stringify(event[field]));
    }
    expect(statement.context?.contextActivities?.parent).toStrictEqual(
      event.context?.contextActivities?.parent,
    );
    expect(statement.context?.extensions?.[LEARNING_EVENT_EXTENSIONS.quizAttemptId]).toBe(
      event.context?.extensions?.[LEARNING_EVENT_EXTENSIONS.quizAttemptId],
    );
    expect(JSON.stringify(event)).toBe(serializedEvent);
  });

  it("rejects host collisions with Core-owned Context", () => {
    const event = materializeEvent(ANSWERED_INPUT);
    const conflictingParent: LearningEventActivity = {
      objectType: "Activity",
      id: "https://lms.example.test/attacker-controlled-parent",
    };

    expect(() =>
      enrichOrdinaryXapi(event, TRUSTED_ACTOR, {
        contextActivities: { parent: [conflictingParent] },
      }),
    ).toThrow(/contextActivities.*parent/u);
    expect(() =>
      enrichOrdinaryXapi(event, TRUSTED_ACTOR, {
        extensions: {
          [LEARNING_EVENT_EXTENSIONS.quizAttemptId]: "replacement-attempt",
        },
      }),
    ).toThrow(/extensions.*quiz-attempt-id/u);
  });
});

describe("cmi5 projection sufficiency", () => {
  it("supplies lifecycle, progress, completion, pass, and fail semantics", () => {
    const events = [
      materializeEvent({ type: "session.initialized" }, 1),
      materializeEvent({ type: "content.progressed", progressPercent: 0 }, 2),
      materializeEvent({ type: "content.progressed", progressPercent: 99 }, 3),
      materializeEvent(
        {
          type: "content.completed",
          completion: true,
          duration: "PT2M",
        },
        4,
      ),
      materializeEvent({ type: "content.passed", score: { scaled: 0.75 }, duration: "PT3M" }, 5),
      materializeEvent({ type: "content.failed", duration: "PT4M" }, 6),
      materializeEvent({ type: "session.terminated", durationMs: 125_000 }, 7),
    ];

    expect(events.map(projectCmi5Semantics)).toStrictEqual([
      { status: "accepted", lifecycle: "initialized" },
      { status: "accepted", outcome: "progressed", progress: 0 },
      { status: "accepted", outcome: "progressed", progress: 99 },
      {
        status: "accepted",
        outcome: "completed",
        completion: true,
        duration: "PT2M",
      },
      {
        status: "accepted",
        outcome: "passed",
        success: true,
        duration: "PT3M",
        score: { scaled: 0.75 },
      },
      { status: "accepted", outcome: "failed", success: false, duration: "PT4M" },
      { status: "accepted", lifecycle: "terminated", duration: "PT125S" },
    ]);
  });

  it("returns unsupported when a required outcome or lifecycle duration is absent", () => {
    const initialized = materializeEvent({ type: "session.initialized" });
    const terminatedWithoutDuration = LearningEventSchema.parse({
      ...initialized,
      verb: LEARNING_EVENT_VERBS.terminated,
    });

    expect(
      [
        materializeEvent({ type: "content.completed", completion: true }),
        materializeEvent({ type: "content.passed", score: { scaled: 0.75 } }),
        materializeEvent({ type: "content.failed" }),
        terminatedWithoutDuration,
      ].map(projectCmi5Semantics),
    ).toStrictEqual([
      { status: "unsupported" },
      { status: "unsupported" },
      { status: "unsupported" },
      { status: "unsupported" },
    ]);
  });

  it.each([
    { label: "scaled-only", score: { scaled: 0.25 } },
    { label: "integer tuple", score: { scaled: 0.5, raw: 1, min: 0, max: 2 } },
  ] as const)("preserves a canonical $label cmi5 score", ({ score }) => {
    expect(
      projectCmi5Semantics(materializeEvent({ type: "content.passed", duration: "PT1S", score })),
    ).toStrictEqual({
      status: "accepted",
      outcome: "passed",
      success: true,
      duration: "PT1S",
      score,
    });
  });

  it("adds the required launch Context only from trusted host configuration", () => {
    const event = materializeEvent({ type: "session.initialized" });
    const statement = enrichOrdinaryXapi(
      event,
      TRUSTED_ACTOR,
      buildCmi5HostContext(event, TRUSTED_CMI5_LAUNCH_CONTEXT),
    );

    expect(statement.actor).toStrictEqual(TRUSTED_ACTOR);
    expect(statement.context).toStrictEqual({
      registration: REGISTRATION_ID,
      contextActivities: {
        grouping: [{ objectType: "Activity", id: PUBLISHER_ACTIVITY_ID }],
        category: [{ objectType: "Activity", id: CMI5_CATEGORY_ID }],
      },
      extensions: { [CMI5_SESSION_ID_EXTENSION]: CMI5_SESSION_ID },
    });
    expect(event).not.toHaveProperty("actor");
    expect(event.context).toBeUndefined();
  });

  it.each([
    {
      label: "completed",
      input: { type: "content.completed", completion: true, duration: "PT2M" },
    },
    { label: "passed", input: { type: "content.passed", duration: "PT3M" } },
    { label: "failed", input: { type: "content.failed", duration: "PT4M" } },
  ] satisfies readonly { label: string; input: CoreLearningEventInput }[])(
    "adds the conditional moveOn category to $label statements",
    ({ input }) => {
      const event = materializeEvent(input);
      const statement = enrichOrdinaryXapi(
        event,
        TRUSTED_ACTOR,
        buildCmi5HostContext(event, TRUSTED_CMI5_LAUNCH_CONTEXT),
      );

      expect(statement.context).toStrictEqual({
        registration: REGISTRATION_ID,
        contextActivities: {
          grouping: [{ objectType: "Activity", id: PUBLISHER_ACTIVITY_ID }],
          category: [
            { objectType: "Activity", id: CMI5_CATEGORY_ID },
            { objectType: "Activity", id: CMI5_MOVEON_CATEGORY_ID },
          ],
        },
        extensions: { [CMI5_SESSION_ID_EXTENSION]: CMI5_SESSION_ID },
      });
      expect(event).not.toHaveProperty("actor");
      expect(event.context).toBeUndefined();
    },
  );

  it("keeps progressed launch Context while omitting cmi5-defined categories", () => {
    const event = materializeEvent({ type: "content.progressed", progressPercent: 42 });
    const statement = enrichOrdinaryXapi(
      event,
      TRUSTED_ACTOR,
      buildCmi5HostContext(event, TRUSTED_CMI5_LAUNCH_CONTEXT),
    );

    expect(statement.context).toStrictEqual({
      registration: REGISTRATION_ID,
      contextActivities: {
        grouping: [{ objectType: "Activity", id: PUBLISHER_ACTIVITY_ID }],
      },
      extensions: { [CMI5_SESSION_ID_EXTENSION]: CMI5_SESSION_ID },
    });
    expect(statement.context?.contextActivities).not.toHaveProperty("category");
  });
});

describe("SCORM projection sufficiency", () => {
  it("reduces applicable assessment interactions without answer keys", () => {
    const projection = reduceScorm(EMPTY_SCORM_STATE, materializeEvent(ANSWERED_INPUT));

    expect(projection).toStrictEqual({
      status: "accepted",
      state: {
        ...EMPTY_SCORM_STATE,
        interactions: [
          {
            id: expect.stringContaining("question-one"),
            type: "choice",
            learnerResponse: "option-a",
            result: "correct",
            description: "Which city is the capital of France?",
          },
        ],
      },
    });
  });

  it("reduces only explicit root progress, completion, success, and score", () => {
    const progressed = reduceScorm(
      EMPTY_SCORM_STATE,
      materializeEvent({ type: "content.progressed", progressPercent: 99 }),
    );
    const completed = reduceScorm(
      EMPTY_SCORM_STATE,
      materializeEvent({
        type: "content.completed",
        completion: true,
      }),
    );
    const passed = reduceScorm(
      EMPTY_SCORM_STATE,
      materializeEvent({ type: "content.passed", score: { scaled: 0.6 } }),
    );
    const failed = reduceScorm(EMPTY_SCORM_STATE, materializeEvent({ type: "content.failed" }));

    expect(progressed).toMatchObject({
      status: "accepted",
      state: { progressMeasure: 0.99, completionStatus: "unknown" },
    });
    expect(completed).toMatchObject({
      status: "accepted",
      state: {
        completionStatus: "completed",
        successStatus: "unknown",
        score: null,
      },
    });
    expect(passed).toMatchObject({
      status: "accepted",
      state: { completionStatus: "unknown", successStatus: "passed", score: { scaled: 0.6 } },
    });
    expect(failed).toMatchObject({
      status: "accepted",
      state: { completionStatus: "unknown", successStatus: "failed", score: null },
    });
  });

  it.each([
    {
      type: "surface.experienced",
      surfaceId: "surface-one",
      surfaceKind: "page",
      position: 1,
      count: 1,
    },
    {
      type: "resource.completed",
      resourceId: "resource-one",
      resourceKind: "video",
    },
    {
      type: "learner-activity.completed",
      blockId: "checklist-one",
      activityKind: "checklist",
    },
    {
      type: "quiz.completed",
      quizId: "quiz-one",
      attemptId: "attempt-one",
      startedAt: "2026-08-05T09:59:00.000Z",
      finishedAt: "2026-08-05T10:00:00.000Z",
    },
  ] satisfies readonly CoreLearningEventInput[])(
    "leaves $type explicitly unsupported instead of fabricating root state",
    (input) => {
      expect(reduceScorm(EMPTY_SCORM_STATE, materializeEvent(input))).toStrictEqual({
        status: "unsupported",
        state: EMPTY_SCORM_STATE,
      });
    },
  );
});

describe("projection privacy", () => {
  const PRIVATE_ANSWER_KEY = "PRIVATE_ANSWER_KEY";
  const PRIVATE_CREDENTIAL = "PRIVATE_CREDENTIAL";
  const PRIVATE_ENDPOINT = "https://private.example.test/xapi";
  const PRIVATE_RAW_EVENT = "PRIVATE_RAW_EVENT";
  const PRIVATE_SAVED_STATE = Object.freeze({ page: 4, completedBlocks: ["block-one"] });
  const FORBIDDEN_STRUCTURAL_KEYS = new Set([
    "answerkey",
    "correctresponsespattern",
    "credential",
    "credentials",
    "endpoint",
    "learnersavedstate",
    "learnerstate",
    "raweventjson",
    "savestate",
    "savedlearnerstate",
    "statesnapshot",
  ]);
  const FORBIDDEN_VALUES = new Set<unknown>([
    PRIVATE_ANSWER_KEY,
    PRIVATE_CREDENTIAL,
    PRIVATE_ENDPOINT,
    PRIVATE_RAW_EVENT,
    PRIVATE_SAVED_STATE,
  ]);

  function normalizedStructuralKey(key: string): string {
    return key.toLowerCase().replaceAll(/[^a-z0-9]/gu, "");
  }

  function findForbiddenProjectionData(
    value: unknown,
    path = "$",
    findings: string[] = [],
  ): string[] {
    if (FORBIDDEN_VALUES.has(value)) findings.push(`${path}:forbidden-value`);
    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        findForbiddenProjectionData(item, `${path}[${index}]`, findings),
      );
      return findings;
    }
    if (value === null || typeof value !== "object") return findings;

    for (const [key, nestedValue] of Object.entries(value)) {
      const nestedPath = `${path}.${key}`;
      if (FORBIDDEN_STRUCTURAL_KEYS.has(normalizedStructuralKey(key))) {
        findings.push(`${nestedPath}:forbidden-key`);
      }
      findForbiddenProjectionData(nestedValue, nestedPath, findings);
    }
    return findings;
  }

  it.each([
    {
      label: "correct-response patterns",
      input: {
        ...ANSWERED_INPUT,
        definition: {
          ...ANSWERED_INPUT.definition,
          interaction: {
            ...ANSWERED_INPUT.definition.interaction,
            correctResponsesPattern: [PRIVATE_ANSWER_KEY],
          },
        },
      },
    },
    {
      label: "answer keys",
      input: {
        ...ANSWERED_INPUT,
        definition: { ...ANSWERED_INPUT.definition, answerKey: PRIVATE_ANSWER_KEY },
      },
    },
    {
      label: "credentials",
      input: { ...ANSWERED_INPUT, delivery: { credentials: PRIVATE_CREDENTIAL } },
    },
    { label: "endpoints", input: { ...ANSWERED_INPUT, endpoint: PRIVATE_ENDPOINT } },
    { label: "raw event payloads", input: { ...ANSWERED_INPUT, rawEventJson: PRIVATE_RAW_EVENT } },
    {
      label: "arbitrary learner state",
      input: { ...ANSWERED_INPUT, savedLearnerState: PRIVATE_SAVED_STATE },
    },
  ])("rejects untrusted $label at the closed Core input boundary", ({ input }) => {
    expect(CoreLearningEventInputSchema.safeParse(input).success).toBe(false);
  });

  it("detects forbidden structures and values recursively, including non-string state", () => {
    expect(
      findForbiddenProjectionData({
        mapped: {
          nested: [
            { correctResponsesPattern: [PRIVATE_ANSWER_KEY] },
            { credentials: { token: PRIVATE_CREDENTIAL } },
            { endpoint: PRIVATE_ENDPOINT },
            { rawEventJson: PRIVATE_RAW_EVENT },
            { savedLearnerState: PRIVATE_SAVED_STATE },
          ],
        },
      }),
    ).toEqual(
      expect.arrayContaining([
        "$.mapped.nested[0].correctResponsesPattern:forbidden-key",
        "$.mapped.nested[0].correctResponsesPattern[0]:forbidden-value",
        "$.mapped.nested[1].credentials:forbidden-key",
        "$.mapped.nested[1].credentials.token:forbidden-value",
        "$.mapped.nested[2].endpoint:forbidden-key",
        "$.mapped.nested[2].endpoint:forbidden-value",
        "$.mapped.nested[3].rawEventJson:forbidden-key",
        "$.mapped.nested[3].rawEventJson:forbidden-value",
        "$.mapped.nested[4].savedLearnerState:forbidden-key",
        "$.mapped.nested[4].savedLearnerState:forbidden-value",
      ]),
    );
  });

  it("keeps forbidden private data out of explicitly mapped projection values", () => {
    const answered = materializeEvent(ANSWERED_INPUT);
    const ordinaryXapi = enrichOrdinaryXapi(answered, TRUSTED_ACTOR, {
      registration: REGISTRATION_ID,
      extensions: { [HOST_PLACEMENT_EXTENSION]: "placement-one" },
    });
    const cmi5Event = materializeEvent({
      type: "content.completed",
      completion: true,
      duration: "PT2M",
    });
    const cmi5 = projectCmi5Semantics(cmi5Event);
    const cmi5Statement = enrichOrdinaryXapi(
      cmi5Event,
      TRUSTED_ACTOR,
      buildCmi5HostContext(cmi5Event, TRUSTED_CMI5_LAUNCH_CONTEXT),
    );
    const scorm = reduceScorm(EMPTY_SCORM_STATE, answered);

    expect(findForbiddenProjectionData([ordinaryXapi, cmi5, cmi5Statement, scorm])).toStrictEqual(
      [],
    );
    expect(ordinaryXapi.actor).toStrictEqual(TRUSTED_ACTOR);
    expect(ordinaryXapi.context?.registration).toBe(REGISTRATION_ID);
    expect(ordinaryXapi.result?.response).toBe("option-a");
    expect(cmi5Statement.actor).toStrictEqual(TRUSTED_ACTOR);
    expect(cmi5Statement.context).toStrictEqual(
      buildCmi5HostContext(cmi5Event, TRUSTED_CMI5_LAUNCH_CONTEXT),
    );
    expect(scorm).toMatchObject({
      status: "accepted",
      state: { interactions: [{ learnerResponse: "option-a" }] },
    });
  });
});
