// @vitest-environment jsdom

import type { EmbeddedNodeId } from "@scaffold/contracts";
import { Editor, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  createControlBindingRegistry,
  createControlBindingRegistryStorageExtension,
  getControlBindingRegistryForEditor,
  type ControlEvent,
} from "@/document/control-binding";
import {
  createAssessmentStore,
  scopeAssessmentProblemId,
} from "@/runtime/assessment/assessment-store";
import type {
  AssessmentCommittedOperationListener,
  AssessmentRegistrationInput,
  AssessmentStoreApi,
} from "@/runtime/assessment/types";
import { z } from "zod";

import { assessmentControlDefinition } from "../model/assessment-control-definition";
import {
  createAssessmentControlBinding,
  useAssessmentControlBinding,
} from "./assessment-control-binding";

const OWNER_ID = "assess000001" as EmbeddedNodeId;
const PROBLEM_ID = scopeAssessmentProblemId("artifact-one", OWNER_ID);
const editors: Editor[] = [];

afterEach(() => {
  cleanup();
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("Assessment Control Binding", () => {
  it("reads only the authoritative phase and result with the approved precedence", () => {
    const store = createStore();
    const requireMounted = vi.fn();
    const binding = createAssessmentControlBinding({
      ownerId: OWNER_ID,
      problemId: PROBLEM_ID,
      requireMounted,
      store,
    });

    expect(binding.commandExecutor).toBeUndefined();
    expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "phase" })).toBe("unanswered");
    expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "result" })).toBe("ungraded");

    store.getState().setLocalResponse(identity(), { choice: "option000001" });
    expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "phase" })).toBe("ready");

    store.setState((state) => ({
      durable: {
        ...state.durable,
        problems: {
          ...state.durable.problems,
          [PROBLEM_ID]: {
            ...state.durable.problems[PROBLEM_ID]!,
            checkResult: result(false),
          },
        },
      },
    }));
    expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "phase" })).toBe("evaluated");
    expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "result" })).toBe("incorrect");

    store.setState((state) => ({
      durable: {
        ...state.durable,
        problems: {
          ...state.durable.problems,
          [PROBLEM_ID]: {
            ...state.durable.problems[PROBLEM_ID]!,
            submitted: true,
            submissionResult: result(true),
          },
        },
      },
    }));
    expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "phase" })).toBe("submitted");
    expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "result" })).toBe("correct");
    expect(requireMounted).toHaveBeenCalledTimes(7);

    expect(() =>
      binding.stateReader?.read({ targetId: "foreign00001" as EmbeddedNodeId, key: "phase" }),
    ).toThrow(`Assessment Control Binding target "foreign00001" is not owner "${OWNER_ID}".`);
    expect(() => binding.stateReader?.read({ targetId: OWNER_ID, key: "response" })).toThrow(
      'Unsupported Assessment Control state "response".',
    );
  });

  it("translates accepted Store commits after state is authoritative and stays silent otherwise", async () => {
    const checkResult = result(false);
    const submissionResult = result(true);
    const store = createStore({
      check: vi.fn().mockResolvedValue({
        problem: {
          ...emptyProblem(),
          response: { kind: "single-select", optionId: "option000001" },
          checkResult,
        },
      }),
      submit: vi.fn().mockResolvedValue({
        problem: {
          ...emptyProblem(),
          response: { kind: "single-select", optionId: "option000001" },
          attemptNumber: 1,
          submitted: true,
          submissionResult,
        },
      }),
    });
    const binding = createAssessmentControlBinding({
      ownerId: OWNER_ID,
      problemId: PROBLEM_ID,
      requireMounted: () => undefined,
      store,
    });
    const events: ControlEvent[] = [];
    const stateAtEvent: unknown[] = [];
    binding.eventSource?.subscribe((event) => {
      events.push(event);
      stateAtEvent.push({
        phase: binding.stateReader?.read({ targetId: OWNER_ID, key: "phase" }),
        result: binding.stateReader?.read({ targetId: OWNER_ID, key: "result" }),
      });
    });

    store.getState().setLocalResponse(identity(), { choice: "option000001" });
    await store.getState().check(identity());
    expect(events).toEqual([{ targetId: OWNER_ID, type: "evaluated" }]);
    expect(stateAtEvent).toEqual([{ phase: "evaluated", result: "incorrect" }]);

    store.getState().reset(identity());
    store.getState().setLocalResponse(identity(), { choice: "option000001" });
    await store.getState().submit(identity());
    expect(events).toEqual([
      { targetId: OWNER_ID, type: "evaluated" },
      { targetId: OWNER_ID, type: "submitted" },
    ]);
    expect(stateAtEvent.at(-1)).toEqual({ phase: "submitted", result: "correct" });
  });

  it("rejects an unknown problem commit instead of misreporting a submission", () => {
    let publish: AssessmentCommittedOperationListener = () => undefined;
    const store = {
      subscribeToCommittedOperations(listener: AssessmentCommittedOperationListener) {
        publish = listener;
        return () => undefined;
      },
    } as AssessmentStoreApi;
    const listener = vi.fn();
    const binding = createAssessmentControlBinding({
      ownerId: OWNER_ID,
      problemId: PROBLEM_ID,
      requireMounted: () => undefined,
      store,
    });
    binding.eventSource?.subscribe(listener);

    expect(() => publish({ operation: "reset", problemId: PROBLEM_ID } as never)).toThrow(
      'Unsupported Assessment committed operation "reset".',
    );
    expect(listener).not.toHaveBeenCalled();
  });

  it("mounts only an enabled current standalone owner and unregisters on teardown", async () => {
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
    editor.commands.updateAttributes("mcq", { revision: 1 });
    const revisedNode = editor.state.doc.firstChild!;
    view.rerender(<Harness editor={editor} enabled node={revisedNode} store={store} />);
    expect(getControlBindingRegistryForEditor(editor).get(OWNER_ID)).toBe(binding);
    expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "phase" })).toBe("unanswered");

    editor.commands.clearContent();
    expect(() => binding.stateReader?.read({ targetId: OWNER_ID, key: "phase" })).toThrow(
      `Assessment Control Binding owner "${OWNER_ID}" is no longer mounted.`,
    );
    view.unmount();
    expect(getControlBindingRegistryForEditor(editor).get(OWNER_ID)).toBeUndefined();
    expect(() => binding.stateReader?.read({ targetId: OWNER_ID, key: "phase" })).toThrow(
      `Control Binding for owner "${OWNER_ID}" is no longer mounted.`,
    );

    editor.commands.setContent({
      type: "doc",
      content: [{ type: "mcq", attrs: { id: OWNER_ID, revision: 2 } }],
    });
    const privateQuizNode = editor.state.doc.firstChild!;
    const privateQuizStore = createStore();
    privateQuizStore.getState().registerQuiz({
      groupId: "quiz00000001",
      targetIds: [OWNER_ID],
      settings: {
        allowBacktracking: true,
        reviewTiming: "after_quiz",
        reviewDetail: "result_only",
        attemptsPerQuestion: 1,
        isGraded: true,
        passingScore: null,
        timer: { enabled: false, durationSeconds: 0 },
      },
    });
    render(<Harness editor={editor} enabled node={privateQuizNode} store={privateQuizStore} />);
    expect(getControlBindingRegistryForEditor(editor).get(OWNER_ID)).toBeUndefined();

    const initiallyPrivateEditor = createEditor(true);
    const initiallyPrivateNode = initiallyPrivateEditor.state.doc.firstChild!.firstChild!;
    render(
      <Harness
        editor={initiallyPrivateEditor}
        enabled
        node={initiallyPrivateNode}
        position={1}
        store={createStore()}
      />,
    );
    expect(
      getControlBindingRegistryForEditor(initiallyPrivateEditor).get(OWNER_ID),
    ).toBeUndefined();
  });
});

