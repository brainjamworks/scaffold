// @vitest-environment jsdom

import type { EmbeddedNodeId, QuizAttemptState } from "@scaffold/contracts";
import { Editor, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import {
  createControlBindingRegistry,
  createControlBindingRegistryStorageExtension,
  getControlBindingRegistryForEditor,
  type ControlEvent,
} from "@/document/control-binding";
import type { AssessmentPort } from "@/host/ports/assessment";
import {
  createAssessmentStore,
  scopeAssessmentGroupId,
} from "@/runtime/assessment/assessment-store";
import type {
  CreateAssessmentStoreOptions,
  AssessmentRegistrationInput,
  AssessmentStoreApi,
} from "@/runtime/assessment/types";

import { quizControlDefinition } from "./quiz-control-definition";
import { createQuizControlBinding, useQuizControlBinding } from "./quiz-control-binding";

const OWNER_ID = "quiz00000001" as EmbeddedNodeId;
const CHILD_ID = "quest0000001";
const GROUP_ID = scopeAssessmentGroupId("artifact-one", OWNER_ID);
const editors: Editor[] = [];

afterEach(() => {
  cleanup();
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("Quiz Control Binding", () => {
  it("reads only current authoritative status and outcome without exposing private data", () => {
    const store = createStore();
    const requireMounted = vi.fn();
    const binding = createQuizControlBinding({
      groupId: GROUP_ID,
      ownerId: OWNER_ID,
      requireMounted,
      store,
    });

    expect(binding.commandExecutor).toBeUndefined();
    expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "status" })).toBe("not-started");
    expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "outcome" })).toBe("unavailable");

    setAttempt(store, attempt({ status: "in_progress" }));
    expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "status" })).toBe("in-progress");
    expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "outcome" })).toBe("unavailable");

    setAttempt(
      store,
      attempt({
        status: "completed",
        currentTargetId: null,
        finishedAt: "2026-08-27T12:05:00.000Z",
        score: { scaled: 1 },
        successStatus: "passed",
      }),
    );
    expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "status" })).toBe("completed");
    expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "outcome" })).toBe("passed");

    setAttempt(
      store,
      attempt({
        status: "completed",
        currentTargetId: null,
        finishedAt: "2026-08-27T12:05:00.000Z",
        score: { scaled: 1 },
        successStatus: null,
      }),
    );
    expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "outcome" })).toBe("unavailable");

    setAttempt(
      store,
      attempt({
        status: "expired",
        currentTargetId: null,
        finishedAt: "2026-08-27T12:05:00.000Z",
        score: { scaled: 0 },
        successStatus: "failed",
      }),
    );
    expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "status" })).toBe("expired");
    expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "outcome" })).toBe("failed");

    expect(() =>
      binding.stateReader?.read({ targetId: "foreign00001" as EmbeddedNodeId, key: "status" }),
    ).toThrow(`Quiz Control Binding target "foreign00001" is not owner "${OWNER_ID}".`);
    expect(() => binding.stateReader?.read({ targetId: OWNER_ID, key: "score" })).toThrow(
      'Unsupported Quiz Control state "score".',
    );
    expect(requireMounted).toHaveBeenCalledTimes(11);
  });

  it("translates accepted lifecycle commits only after the Store exposes the new attempt", async () => {
    const started = attempt({ status: "in_progress" });
    const finished = attempt({
      status: "completed",
      currentTargetId: null,
      submittedTargetIds: [CHILD_ID],
      finishedAt: "2026-08-27T12:05:00.000Z",
      score: { scaled: 1 },
      successStatus: "passed",
    });
    const store = createStore({
      startAttempt: vi.fn().mockResolvedValue({ quizAttempt: started, problemsByTargetId: {} }),
      finishAttempt: vi.fn().mockResolvedValue({ quizAttempt: finished, problemsByTargetId: {} }),
    });
    const binding = createQuizControlBinding({
      groupId: GROUP_ID,
      ownerId: OWNER_ID,
      requireMounted: () => undefined,
      store,
    });
    const events: ControlEvent[] = [];
    const stateAtEvent: unknown[] = [];
    binding.eventSource?.subscribe((event) => {
      events.push(event);
      stateAtEvent.push({
        status: binding.stateReader?.read({ targetId: OWNER_ID, key: "status" }),
        outcome: binding.stateReader?.read({ targetId: OWNER_ID, key: "outcome" }),
      });
    });

    await store.getState().startQuizAttempt({ groupId: OWNER_ID });
    store.getState().setLocalResponse(problemIdentity(), { choice: "option000001" });
    await store.getState().finishQuizAttempt({ groupId: OWNER_ID });

    expect(events).toEqual([
      { targetId: OWNER_ID, type: "started" },
      { targetId: OWNER_ID, type: "finished" },
    ]);
    expect(stateAtEvent).toEqual([
      { status: "in-progress", outcome: "unavailable" },
      { status: "completed", outcome: "passed" },
    ]);
  });

  it("keeps Control delivery independent from Learning delivery failure", async () => {
    const started = attempt({ status: "in_progress" });
    const store = createStore(
      {
        startAttempt: vi.fn().mockResolvedValue({ quizAttempt: started, problemsByTargetId: {} }),
      },
      () => {
        throw new Error("learning unavailable");
      },
    );
    const binding = createQuizControlBinding({
      groupId: GROUP_ID,
      ownerId: OWNER_ID,
      requireMounted: () => undefined,
      store,
    });
    const events: ControlEvent[] = [];
    binding.eventSource?.subscribe((event) => events.push(event));

    await expect(store.getState().startQuizAttempt({ groupId: OWNER_ID })).resolves.toEqual(
      started,
    );
    expect(events).toEqual([{ targetId: OWNER_ID, type: "started" }]);
  });

  it("commits authority but preserves a stale binding listener defect as a thrown error", async () => {
    const started = attempt({ status: "in_progress" });
    const store = createStore({
      startAttempt: vi.fn().mockResolvedValue({ quizAttempt: started, problemsByTargetId: {} }),
    });
    let mounted = true;
    const binding = createQuizControlBinding({
      groupId: GROUP_ID,
      ownerId: OWNER_ID,
      requireMounted: () => {
        if (!mounted) throw new Error("stale Quiz owner");
      },
      store,
    });
    binding.eventSource?.subscribe(() => undefined);
    mounted = false;

    await expect(store.getState().startQuizAttempt({ groupId: OWNER_ID })).rejects.toThrow(
      "stale Quiz owner",
    );
    expect(store.getState().durable.quizzes[GROUP_ID]).toEqual(started);
  });

  it("mounts only a current registered non-empty runtime owner and unregisters on teardown", async () => {
    const store = createStore();
    const editor = createEditor();
    const node = editor.state.doc.firstChild!;
    const view = render(<Harness editor={editor} enabled={false} node={node} store={store} />);

    expect(getControlBindingRegistryForEditor(editor).get(OWNER_ID)).toBeUndefined();
    view.rerender(<Harness editor={editor} enabled node={node} store={store} />);
    await waitFor(() =>
      expect(getControlBindingRegistryForEditor(editor).get(OWNER_ID)).toBeDefined(),
    );

    const binding = getControlBindingRegistryForEditor(editor).get(OWNER_ID)!;
    editor.commands.updateAttributes("quiz", { revision: 1 });
    const revisedNode = editor.state.doc.firstChild!;
    view.rerender(<Harness editor={editor} enabled node={revisedNode} store={store} />);
    expect(getControlBindingRegistryForEditor(editor).get(OWNER_ID)).toBe(binding);
    expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "status" })).toBe("not-started");

    store.getState().unregisterQuiz({ groupId: OWNER_ID });
    expect(() => binding.stateReader?.read({ targetId: OWNER_ID, key: "status" })).toThrow(
      `Quiz Control Binding owner "${OWNER_ID}" has no current registration.`,
    );
    view.unmount();
    expect(getControlBindingRegistryForEditor(editor).get(OWNER_ID)).toBeUndefined();
    expect(() => binding.stateReader?.read({ targetId: OWNER_ID, key: "status" })).toThrow(
      `Control Binding for owner "${OWNER_ID}" is no longer mounted.`,
    );

    const unregisteredStore = createStore();
    unregisteredStore.getState().unregisterQuiz({ groupId: OWNER_ID });
    render(<Harness editor={editor} enabled node={revisedNode} store={unregisteredStore} />);
    expect(getControlBindingRegistryForEditor(editor).get(OWNER_ID)).toBeUndefined();

    const emptyEditor = createEditor(false);
    const emptyNode = emptyEditor.state.doc.firstChild!;
    render(<Harness editor={emptyEditor} enabled={false} node={emptyNode} store={createStore()} />);
    expect(getControlBindingRegistryForEditor(emptyEditor).get(OWNER_ID)).toBeUndefined();

    const unsafeEditor = createEditor(true, "unsafe");
    const unsafeNode = unsafeEditor.state.doc.firstChild!;
    render(<Harness editor={unsafeEditor} enabled node={unsafeNode} store={createStore()} />);
    expect(getControlBindingRegistryForEditor(unsafeEditor).get("unsafe" as EmbeddedNodeId)).toBe(
      undefined,
    );
  });
});

