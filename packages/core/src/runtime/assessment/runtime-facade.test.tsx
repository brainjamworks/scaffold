// @vitest-environment happy-dom

import { act, render, renderHook, waitFor } from "@testing-library/react";
import { useEffect, useLayoutEffect, type PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import type { AssessmentResult, QuizAssessmentSettings } from "@scaffold/contracts";
import {
  AssessmentProblemSnapshotSchema,
  QuizAttemptStateSchema,
  SingleSelectResponseSchema,
  type AssessmentProblemSnapshot,
  type QuizAttemptState,
} from "@scaffold/contracts";
import type { AssessmentPort } from "../../host/ports/assessment";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";
import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import { scopeAssessmentGroupId, scopeAssessmentProblemId } from "./assessment-store";
import { AssessmentRuntimeProvider, useAssessmentStoreApi } from "./AssessmentRuntimeProvider";
import {
  useAssessmentProblemFacade,
  useAssessmentProblemFacadeById,
  useAssessmentQuizFacade,
  type AssessmentProblemFacade,
} from "./runtime-facade";
import type {
  AssessmentQuizRegistrationInput,
  AssessmentRegistrationInput,
  AssessmentStoreApi,
} from "./types";

const responseCapability = {
  schema: z.object({ choice: z.string().nullable() }),
  toContractResponse: (response: unknown) =>
    SingleSelectResponseSchema.parse({
      kind: "single-select" as const,
      optionId:
        typeof response === "object" &&
        response !== null &&
        "choice" in response &&
        typeof response.choice === "string"
          ? response.choice
          : null,
    }),
  fromContractResponse: (response: { kind: string; optionId?: string | null }) => ({
    choice: response.kind === "single-select" ? (response.optionId ?? null) : null,
  }),
  hasResponse: (response: unknown) =>
    typeof response === "object" &&
    response !== null &&
    "choice" in response &&
    typeof response.choice === "string",
};

function problemRegistration(
  overrides: Partial<AssessmentRegistrationInput> = {},
): AssessmentRegistrationInput {
  return {
    authoredBlockId: "block_000001",
    targetId: "target_00001",
    interactionKind: "single-select",
    response: responseCapability,
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

const quizSettings: QuizAssessmentSettings = {
  allowBacktracking: false,
  reviewTiming: "after_each_answer",
  reviewDetail: "result_only",
  attemptsPerQuestion: 2,
  isGraded: true,
  passingScore: null,
  timer: { enabled: false, durationSeconds: 300 },
};

function quizRegistration(
  overrides: Partial<AssessmentQuizRegistrationInput> = {},
): AssessmentQuizRegistrationInput {
  return {
    groupId: "quiz__000001",
    targetIds: ["target_00001"],
    settings: quizSettings,
    ...overrides,
  };
}

function assessmentResult(): AssessmentResult {
  return {
    isCorrect: true,
    score: { scaled: 1 },
    feedback: null,
    items: {},
  };
}

function problemSnapshot(
  overrides: Partial<AssessmentProblemSnapshot> = {},
): AssessmentProblemSnapshot {
  return AssessmentProblemSnapshotSchema.parse({
    response: { kind: "single-select", optionId: "hydrat_00001" },
    submitted: false,
    attemptNumber: 0,
    hintsShown: 0,
    checkResult: null,
    submissionResult: null,
    ...overrides,
  });
}

function quizAttempt(groupId: string, overrides: Partial<QuizAttemptState> = {}): QuizAttemptState {
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

function StoreCapture({ onStore }: { onStore: (store: AssessmentStoreApi | null) => void }) {
  const store = useAssessmentStoreApi();
  useEffect(() => onStore(store), [onStore, store]);
  return null;
}

function ProblemFacadeCapture({
  registration,
  onFacade,
}: {
  registration: AssessmentRegistrationInput;
  onFacade: (facade: AssessmentProblemFacade) => void;
}) {
  onFacade(useAssessmentProblemFacade(registration));
  return null;
}

function QuizFacadeRegistration({
  registration,
}: {
  registration: AssessmentQuizRegistrationInput;
}) {
  useAssessmentQuizFacade(registration);
  return null;
}

function QuizRegistrationLayoutCapture({
  authoredGroupId,
  onRegistration,
}: {
  authoredGroupId: string;
  onRegistration: (registered: boolean) => void;
}) {
  const store = useAssessmentStoreApi();
  useLayoutEffect(() => {
    const groupId = scopeAssessmentGroupId("artifact-one", authoredGroupId);
    onRegistration(Boolean(store?.getState().quizRegistrations[groupId]));
  }, [authoredGroupId, onRegistration, store]);
  return null;
}

function createRuntimeWrapper({
  artifactId = "artifact-one",
  assessmentPort = null,
  initialSnapshot,
  onStore = () => {},
}: {
  artifactId?: string | null;
  assessmentPort?: AssessmentPort | null;
  initialSnapshot?: unknown;
  onStore?: (store: AssessmentStoreApi | null) => void;
} = {}) {
  return function RuntimeWrapper({ children }: PropsWithChildren) {
    return (
      <ScaffoldServicesProvider ports={{ assessment: assessmentPort }}>
        <ScaffoldArtifactIdentityProvider artifactId={artifactId}>
          <AssessmentRuntimeProvider initialSnapshot={initialSnapshot}>
            <StoreCapture onStore={onStore} />
            {children}
          </AssessmentRuntimeProvider>
        </ScaffoldArtifactIdentityProvider>
      </ScaffoldServicesProvider>
    );
  };
}

describe("assessment problem facade", () => {
  it("reports use outside the assessment provider consistently", () => {
    expect(() => renderHook(() => useAssessmentProblemFacadeById("problm_00001"))).toThrow(
      "Assessment store hooks must be used inside an AssessmentRuntimeProvider.",
    );
  });

  it("reports an invalid artifact store explicitly", () => {
    const wrapper = createRuntimeWrapper({ artifactId: " " });
    expect(() =>
      renderHook(() => useAssessmentProblemFacadeById("problm_00001"), { wrapper }),
    ).toThrow("Assessment store selectors require a valid runtime artifact identity.");
  });

  it("represents unsafe identity and missing registration without local response data", () => {
    const wrapper = createRuntimeWrapper();
    const { result } = renderHook(
      () => ({
        unsafe: useAssessmentProblemFacade(problemRegistration({ authoredBlockId: " " })),
        missing: useAssessmentProblemFacadeById("notreg_00001"),
      }),
      { wrapper },
    );

    expect(result.current.unsafe).toMatchObject({
      status: "unsafe-identity",
      problemId: null,
      problem: null,
      localResponse: null,
    });
    expect(result.current.missing).toMatchObject({
      status: "missing-registration",
      problem: null,
      localResponse: null,
    });
  });

  it("registers a parent and lets a child attach to the same scoped record and capability", async () => {
    const registration = problemRegistration();
    const wrapper = createRuntimeWrapper();
    const statuses: string[] = [];
    const { result } = renderHook(
      () => {
        const parent = useAssessmentProblemFacade(registration);
        const child = useAssessmentProblemFacadeById("block_000001", "single-select");
        statuses.push(parent.status);
        return { child, parent };
      },
      { wrapper },
    );

    await waitFor(() => expect(result.current.parent.status).toBe("registered"));
    expect(statuses).toContain("missing-registration");
    expect(result.current.parent.problemId).toBe(
      scopeAssessmentProblemId("artifact-one", "block_000001"),
    );
    expect(result.current.child.problemId).toBe(result.current.parent.problemId);
    expect(result.current.child.capability).toBe(responseCapability);
    expect(result.current.child.problem).toBe(result.current.parent.problem);
  });

  it("decodes hydrated canonical response through the registered capability", async () => {
    const wrapper = createRuntimeWrapper({
      initialSnapshot: {
        snapshotVersion: 2,
        artifactId: "artifact-one",
        problems: { target_00001: problemSnapshot() },
        quizzes: {},
      },
    });
    const registration = problemRegistration();
    const { result } = renderHook(() => useAssessmentProblemFacade(registration), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("registered"));
    expect(result.current.problem?.response).toEqual({
      kind: "single-select",
      optionId: "hydrat_00001",
    });
    expect(result.current.localResponse).toEqual({ choice: "hydrat_00001" });
    expect(result.current.responseReady).toBe(true);
  });

  it("validates local response and stores only the canonical encoding", async () => {
    const wrapper = createRuntimeWrapper();
    const registration = problemRegistration();
    const { result } = renderHook(() => useAssessmentProblemFacade(registration), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("registered"));

    act(() =>
      expect(result.current.actions.setLocalResponse({ choice: "option_00002" })).toBe(true),
    );
    expect(result.current.problem?.response).toEqual({
      kind: "single-select",
      optionId: "option_00002",
    });
    expect(result.current.localResponse).toEqual({ choice: "option_00002" });

    act(() => expect(result.current.actions.setLocalResponse({ choice: 42 })).toBe(false));
    expect(result.current.problem?.response).toEqual({
      kind: "single-select",
      optionId: "option_00002",
    });
  });

  it("binds problem actions to the store-captured port", async () => {
    const check = vi.fn().mockImplementation(async (args) => ({
      problem: problemSnapshot({
        response: args.response,
        attemptNumber: 1,
        checkResult: assessmentResult(),
      }),
    }));
    const submit = vi.fn().mockImplementation(async (args) => ({
      problem: problemSnapshot({
        response: args.response,
        attemptNumber: 1,
        submitted: true,
        submissionResult: assessmentResult(),
      }),
    }));
    const revealHint = vi.fn().mockResolvedValue({
      problem: problemSnapshot({
        response: SingleSelectResponseSchema.parse({
          kind: "single-select",
          optionId: "option_00002",
        }),
        hintsShown: 1,
      }),
    });
    const revealAnswer = vi.fn().mockResolvedValue({
      answerKey: { kind: "single-select", correctOptionId: "option_00002", feedbackByOptionId: {} },
    });
    const wrapper = createRuntimeWrapper({
      assessmentPort: { type: "runtime", check, submit, revealHint, revealAnswer },
    });
    const registration = problemRegistration();
    const { result } = renderHook(() => useAssessmentProblemFacade(registration), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("registered"));

    await act(async () => {
      result.current.actions.setLocalResponse({ choice: "option_00002" });
      await expect(result.current.actions.revealHint()).resolves.toBe(true);
    });
    await act(() => result.current.actions.check());
    await act(() => result.current.actions.revealAnswer());
    expect(result.current.revealedAnswer?.answerKey).toMatchObject({
      kind: "single-select",
      correctOptionId: "option_00002",
    });
    act(() => expect(result.current.actions.reset()).toBe(true));
    act(() => {
      result.current.actions.setLocalResponse({ choice: "option_00002" });
    });
    await act(() => result.current.actions.submit());

    expect(check).toHaveBeenCalledWith(
      expect.objectContaining({
        problemId: scopeAssessmentProblemId("artifact-one", "block_000001"),
        targetId: "target_00001",
      }),
    );
    expect(submit).toHaveBeenCalledOnce();
    expect(revealHint).toHaveBeenCalledWith({
      problemId: scopeAssessmentProblemId("artifact-one", "block_000001"),
      targetId: "target_00001",
      interactionKind: "single-select",
      hintsShown: 1,
    });
    expect(revealAnswer).toHaveBeenCalledOnce();
  });

  it("selects pending, error, and authorized reveal as transient facade state", async () => {
    let rejectCheck: (error: Error) => void = () => {};
    const pendingCheck = new Promise<{ problem: AssessmentProblemSnapshot }>((_resolve, reject) => {
      rejectCheck = reject;
    });
    const wrapper = createRuntimeWrapper({
      assessmentPort: {
        type: "runtime",
        check: () => pendingCheck,
        submit: vi.fn(),
        revealAnswer: vi.fn().mockResolvedValue({
          answerKey: {
            kind: "single-select",
            correctOptionId: "option_00002",
            feedbackByOptionId: {},
          },
        }),
      },
    });
    const registration = problemRegistration();
    const { result } = renderHook(() => useAssessmentProblemFacade(registration), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("registered"));
    act(() => {
      result.current.actions.setLocalResponse({ choice: "option_00002" });
    });

    let request!: Promise<AssessmentResult | null>;
    act(() => {
      request = result.current.actions.check();
    });
    expect(result.current.request).toMatchObject({ status: "pending", operation: "check" });
    rejectCheck(new Error("host unavailable"));
    await act(() => request);
    expect(result.current.request).toMatchObject({ status: "error", error: "host unavailable" });

    await act(() => result.current.actions.revealAnswer());
    expect(result.current.request).toBeNull();
    expect(result.current.revealedAnswer).not.toBeNull();
  });

  it("fails explicitly when a child expects the wrong registered interaction kind", async () => {
    const registration = problemRegistration();
    const wrapper = createRuntimeWrapper();
    const hook = renderHook(
      ({ expected }: { expected: "single-select" | "multi-select" }) => {
        useAssessmentProblemFacade(registration);
        return useAssessmentProblemFacadeById("block_000001", expected);
      },
      { initialProps: { expected: "single-select" }, wrapper },
    );
    await waitFor(() => expect(hook.result.current.status).toBe("registered"));

    expect(() => hook.rerender({ expected: "multi-select" })).toThrow(
      'Assessment facade expected "multi-select" interaction for "block_000001", but registered "single-select".',
    );
  });

  it("updates config without erasing durable state and unregisters only runtime registration state", async () => {
    const stores: AssessmentStoreApi[] = [];
    const onStore = (store: AssessmentStoreApi | null) => {
      if (store) stores.push(store);
    };
    const wrapper = createRuntimeWrapper({
      assessmentPort: null,
      initialSnapshot: {
        snapshotVersion: 2,
        artifactId: "artifact-one",
        problems: { target_00001: problemSnapshot() },
        quizzes: {},
      },
      onStore,
    });
    const first = problemRegistration();
    const changed = problemRegistration({
      config: { ...first.config, hintsTotal: 5 },
    });
    const facades: AssessmentProblemFacade[] = [];
    const onFacade = (nextFacade: AssessmentProblemFacade) => {
      facades.push(nextFacade);
    };
    const Wrapper = wrapper;
    const mounted = render(
      <Wrapper>
        <ProblemFacadeCapture registration={first} onFacade={onFacade} />
      </Wrapper>,
    );
    await waitFor(() => expect(facades.at(-1)?.status).toBe("registered"));
    const store = stores[0];
    if (!store) throw new Error("expected captured assessment store");
    const problemId = scopeAssessmentProblemId("artifact-one", "block_000001");
    const durableBefore = store.getState().durable.problems[problemId];

    mounted.rerender(
      <Wrapper>
        <ProblemFacadeCapture registration={changed} onFacade={onFacade} />
      </Wrapper>,
    );
    await waitFor(() =>
      expect(store.getState().registrations[problemId]?.config.hintsTotal).toBe(5),
    );
    expect(store.getState().durable.problems[problemId]).toBe(durableBefore);
    const capturedFacade = facades.at(-1);
    if (!capturedFacade) throw new Error("expected captured problem facade");
    await act(() => capturedFacade.actions.submit());
    expect(store.getState().requests[problemId]?.status).toBe("error");

    mounted.rerender(<Wrapper />);
    expect(store.getState().registrations[problemId]).toBeUndefined();
    expect(store.getState().requests[problemId]).toBeUndefined();
    expect(store.getState().durable.problems[problemId]).toBe(durableBefore);
  });

  it("isolates simultaneous roots with identical authored problem ids", async () => {
    const firstRegistration = problemRegistration();
    const secondRegistration = problemRegistration();
    const first = renderHook(() => useAssessmentProblemFacade(firstRegistration), {
      wrapper: createRuntimeWrapper(),
    });
    const second = renderHook(() => useAssessmentProblemFacade(secondRegistration), {
      wrapper: createRuntimeWrapper(),
    });
    await waitFor(() => expect(first.result.current.status).toBe("registered"));
    await waitFor(() => expect(second.result.current.status).toBe("registered"));

    act(() => {
      first.result.current.actions.setLocalResponse({ choice: "option_00001" });
    });
    act(() => {
      second.result.current.actions.setLocalResponse({ choice: "option_00002" });
    });

    expect(first.result.current.localResponse).toEqual({ choice: "option_00001" });
    expect(second.result.current.localResponse).toEqual({ choice: "option_00002" });
  });
});

describe("assessment Quiz facade", () => {
  it("registers a Quiz before later layout observers run", () => {
    const registration = quizRegistration();
    const registrationsAtLayout: boolean[] = [];
    const Wrapper = createRuntimeWrapper();

    render(
      <Wrapper>
        <QuizFacadeRegistration registration={registration} />
        <QuizRegistrationLayoutCapture
          authoredGroupId={registration.groupId}
          onRegistration={(registered) => registrationsAtLayout.push(registered)}
        />
      </Wrapper>,
    );

    expect(registrationsAtLayout).toEqual([true]);
  });

  it("registers an artifact-scoped Quiz and selects its relevant problem snapshots", async () => {
    const wrapper = createRuntimeWrapper();
    const problem = problemRegistration();
    const quiz = quizRegistration();
    const { result } = renderHook(
      () => {
        const problemFacade = useAssessmentProblemFacade(problem);
        const quizFacade = useAssessmentQuizFacade(quiz);
        return { problemFacade, quizFacade };
      },
      { wrapper },
    );
    await waitFor(() => expect(result.current.quizFacade.status).toBe("registered"));
    act(() => {
      result.current.problemFacade.actions.setLocalResponse({ choice: "option_00002" });
    });

    expect(result.current.quizFacade.groupId).toBe(
      scopeAssessmentGroupId("artifact-one", "quiz__000001"),
    );
    expect(result.current.quizFacade.problemsByTargetId["target_00001"]).toMatchObject({
      authoredBlockId: "block_000001",
      responseReady: true,
      problem: { response: { kind: "single-select", optionId: "option_00002" } },
    });
  });

  it("uses the captured Quiz port and requires no port action argument", async () => {
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz__000001");
    const startAttempt = vi.fn().mockResolvedValue({
      quizAttempt: quizAttempt(groupId),
      problemsByTargetId: {},
    });
    const wrapper = createRuntimeWrapper({
      assessmentPort: {
        type: "runtime",
        submit: vi.fn(),
        quiz: {
          startAttempt,
          submitQuestion: vi.fn(),
          finishAttempt: vi.fn(),
        },
      },
    });
    const registration = quizRegistration();
    const { result } = renderHook(() => useAssessmentQuizFacade(registration), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("registered"));

    expect(result.current.available).toBe(true);
    await act(() => result.current.actions.start());
    expect(startAttempt).toHaveBeenCalledWith({ groupId });
    expect(result.current.attempt?.attemptId).toBe("attempt-one");
    expect(Object.keys(result.current.actions).sort()).toEqual([
      "expire",
      "finish",
      "revealAnswers",
      "start",
      "submitQuestion",
    ]);
  });

  it("reports a missing Quiz port unavailable and keeps actions fail-closed", async () => {
    const wrapper = createRuntimeWrapper({ assessmentPort: null });
    const registration = quizRegistration();
    const { result } = renderHook(() => useAssessmentQuizFacade(registration), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("registered"));

    expect(result.current.available).toBe(false);
    await expect(result.current.actions.start()).resolves.toBeNull();
    expect(result.current.request).toMatchObject({
      operation: "quiz-start",
      status: "error",
      error: "Quiz start is unavailable",
    });
  });

  it("unregistering one Quiz root does not affect a sibling root", async () => {
    const firstStores: AssessmentStoreApi[] = [];
    const secondStores: AssessmentStoreApi[] = [];
    const registration = quizRegistration();
    const first = renderHook(() => useAssessmentQuizFacade(registration), {
      wrapper: createRuntimeWrapper({
        onStore: (store) => {
          if (store) firstStores.push(store);
        },
      }),
    });
    const second = renderHook(() => useAssessmentQuizFacade(registration), {
      wrapper: createRuntimeWrapper({
        onStore: (store) => {
          if (store) secondStores.push(store);
        },
      }),
    });
    await waitFor(() => expect(first.result.current.status).toBe("registered"));
    await waitFor(() => expect(second.result.current.status).toBe("registered"));
    const groupId = scopeAssessmentGroupId("artifact-one", "quiz__000001");
    expect(firstStores[0]).not.toBe(secondStores[0]);

    first.unmount();
    await waitFor(() =>
      expect(firstStores[0]?.getState().quizRegistrations[groupId]).toBeUndefined(),
    );
    expect(secondStores[0]?.getState().quizRegistrations[groupId]).toBeDefined();
  });
});