function Harness({
  editor,
  enabled,
  node,
  position = 0,
  store,
}: {
  editor: Editor;
  enabled: boolean;
  node: NonNullable<Editor["state"]["doc"]["firstChild"]>;
  position?: number;
  store: ReturnType<typeof createStore>;
}) {
  useAssessmentControlBinding({
    editor,
    enabled,
    getPos: () => position,
    node,
    problemId: PROBLEM_ID,
    store,
  });
  return null;
}

function createEditor(privateQuizChild = false): Editor {
  const registry = createControlBindingRegistry({
    requireOwnerControlDefinition: () => assessmentControlDefinition,
    requireOwnedTargetCapabilities: (ownerId, targetId) => {
      if (ownerId !== OWNER_ID || targetId !== OWNER_ID) throw new Error("foreign target");
      return assessmentControlDefinition.owner!;
    },
  });
  const AssessmentNode = Node.create({
    name: "mcq",
    group: "block assessment_question",
    atom: true,
    addAttributes: () => ({ id: { default: null }, revision: { default: 0 } }),
    parseHTML: () => [{ tag: "div[data-node=mcq]" }],
    renderHTML: ({ HTMLAttributes }) => ["div", { ...HTMLAttributes, "data-node": "mcq" }],
  });
  const QuizNode = Node.create({
    name: "quiz",
    group: "block",
    content: "mcq*",
    parseHTML: () => [{ tag: "section[data-node=quiz]" }],
    renderHTML: () => ["section", { "data-node": "quiz" }, 0],
  });
  const editor = new Editor({
    content: {
      type: "doc",
      content: privateQuizChild
        ? [{ type: "quiz", content: [{ type: "mcq", attrs: { id: OWNER_ID } }] }]
        : [{ type: "mcq", attrs: { id: OWNER_ID } }],
    },
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      AssessmentNode,
      QuizNode,
      createControlBindingRegistryStorageExtension({ getRegistry: () => registry }),
    ],
  });
  editors.push(editor);
  return editor;
}

function createStore(overrides: Record<string, unknown> = {}) {
  const store = createAssessmentStore({
    artifactId: "artifact-one",
    assessmentPort: { type: "runtime", submit: vi.fn(), ...overrides },
  });
  store.getState().register(registration());
  return store;
}

function registration(): AssessmentRegistrationInput {
  return {
    authoredBlockId: OWNER_ID,
    targetId: OWNER_ID,
    interactionKind: "single-select",
    response: {
      schema: z.object({ choice: z.string().nullable() }),
      toContractResponse: (response) => {
        const { choice } = z.object({ choice: z.string().nullable() }).parse(response);
        return { kind: "single-select", optionId: choice };
      },
      fromContractResponse: (response) => ({
        choice: response.kind === "single-select" ? response.optionId : null,
      }),
      hasResponse: (response) =>
        z.object({ choice: z.string().nullable() }).parse(response).choice !== null,
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
      hintsTotal: 0,
      learningEventDefinition: { interaction: { kind: "single-select", options: [] } },
    },
  };
}

function identity() {
  return {
    authoredBlockId: OWNER_ID,
    targetId: OWNER_ID,
    interactionKind: "single-select" as const,
  };
}

function result(isCorrect: boolean) {
  return { isCorrect, score: { scaled: isCorrect ? 1 : 0 }, feedback: null, items: {} };
}

function emptyProblem() {
  return {
    response: null,
    attemptNumber: 0,
    hintsShown: 0,
    checkResult: null,
    submitted: false,
    submissionResult: null,
  };
}