function Harness({
  editor,
  enabled,
  node,
  store,
}: {
  editor: Editor;
  enabled: boolean;
  node: NonNullable<Editor["state"]["doc"]["firstChild"]>;
  store: AssessmentStoreApi;
}) {
  useQuizControlBinding({
    editor,
    enabled,
    getPos: () => 0,
    groupId: GROUP_ID,
    node,
    store,
  });
  return null;
}

function createEditor(withChild = true, ownerId: string = OWNER_ID): Editor {
  const registry = createControlBindingRegistry({
    requireOwnerControlDefinition: () => quizControlDefinition,
    requireOwnedTargetCapabilities: (ownerId, targetId) => {
      if (ownerId !== OWNER_ID || targetId !== OWNER_ID) throw new Error("foreign target");
      return quizControlDefinition.owner!;
    },
  });
  const QuestionNode = Node.create({
    name: "mcq",
    group: "assessment_question",
    atom: true,
    addAttributes: () => ({ id: { default: null } }),
    parseHTML: () => [{ tag: "div[data-node=mcq]" }],
    renderHTML: ({ HTMLAttributes }) => ["div", { ...HTMLAttributes, "data-node": "mcq" }],
  });
  const QuizNode = Node.create({
    name: "quiz",
    group: "block",
    content: "mcq*",
    addAttributes: () => ({ id: { default: null }, revision: { default: 0 } }),
    parseHTML: () => [{ tag: "section[data-node=quiz]" }],
    renderHTML: ({ HTMLAttributes }) => ["section", { ...HTMLAttributes, "data-node": "quiz" }, 0],
  });
  const editor = new Editor({
    content: {
      type: "doc",
      content: [
        {
          type: "quiz",
          attrs: { id: ownerId },
          content: withChild ? [{ type: "mcq", attrs: { id: CHILD_ID } }] : [],
        },
      ],
    },
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      QuestionNode,
      QuizNode,
      createControlBindingRegistryStorageExtension({ getRegistry: () => registry }),
    ],
  });
  editors.push(editor);
  return editor;
}

