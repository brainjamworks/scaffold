// @vitest-environment happy-dom

import { render } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import {
  AssessmentLearnerSnapshotSchema,
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

const problem: AssessmentProblemSnapshot = {
  response: { kind: "single-select", optionId: "option-a" },
  submitted: true,
  attemptNumber: 1,
  hintsShown: 1,
  checkResult: null,
  submissionResult: {
    isCorrect: true,
    score: 1,
    maxScore: 1,
    feedback: null,
    items: {},
  },
};

const quiz: QuizAttemptSnapshot = {
  attemptId: "attempt-one",
  status: "in_progress",
  currentTargetId: "target-one",
  submittedTargetIds: [],
  startedAt: "2026-07-16T09:00:00Z",
  finishedAt: null,
  expiresAt: null,
  score: null,
  maxScore: null,
  resultsByTargetId: {},
  answerReviewAuthorized: false,
};

function snapshot(overrides: Partial<AssessmentLearnerSnapshot> = {}): AssessmentLearnerSnapshot {
  return {
    snapshotVersion: 1,
    artifactId: "artifact-one",
    problems: { "target-one": problem },
    quizzes: { "quiz-one": quiz },
    ...overrides,
  };
}

function registration(
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
  it("hydrates strict canonical records and projects the same v1 snapshot", () => {
    const store = createAssessmentStore({ artifactId: "artifact-one", assessmentPort: null });
    const value = snapshot();

    hydrateAssessmentSnapshot(store, value);

    const problemId = scopeAssessmentProblemId("artifact-one", "target-one");
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz-one");
    expect(store.getState().durable.problems[problemId]).toEqual(problem);
    expect(store.getState().durable.quizzes[groupId]).toEqual({ ...quiz, groupId });
    expect(projectAssessmentSnapshot(store)).toEqual(value);
    expect(AssessmentLearnerSnapshotSchema.parse(projectAssessmentSnapshot(store))).toEqual(value);
  });

  it.each([
    ["malformed", { ...snapshot(), problems: { "target-one": { ...problem, response: {} } } }],
    ["extra-field", { ...snapshot(), provider: "xblock" }],
    ["future-version", { ...snapshot(), snapshotVersion: 2 }],
    ["foreign-artifact", { ...snapshot(), artifactId: "artifact-two" }],
  ])("rejects %s input without changing existing store state", (_name, value) => {
    const store = createAssessmentStore({ artifactId: "artifact-one", assessmentPort: null });
    const existingProblemId = scopeAssessmentProblemId("artifact-one", "existing-target");
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
      targetBindings: { [existingProblemId]: "existing-target" },
      transient: {
        responseReady: { [existingProblemId]: true },
        revealedAnswers: {},
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
        "target-one": problem,
        "target-two": { ...problem, response: { kind: "single-select", optionId: 42 } },
      },
    };

    expect(() => hydrateAssessmentSnapshot(store, value)).toThrow();
    expect(store.getState().durable).toEqual({ problems: {}, quizzes: {} });
  });

  it("binds canonical target keys at registration and excludes non-durable runtime state", () => {
    const store = createAssessmentStore({ artifactId: "artifact-one", assessmentPort: null });
    hydrateAssessmentSnapshot(store, snapshot());
    store.getState().register(registration());
    const problemId = scopeAssessmentProblemId("artifact-one", "block-one");
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
          [problemId]: {
            answerKey: {
              kind: "single-select",
              correctOptionId: "option-a",
              feedbackByOptionId: {},
            },
          },
        },
      },
    });

    const projected = projectAssessmentSnapshot(store);

    expect(projected).toEqual(snapshot());
    expect(projected.problems["target-one"]).not.toHaveProperty("responseReady");
    expect(projected.problems["target-one"]).not.toHaveProperty("revealedAnswer");
    expect(projected.quizzes["quiz-one"]).not.toHaveProperty("groupId");
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
    const problemId = scopeAssessmentProblemId("artifact-one", "target-one");
    firstStore.setState({
      durable: {
        ...firstStore.getState().durable,
        problems: {
          [problemId]: {
            ...problem,
            response: { kind: "single-select", optionId: "locally-changed" },
          },
        },
      },
    });

    mounted.rerender(
      runtimeRoot({
        initialSnapshot: snapshot({
          problems: {
            "target-one": {
              ...problem,
              response: { kind: "single-select", optionId: "new-prop-value" },
            },
          },
        }),
        onRender,
      }),
    );

    expect(stores.at(-1)).toBe(firstStore);
    expect(firstStore.getState().durable.problems[problemId]?.response).toEqual({
      kind: "single-select",
      optionId: "locally-changed",
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
