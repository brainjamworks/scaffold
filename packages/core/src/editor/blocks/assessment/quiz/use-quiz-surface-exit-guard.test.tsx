// @vitest-environment jsdom

import type { EmbeddedNodeId, QuizAttemptState } from "@scaffold/contracts";
import { Editor, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { useLayoutEffect, type PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { SurfaceId } from "@/document/model/course-structure";
import { resolveAssessmentSurfaceScope } from "@/runtime/assessment/assessment-scope";
import {
  createAssessmentStore,
  scopeAssessmentGroupId,
} from "@/runtime/assessment/assessment-store";
import type { AssessmentStoreApi } from "@/runtime/assessment/types";
import {
  createSurfaceExitEnvironment,
  type SurfaceExitEnvironmentOwner,
} from "@/runtime/players/slideshow/surface-exit-environment";
import { SurfaceExitEnvironmentProvider } from "@/runtime/players/slideshow/SurfaceExitEnvironmentProvider";

import { useQuizSurfaceExitGuard } from "./use-quiz-surface-exit-guard";

const QUIZ_ID = "quiz00000001" as EmbeddedNodeId;
const QUESTION_ID = "quest0000001" as EmbeddedNodeId;
const SURFACE_1 = "surface00001" as SurfaceId;
const SURFACE_2 = "surface00002" as SurfaceId;
const GROUP_ID = scopeAssessmentGroupId("artifact-one", QUIZ_ID);
const editors: Editor[] = [];
const environmentOwners: SurfaceExitEnvironmentOwner[] = [];

afterEach(() => {
  cleanup();
  for (const editor of editors.splice(0)) editor.destroy();
  for (const owner of environmentOwners.splice(0)) owner.dispose();
});

describe("useQuizSurfaceExitGuard", () => {
  it("does not register or inspect Quiz lifecycle state without a player environment", () => {
    const editor = createEditor();
    const store = createStore();
    const getPos = vi.fn(() => findQuizPosition(editor));
    const subscribe = vi.spyOn(store, "subscribe");

    renderHook(() =>
      useQuizSurfaceExitGuard({
        editor,
        enabled: true,
        getPos,
        groupId: GROUP_ID,
        resolveSurfaceScope: resolveAssessmentSurfaceScope,
        store,
      }),
    );

    expect(getPos).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("registers an unstarted Quiz before pre-paint layout observers run", () => {
    const editor = createEditor();
    const store = createStore();
    const owner = createEnvironment([SURFACE_1], SURFACE_1);
    const snapshotsAtLayout: unknown[] = [];

    function LayoutBoundaryHarness() {
      useQuizSurfaceExitGuard({
        editor,
        enabled: true,
        getPos: () => findQuizPosition(editor),
        groupId: GROUP_ID,
        resolveSurfaceScope: resolveAssessmentSurfaceScope,
        store,
      });
      useLayoutEffect(() => {
        snapshotsAtLayout.push(owner.environment.getSnapshot());
      }, []);
      return null;
    }

    render(
      <SurfaceExitEnvironmentProvider environment={owner.environment}>
        <LayoutBoundaryHarness />
      </SurfaceExitEnvironmentProvider>,
    );

    expect(snapshotsAtLayout).toEqual([
      {
        status: "blocked",
        surfaceId: SURFACE_1,
        blockers: [
          {
            reason: "quiz-not-complete",
            ownerId: GROUP_ID,
            surfaceId: SURFACE_1,
            attemptStatus: "not_started",
          },
        ],
      },
    ]);
  });

  it("does not register an empty or unregistered Quiz", () => {
    const editor = createEditor({ withQuestion: false });
    const owner = createEnvironment([SURFACE_1], SURFACE_1);
    const registeredStore = createStore();
    const disabledPosition = vi.fn(() => findQuizPosition(editor));
    const disabled = renderGuard({
      editor,
      enabled: false,
      environmentOwner: owner,
      getPos: disabledPosition,
      store: registeredStore,
    });

    expect(owner.environment.getSnapshot()).toEqual({
      status: "allowed",
      surfaceId: SURFACE_1,
      blockers: [],
    });
    expect(disabledPosition).not.toHaveBeenCalled();
    disabled.unmount();

    const unregisteredStore = createStore({ registered: false });
    const unregisteredEditor = createEditor();
    const unregisteredPosition = vi.fn(() => findQuizPosition(unregisteredEditor));
    renderGuard({
      editor: unregisteredEditor,
      enabled: true,
      environmentOwner: owner,
      getPos: unregisteredPosition,
      store: unregisteredStore,
    });

    expect(owner.environment.getSnapshot()).toEqual({
      status: "allowed",
      surfaceId: SURFACE_1,
      blockers: [],
    });
    expect(unregisteredPosition).not.toHaveBeenCalled();
  });

  it("publishes the authoritative Quiz attempt policy and exact blocker facts", () => {
    const editor = createEditor();
    const store = createStore();
    const owner = createEnvironment([SURFACE_1], SURFACE_1);
    const publish = vi.fn();
    owner.environment.subscribe(publish);

    renderGuard({ editor, environmentOwner: owner, store });

    expect(owner.environment.getSnapshot()).toEqual({
      status: "blocked",
      surfaceId: SURFACE_1,
      blockers: [
        {
          reason: "quiz-not-complete",
          ownerId: GROUP_ID,
          surfaceId: SURFACE_1,
          attemptStatus: "not_started",
        },
      ],
    });

    act(() => setAttempt(store, attempt("in_progress")));
    expect(owner.environment.getSnapshot()).toEqual({
      status: "blocked",
      surfaceId: SURFACE_1,
      blockers: [
        {
          reason: "quiz-not-complete",
          ownerId: GROUP_ID,
          surfaceId: SURFACE_1,
          attemptStatus: "in_progress",
        },
      ],
    });

    act(() => setAttempt(store, attempt("completed")));
    expect(owner.environment.getSnapshot()).toEqual({
      status: "allowed",
      surfaceId: SURFACE_1,
      blockers: [],
    });

    act(() => setAttempt(store, attempt("in_progress", "attempt-two")));
    expect(owner.environment.getSnapshot()).toMatchObject({
      status: "blocked",
      blockers: [{ attemptStatus: "in_progress" }],
    });

    act(() => setAttempt(store, attempt("expired", "attempt-two")));
    expect(owner.environment.getSnapshot()).toEqual({
      status: "allowed",
      surfaceId: SURFACE_1,
      blockers: [],
    });
    expect(publish).toHaveBeenCalledTimes(5);
  });

  it("replaces active subscriptions and ignores callbacks captured before deactivation or unmount", () => {
    const editor = createEditor();
    const store = createStore();
    const owner = createEnvironment([SURFACE_1, SURFACE_2], SURFACE_1);
    const capturedCallbacks: Array<() => void> = [];
    const subscribe = store.subscribe.bind(store);
    let suppressStoreListener = false;
    vi.spyOn(store, "subscribe").mockImplementation((listener) => {
      capturedCallbacks.push(() => {
        const state = store.getState();
        const previousQuizzes = state.durable.quizzes[GROUP_ID]
          ? {}
          : { [GROUP_ID]: attempt("in_progress", "captured-attempt") };
        listener(state, {
          ...state,
          durable: { ...state.durable, quizzes: previousQuizzes },
        });
      });
      return subscribe((state, previousState) => {
        if (!suppressStoreListener) listener(state, previousState);
      });
    });
    const published = vi.fn();
    owner.environment.subscribe(published);
    const hook = renderGuard({ editor, environmentOwner: owner, store });

    expect(owner.environment.getSnapshot().status).toBe("blocked");
    act(() => owner.setActiveSurfaceId(SURFACE_2));
    published.mockClear();
    suppressStoreListener = true;
    act(() => setAttempt(store, attempt("completed")));
    suppressStoreListener = false;
    act(() => capturedCallbacks[0]?.());
    expect(published).not.toHaveBeenCalled();

    act(() => owner.setActiveSurfaceId(SURFACE_1));
    expect(owner.environment.getSnapshot().status).toBe("allowed");
    expect(capturedCallbacks).toHaveLength(2);

    published.mockClear();
    suppressStoreListener = true;
    act(() => setAttempt(store, attempt("in_progress", "attempt-two")));
    suppressStoreListener = false;
    act(() => capturedCallbacks[0]?.());
    expect(published).not.toHaveBeenCalled();
    expect(owner.environment.getSnapshot().status).toBe("allowed");

    act(() => capturedCallbacks[1]?.());
    expect(owner.environment.getSnapshot().status).toBe("blocked");
    hook.unmount();
    expect(owner.environment.getSnapshot().status).toBe("allowed");

    published.mockClear();
    suppressStoreListener = true;
    act(() => setAttempt(store, attempt("completed", "attempt-two")));
    suppressStoreListener = false;
    act(() => capturedCallbacks[1]?.());
    expect(published).not.toHaveBeenCalled();
  });

  it("keeps registration and Surface lifecycle contradictions observable as defects", () => {
    const missingSurfaceEditor = createEditor({ surfaceId: null });
    const missingSurfaceStore = createStore();
    const missingSurfaceOwner = createEnvironment([SURFACE_1], SURFACE_1);

    expect(() =>
      renderGuard({
        editor: missingSurfaceEditor,
        environmentOwner: missingSurfaceOwner,
        store: missingSurfaceStore,
      }),
    ).toThrow(`Quiz Surface Exit Guard owner "${GROUP_ID}" cannot resolve its owning Surface.`);

    const unknownSurfaceEditor = createEditor();
    const unknownSurfaceOwner = createEnvironment([SURFACE_2], SURFACE_2);
    expect(() =>
      renderGuard({
        editor: unknownSurfaceEditor,
        environmentOwner: unknownSurfaceOwner,
        store: createStore(),
      }),
    ).toThrow(`Surface Exit Guard owner "${GROUP_ID}" references unknown Surface`);

    const duplicateEditor = createEditor();
    const duplicateStore = createStore();
    const duplicateOwner = createEnvironment([SURFACE_1], SURFACE_1);
    const first = renderGuard({
      editor: duplicateEditor,
      environmentOwner: duplicateOwner,
      store: duplicateStore,
    });
    expect(() =>
      renderGuard({
        editor: duplicateEditor,
        environmentOwner: duplicateOwner,
        store: duplicateStore,
      }),
    ).toThrow(`Surface Exit Guard owner "${GROUP_ID}" is already registered`);
    first.unmount();
  });

  it("throws when a registered Quiz lifecycle becomes stale", () => {
    const editor = createEditor();
    const store = createStore();
    const owner = createEnvironment([SURFACE_1], SURFACE_1);
    renderGuard({ editor, environmentOwner: owner, store });

    expect(store.getState().unregisterQuiz({ groupId: QUIZ_ID })).toBe(true);
    expect(() => owner.environment.evaluateSnapshot()).toThrow(
      `Quiz Surface Exit Guard owner "${GROUP_ID}" has no current registration.`,
    );
  });
});

function renderGuard({
  editor,
  enabled = true,
  environmentOwner,
  getPos = () => findQuizPosition(editor),
  groupId = GROUP_ID,
  store,
}: {
  editor: Editor;
  enabled?: boolean;
  environmentOwner: SurfaceExitEnvironmentOwner;
  getPos?: () => number | undefined;
  groupId?: typeof GROUP_ID | null;
  store: AssessmentStoreApi;
}) {
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <SurfaceExitEnvironmentProvider environment={environmentOwner.environment}>
        {children}
      </SurfaceExitEnvironmentProvider>
    );
  }

  return renderHook(
    () =>
      useQuizSurfaceExitGuard({
        editor,
        enabled,
        getPos,
        groupId,
        resolveSurfaceScope: resolveAssessmentSurfaceScope,
        store,
      }),
    { wrapper: Wrapper },
  );
}

function createEnvironment(
  knownSurfaceIds: readonly SurfaceId[],
  activeSurfaceId: SurfaceId,
): SurfaceExitEnvironmentOwner {
  const owner = createSurfaceExitEnvironment({ knownSurfaceIds, activeSurfaceId });
  environmentOwners.push(owner);
  return owner;
}

function createStore({ registered = true }: { registered?: boolean } = {}): AssessmentStoreApi {
  const store = createAssessmentStore({ artifactId: "artifact-one", assessmentPort: null });
  if (registered) {
    store.getState().registerQuiz({
      groupId: QUIZ_ID,
      targetIds: [QUESTION_ID],
      settings: {
        allowBacktracking: false,
        reviewTiming: "after_quiz",
        reviewDetail: "result_only",
        attemptsPerQuestion: 1,
        isGraded: true,
        passingScore: 0.5,
        timer: { enabled: false, durationSeconds: 0 },
      },
    });
  }
  return store;
}

function setAttempt(store: AssessmentStoreApi, nextAttempt: QuizAttemptState): void {
  store.setState((state) => ({
    durable: {
      ...state.durable,
      quizzes: { ...state.durable.quizzes, [GROUP_ID]: nextAttempt },
    },
  }));
}

function attempt(status: QuizAttemptState["status"], attemptId = "attempt-one"): QuizAttemptState {
  const completed = status === "completed" || status === "expired";
  return {
    attemptId,
    groupId: GROUP_ID,
    status,
    currentTargetId: completed ? null : QUESTION_ID,
    submittedTargetIds: completed ? [QUESTION_ID] : [],
    startedAt: "2026-08-29T12:00:00.000Z",
    finishedAt: completed ? "2026-08-29T12:05:00.000Z" : null,
    expiresAt: null,
    score: completed ? { scaled: status === "completed" ? 1 : 0 } : null,
    successStatus: completed ? (status === "completed" ? "passed" : "failed") : null,
    resultsByTargetId: {},
    answerReviewAuthorized: false,
  } as QuizAttemptState;
}

function createEditor({
  surfaceId = SURFACE_1,
  withQuestion = true,
}: {
  surfaceId?: string | null;
  withQuestion?: boolean;
} = {}): Editor {
  const QuestionNode = Node.create({
    name: "test_question",
    group: "assessment_question",
    atom: true,
    addAttributes: () => ({ id: { default: null } }),
    renderHTML: ({ HTMLAttributes }) => ["div", HTMLAttributes],
  });
  const QuizNode = Node.create({
    name: "quiz",
    group: "block",
    content: "test_question*",
    addAttributes: () => ({ id: { default: null } }),
    renderHTML: ({ HTMLAttributes }) => ["section", HTMLAttributes, 0],
  });
  const SurfaceNode = Node.create({
    name: "surface",
    group: "block",
    content: "quiz",
    addAttributes: () => ({ id: { default: null } }),
    renderHTML: ({ HTMLAttributes }) => ["section", HTMLAttributes, 0],
  });
  const editor = new Editor({
    content: {
      type: "doc",
      content: [
        {
          type: "surface",
          attrs: { id: surfaceId },
          content: [
            {
              type: "quiz",
              attrs: { id: QUIZ_ID },
              content: withQuestion ? [{ type: "test_question", attrs: { id: QUESTION_ID } }] : [],
            },
          ],
        },
      ],
    },
    extensions: [StarterKit.configure({ undoRedo: false }), QuestionNode, QuizNode, SurfaceNode],
  });
  editors.push(editor);
  return editor;
}

function findQuizPosition(editor: Editor): number {
  let quizPosition: number | null = null;
  editor.state.doc.descendants((node, position) => {
    if (node.type.name !== "quiz") return true;
    quizPosition = position;
    return false;
  });
  if (quizPosition === null) throw new Error("Expected a Quiz node");
  return quizPosition;
}