function createStore(
  quizOverrides: Partial<NonNullable<AssessmentPort["quiz"]>> = {},
  getLearningEventSession?: NonNullable<CreateAssessmentStoreOptions["getLearningEventSession"]>,
): AssessmentStoreApi {
  const quiz: NonNullable<AssessmentPort["quiz"]> = {
    startAttempt: vi.fn(),
    submitQuestion: vi.fn(),
    finishAttempt: vi.fn(),
    ...quizOverrides,
  };
  const store = createAssessmentStore({
    artifactId: "artifact-one",
    ...(getLearningEventSession ? { getLearningEventSession } : {}),
    assessmentPort: {
      type: "runtime",
      submit: vi.fn(),
      quiz,
    },
  });
  store.getState().register(problemRegistration());
  store.getState().registerQuiz({
    groupId: OWNER_ID,
    targetIds: [CHILD_ID],
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

function attempt(overrides: Record<string, unknown>): QuizAttemptState {
  return {
    attemptId: "attempt-one",
    groupId: GROUP_ID,
    status: "in_progress",
    currentTargetId: CHILD_ID,
    submittedTargetIds: [],
    startedAt: "2026-08-27T12:00:00.000Z",
    finishedAt: null,
    expiresAt: null,
    score: null,
    successStatus: null,
    resultsByTargetId: {},
    answerReviewAuthorized: false,
    ...overrides,
  } as QuizAttemptState;
}

function problemRegistration(): AssessmentRegistrationInput {
  return {
    authoredBlockId: CHILD_ID,
    targetId: CHILD_ID,
    interactionKind: "single-select" as const,
    response: {
      schema: z.object({ choice: z.string().nullable() }),
      toContractResponse: (response: unknown) => ({
        kind: "single-select" as const,
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
      hasResponse: (response: unknown) =>
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
        feedbackMode: "on_submit" as const,
        isGraded: true,
        showAnswer: true,
        points: 1,
        maxAttempts: null,
      },
      hintsTotal: 0,
      learningEventDefinition: { interaction: { kind: "single-select" as const, options: [] } },
    },
  };
}

function problemIdentity() {
  return {
    authoredBlockId: CHILD_ID,
    targetId: CHILD_ID,
    interactionKind: "single-select" as const,
  };
}
