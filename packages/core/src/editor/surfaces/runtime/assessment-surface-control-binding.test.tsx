// @vitest-environment jsdom

import type { EmbeddedNodeId } from "@scaffold/contracts";
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
import { assessmentControlDefinition } from "@/editor/assessment/shared/model/assessment-control-definition";
import {
  createAssessmentStore,
  scopeAssessmentProblemId,
} from "@/runtime/assessment/assessment-store";
import type { AssessmentRegistrationInput, AssessmentStoreApi } from "@/runtime/assessment/types";

import { useAssessmentSurfaceControlBinding } from "./assessment-surface-control-binding";

const SURFACE_ID = "surface00001" as EmbeddedNodeId;
const ASSESSMENT_TARGET_ID = "target000001";
const PROBLEM_ID = scopeAssessmentProblemId("artifact-one", ASSESSMENT_TARGET_ID);
const editors: Editor[] = [];

afterEach(() => {
  cleanup();
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("assessment Surface Control Binding", () => {
  it("maps a private problem's committed state and events onto the public Surface owner", async () => {
    const checkedProblem = {
      ...emptyProblem(),
      response: { kind: "single-select" as const, optionId: "option000001" },
      checkResult: result(false),
    };
    const store = createStore({
      check: vi.fn().mockResolvedValue({ problem: checkedProblem }),
      submit: vi.fn().mockResolvedValue({
        problem: {
          ...checkedProblem,
          attemptNumber: 1,
          submitted: true,
          submissionResult: result(true),
        },
      }),
    });
    const editor = createEditor();
    const node = editor.state.doc.firstChild!;
    render(<Harness editor={editor} enabled node={node} store={store} />);

    const registry = getControlBindingRegistryForEditor(editor);
    await waitFor(() => expect(registry.get(SURFACE_ID)).toBeDefined());
    expect(registry.get(ASSESSMENT_TARGET_ID as EmbeddedNodeId)).toBeUndefined();

    const binding = registry.get(SURFACE_ID)!;
    expect(binding.commandExecutor).toBeUndefined();
    expect(binding.stateReader?.read({ targetId: SURFACE_ID, key: "phase" })).toBe("unanswered");
    expect(binding.stateReader?.read({ targetId: SURFACE_ID, key: "result" })).toBe("ungraded");
    expect(() =>
      binding.stateReader?.read({
        targetId: ASSESSMENT_TARGET_ID as EmbeddedNodeId,
        key: "phase",
      }),
    ).toThrow("foreign target");

    const events: ControlEvent[] = [];
    const stateAtEvent: unknown[] = [];
    binding.eventSource?.subscribe((event) => {
      events.push(event);
      stateAtEvent.push({
        phase: binding.stateReader?.read({ targetId: SURFACE_ID, key: "phase" }),
        result: binding.stateReader?.read({ targetId: SURFACE_ID, key: "result" }),
      });
    });

    store.getState().setLocalResponse(identity(), { choice: "option000001" });
    expect(binding.stateReader?.read({ targetId: SURFACE_ID, key: "phase" })).toBe("ready");
    await store.getState().check(identity());

    expect(events).toEqual([{ targetId: SURFACE_ID, type: "evaluated" }]);
    expect(stateAtEvent).toEqual([{ phase: "evaluated", result: "incorrect" }]);

    store.getState().reset(identity());
    store.getState().setLocalResponse(identity(), { choice: "option000001" });
    await store.getState().submit(identity());
    expect(events).toEqual([
      { targetId: SURFACE_ID, type: "evaluated" },
      { targetId: SURFACE_ID, type: "submitted" },
    ]);
    expect(stateAtEvent.at(-1)).toEqual({ phase: "submitted", result: "correct" });
  });

  it("survives Surface revisions, rejects stale private membership, and unregisters", async () => {
    const store = createStore();
    const editor = createEditor();
    const node = editor.state.doc.firstChild!;
    const view = render(<Harness editor={editor} enabled={false} node={node} store={store} />);
    const registry = getControlBindingRegistryForEditor(editor);

    expect(registry.get(SURFACE_ID)).toBeUndefined();
    view.rerender(<Harness editor={editor} enabled node={node} store={store} />);
    await waitFor(() => expect(registry.get(SURFACE_ID)).toBeDefined());
    const binding = registry.get(SURFACE_ID)!;

    editor.commands.updateAttributes("surface", { revision: 1 });
    const revisedNode = editor.state.doc.firstChild!;
    view.rerender(<Harness editor={editor} enabled node={revisedNode} store={store} />);
    expect(registry.get(SURFACE_ID)).toBe(binding);
    expect(binding.stateReader?.read({ targetId: SURFACE_ID, key: "phase" })).toBe("unanswered");

    editor.commands.setContent(surfaceDocument("replacement01"));
    expect(() => binding.stateReader?.read({ targetId: SURFACE_ID, key: "phase" })).toThrow(
      `Assessment Surface Control Binding owner "${SURFACE_ID}" no longer owns assessment target "${ASSESSMENT_TARGET_ID}".`,
    );

    view.unmount();
    expect(registry.get(SURFACE_ID)).toBeUndefined();
  });

  it("does not mount without a current matching Store registration", () => {
    const editor = createEditor();
    const store = createAssessmentStore({ artifactId: "artifact-one", assessmentPort: null });
    render(<Harness editor={editor} enabled node={editor.state.doc.firstChild!} store={store} />);

    expect(getControlBindingRegistryForEditor(editor).get(SURFACE_ID)).toBeUndefined();
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
  useAssessmentSurfaceControlBinding({
    assessmentTargetId: ASSESSMENT_TARGET_ID,
    editor,
    enabled,
    getPos: () => 0,
    node,
    problemId: PROBLEM_ID,
    store,
  });
  return null;
}

function createEditor(): Editor {
  const registry = createControlBindingRegistry({
    requireOwnerControlDefinition: () => assessmentControlDefinition,
    requireOwnedTargetCapabilities: (ownerId, targetId) => {
      if (ownerId !== SURFACE_ID || targetId !== SURFACE_ID) throw new Error("foreign target");
      return assessmentControlDefinition.owner!;
    },
  });
  const SurfaceQuestionNode = Node.create({
    name: "surface_question",
    group: "block",
    atom: true,
    addAttributes: () => ({ id: { default: null } }),
    parseHTML: () => [{ tag: "div[data-node=surface-question]" }],
    renderHTML: ({ HTMLAttributes }) => [
      "div",
      { ...HTMLAttributes, "data-node": "surface-question" },
    ],
  });
  const SurfaceNode = Node.create({
    name: "surface",
    group: "block",
    content: "surface_question",
    addAttributes: () => ({
      id: { default: null },
      revision: { default: 0 },
      variant: { default: "slide-multiple-choice-question" },
    }),
    parseHTML: () => [{ tag: "section[data-node=surface]" }],
    renderHTML: ({ HTMLAttributes }) => [
      "section",
      { ...HTMLAttributes, "data-node": "surface" },
      0,
    ],
  });
  const editor = new Editor({
    content: surfaceDocument(ASSESSMENT_TARGET_ID),
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      SurfaceQuestionNode,
      SurfaceNode,
      createControlBindingRegistryStorageExtension({ getRegistry: () => registry }),
    ],
  });
  editors.push(editor);
  return editor;
}

function surfaceDocument(assessmentTargetId: string) {
  return {
    type: "doc",
    content: [
      {
        type: "surface",
        attrs: {
          id: SURFACE_ID,
          revision: 0,
          variant: "slide-multiple-choice-question",
        },
        content: [{ type: "surface_question", attrs: { id: assessmentTargetId } }],
      },
    ],
  };
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
    authoredBlockId: ASSESSMENT_TARGET_ID,
    targetId: ASSESSMENT_TARGET_ID,
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
    authoredBlockId: ASSESSMENT_TARGET_ID,
    targetId: ASSESSMENT_TARGET_ID,
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
