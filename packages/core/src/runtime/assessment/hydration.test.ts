// @vitest-environment happy-dom

import { render } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import {
  AssessmentLearnerSnapshotSchema,
  AssessmentProblemSnapshotSchema,
  AnswerRevealSchema,
  QuizAttemptSnapshotSchema,
  SingleSelectResponseSchema,
  type AssessmentLearnerSnapshot,
  type AssessmentProblemSnapshot,
  type QuizAttemptSnapshot,
} from "@scaffold/contracts";
import {
  createAssessmentStore,
  scopeAssessmentGroupId,
  scopeAssessmentProblemId,
} from "./assessment-store";
import { AssessmentRuntimeProvider, useAssessmentStoreApi } from "./AssessmentRuntimeProvider";
import { hydrateAssessmentSnapshot, projectAssessmentSnapshot } from "./hydration";
import type { AssessmentRegistrationInput, AssessmentStoreApi } from "./types";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";
import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";

const problem: AssessmentProblemSnapshot = AssessmentProblemSnapshotSchema.parse({
  response: { kind: "single-select", optionId: "option_00001" },
  submitted: true,
  attemptNumber: 1,
  hintsShown: 1,
  checkResult: null,
  submissionResult: {
    isCorrect: true,
    score: { scaled: 1 },
    feedback: null,
    items: {},
  },
});

const quiz: QuizAttemptSnapshot = QuizAttemptSnapshotSchema.parse({
  attemptId: "attempt-one",
  status: "in_progress",
  currentTargetId: "target_00001",
  submittedTargetIds: [],
  startedAt: "2026-07-16T09:00:00Z",
  finishedAt: null,
  expiresAt: null,
  score: null,
  successStatus: null,
  resultsByTargetId: {},
  answerReviewAuthorized: false,
});

function snapshot(
  overrides: Partial<z.input<typeof AssessmentLearnerSnapshotSchema>> = {},
): AssessmentLearnerSnapshot {
  return AssessmentLearnerSnapshotSchema.parse({
    snapshotVersion: 2,
    artifactId: "artifact-one",
    problems: { target_00001: problem },
    quizzes: { quiz__000001: quiz },
    ...overrides,
  });
}

function registration(
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
      learningEventDefinition: {
        interaction: { kind: "single-select", options: [] },
      },
    },
    ...overrides,
  };
}

function StoreProbe({ onRender }: { onRender: (store: AssessmentStoreApi | null) => void }) {
  onRender(useAssessmentStoreApi());
  return null;
}

function requiredStore(stores: readonly AssessmentStoreApi[], index = 0): AssessmentStoreApi {
  const store = stores[index];
  if (!store) throw new Error(`expected assessment store at index ${index}`);
  return store;
}

function serializedMutableState(store: AssessmentStoreApi): string {
  const state = store.getState();
  return JSON.stringify({
    durable: state.durable,
    quizRegistrations: state.quizRegistrations,
    registrations: state.registrations,
    requests: state.requests,
    targetBindings: state.targetBindings,
    transient: state.transient,
  });
}

function runtimeRoot({
  initialSnapshot,
  onRender,
}: {
  initialSnapshot?: unknown;
  onRender: (store: AssessmentStoreApi | null) => void;
}) {
  const assessmentProvider = createElement(
    AssessmentRuntimeProvider,
    initialSnapshot === undefined
      ? { children: createElement(StoreProbe, { onRender }) }
      : { children: createElement(StoreProbe, { onRender }), initialSnapshot },
  );
  return createElement(ScaffoldServicesProvider, {
    children: createElement(ScaffoldArtifactIdentityProvider, {
      artifactId: "artifact-one",
      children: assessmentProvider,
    }),
    ports: { assessment: null },
  });
}

describe("assessment snapshot hydration", () => {
  it("hydrates strict canonical records and projects the same v2 snapshot", () => {
    const store = createAssessmentStore({ artifactId: "artifact-one", assessmentPort: null });
    const value = snapshot();

    hydrateAssessmentSnapshot(store, value);

    const problemId = scopeAssessmentProblemId("artifact-one", "target_00001");
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz__000001");
    expect(store.getState().durable.problems[problemId]).toEqual(problem);
    expect(store.getState().durable.quizzes[groupId]).toEqual({ ...quiz, groupId });
    expect(projectAssessmentSnapshot(store)).toEqual(value);
    expect(AssessmentLearnerSnapshotSchema.parse(projectAssessmentSnapshot(store))).toEqual(value);
  });

  it("preserves historical null success without consulting the Learning Event session", () => {
    const getLearningEventSession = vi.fn();
    const historicalQuiz: QuizAttemptSnapshot = QuizAttemptSnapshotSchema.parse({
      ...quiz,
      status: "completed",
      currentTargetId: null,
      submittedTargetIds: ["target_00001"],
      finishedAt: "2026-07-16T09:05:00Z",
      score: { scaled: 1 },
      successStatus: null,
    });
    const store = createAssessmentStore({
      artifactId: "artifact-one",
      assessmentPort: null,
      getLearningEventSession,
    });

    hydrateAssessmentSnapshot(store, snapshot({ quizzes: { quiz__000001: historicalQuiz } }));

    const groupId = scopeAssessmentGroupId("artifact-one", "quiz__000001");
    expect(store.getState().durable.quizzes[groupId]?.successStatus).toBeNull();
    expect(projectAssessmentSnapshot(store).quizzes["quiz__000001"]?.successStatus).toBeNull();
    expect(getLearningEventSession).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed", { ...snapshot(), problems: { target_00001: { ...problem, response: {} } } }],
    ["extra-field", { ...snapshot(), provider: "xblock" }],
    ["legacy-version", { ...snapshot(), snapshotVersion: 1 }],
    ["future-version", { ...snapshot(), snapshotVersion: 3 }],
    ["foreign-artifact", { ...snapshot(), artifactId: "artifact-two" }],
  ])("rejects %s input without changing existing store state", (_name, value) => {
    const store = createAssessmentStore({ artifactId: "artifact-one", assessmentPort: null });
    const existingProblemId = scopeAssessmentProblemId("artifact-one", "existg_00001");
    store.setState({
      durable: { problems: { [existingProblemId]: problem }, quizzes: {} },
      requests: {
        [existingProblemId]: {
          ownerId: existingProblemId,
          requestId: "existing-request",
          operation: "submit",
          status: "error",
          error: "existing failure",
        },
      },
      targetBindings: { [existingProblemId]: "existg_00001" },
      transient: {
        responseReady: { [existingProblemId]: true },
        revealedAnswers: {},
        answerViews: {},
      },
    });
    const before = serializedMutableState(store);

    expect(() => hydrateAssessmentSnapshot(store, value)).toThrow();

    expect(serializedMutableState(store)).toBe(before);
  });

  it("rejects a later invalid entry without applying an earlier valid entry", () => {
    const store = createAssessmentStore({ artifactId: "artifact-one", assessmentPort: null });
    const value = {
      ...snapshot(),
      problems: {
        target_00001: problem,
        target_00002: { ...problem, response: { kind: "single-select", optionId: 42 } },
      },
    };

    expect(() => hydrateAssessmentSnapshot(store, value)).toThrow();
    expect(store.getState().durable).toEqual({ problems: {}, quizzes: {} });
  });

  it("binds canonical target keys at registration and excludes non-durable runtime state", () => {
    const store = createAssessmentStore({ artifactId: "artifact-one", assessmentPort: null });
    hydrateAssessmentSnapshot(store, snapshot());
    store.getState().register(registration());
    const problemId = scopeAssessmentProblemId("artifact-one", "block_000001");
    store.setState({
      requests: {
        [problemId]: {
          ownerId: problemId,
          requestId: "request-one",
          operation: "reveal-answer",
          status: "error",
          error: "denied",
        },
      },
      transient: {
        responseReady: { [problemId]: true },
        revealedAnswers: {
          [problemId]: AnswerRevealSchema.parse({
            answerKey: {
              kind: "single-select",
              correctOptionId: "option_00001",
              feedbackByOptionId: {},
            },
          }),
        },
        answerViews: { [problemId]: "correct" },
      },
    });

    const projected = projectAssessmentSnapshot(store);

    expect(projected).toEqual(snapshot());
    expect(projected.problems["target_00001"]).not.toHaveProperty("responseReady");
    expect(projected.problems["target_00001"]).not.toHaveProperty("revealedAnswer");
    expect(projected).not.toHaveProperty("answerViews");
    expect(projected.quizzes["quiz__000001"]).not.toHaveProperty("groupId");
    expect(projected).not.toHaveProperty("registrations");
    expect(projected).not.toHaveProperty("requests");

    store.getState().unregister(registration());
    expect(projectAssessmentSnapshot(store)).toEqual(snapshot());
  });

  it("atomically replaces durable state without adding runtime lifecycle fields", () => {
    const store = createAssessmentStore({ artifactId: "artifact-one", assessmentPort: null });
    hydrateAssessmentSnapshot(store, snapshot());
    const replacement = snapshot({ problems: {}, quizzes: {} });

    hydrateAssessmentSnapshot(store, replacement);

    const projected = projectAssessmentSnapshot(store);

    expect(projected).toEqual(replacement);
    expect(Object.keys(projected).sort()).toEqual([
      "artifactId",
      "problems",
      "quizzes",
      "snapshotVersion",
    ]);
  });

  it("hydrates provider state before its child first renders", () => {
    const stores: AssessmentStoreApi[] = [];

    render(
      runtimeRoot({
        initialSnapshot: snapshot(),
        onRender: (store) => {
          if (store) stores.push(store);
        },
      }),
    );

    expect(stores).toHaveLength(1);
    expect(projectAssessmentSnapshot(requiredStore(stores))).toEqual(snapshot());
  });

  it("does not treat new snapshot object identity as live synchronization", () => {
    const stores: AssessmentStoreApi[] = [];
    const onRender = (store: AssessmentStoreApi | null) => {
      if (store) stores.push(store);
    };
    const mounted = render(runtimeRoot({ initialSnapshot: snapshot(), onRender }));
    const firstStore = requiredStore(stores);
    const problemId = scopeAssessmentProblemId("artifact-one", "target_00001");
    firstStore.setState({
      durable: {
        ...firstStore.getState().durable,
        problems: {
          [problemId]: {
            ...problem,
            response: SingleSelectResponseSchema.parse({
              kind: "single-select",
              optionId: "localc_00001",
            }),
          },
        },
      },
    });

    mounted.rerender(
      runtimeRoot({
        initialSnapshot: snapshot({
          problems: {
            target_00001: {
              ...problem,
              response: { kind: "single-select", optionId: "newval_00001" },
            },
          },
        }),
        onRender,
      }),
    );

    expect(stores.at(-1)).toBe(firstStore);
    expect(firstStore.getState().durable.problems[problemId]?.response).toEqual({
      kind: "single-select",
      optionId: "localc_00001",
    });
  });

  it("hydrates a supplied snapshot for a fresh remount and leaves a missing snapshot empty", () => {
    const firstStores: AssessmentStoreApi[] = [];
    const first = render(
      runtimeRoot({
        onRender: (store) => {
          if (store) firstStores.push(store);
        },
      }),
    );
    expect(firstStores[0]?.getState().durable).toEqual({ problems: {}, quizzes: {} });
    first.unmount();

    const remountedStores: AssessmentStoreApi[] = [];
    render(
      runtimeRoot({
        initialSnapshot: snapshot(),
        onRender: (store) => {
          if (store) remountedStores.push(store);
        },
      }),
    );

    expect(remountedStores[0]).not.toBe(firstStores[0]);
    expect(projectAssessmentSnapshot(requiredStore(remountedStores))).toEqual(snapshot());
  });
});
