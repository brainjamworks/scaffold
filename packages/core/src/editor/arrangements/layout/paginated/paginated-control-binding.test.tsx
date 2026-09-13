// @vitest-environment jsdom

import type { EmbeddedNodeId } from "@scaffold/contracts";
import { Editor, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createScaffoldApplication } from "@/composition/application/create-scaffold-application";
import {
  createCourseDocumentAuthoringEnvironment,
  getCourseDocumentAuthoringEnvironmentState,
} from "@/composition/authoring/create-authoring-composition";
import { createCourseDocumentRuntimeExtensions } from "@/composition/runtime/create-runtime-composition";
import { createLayerWithContent } from "@/document/model/layers/layer-construction";
import {
  getControlBindingRegistryForEditor,
  type ControlBinding,
  type ControlEvent,
} from "@/document/control-binding";
import { getSemanticTargetInteractionEnvironmentForEditor } from "@/document/semantic-target-interaction";
import { createAuthoringMovementTestRoot } from "@/editor/movement/tests/authoring-movement-test-root";

import type { LayoutDefinition } from "../model/layout-definition";
import { paginatedLayoutDefinition } from "./paginated-definition";

const learningEventReporter = vi.hoisted(() => ({ report: vi.fn() }));

vi.mock("@/runtime/learning-events/LearningEventRuntimeProvider", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/runtime/learning-events/LearningEventRuntimeProvider")>();
  return {
    ...actual,
    useLearningEventReporter: () => learningEventReporter,
  };
});

const application = createScaffoldApplication();
const editors: Editor[] = [];
const LAYOUT_ID = "layoutPagCtl" as EmbeddedNodeId;
const FIRST_SECTION_ID = "sectionPagC1" as EmbeddedNodeId;
const SECOND_SECTION_ID = "sectionPagC2" as EmbeddedNodeId;
const rangeClientRectsDescriptor = Object.getOwnPropertyDescriptor(
  Range.prototype,
  "getClientRects",
);
const rangeBoundingRectDescriptor = Object.getOwnPropertyDescriptor(
  Range.prototype,
  "getBoundingClientRect",
);

beforeAll(() => {
  const rect = DOMRect.fromRect({ height: 16, width: 80, x: 0, y: 0 });
  Object.defineProperties(Range.prototype, {
    getBoundingClientRect: { configurable: true, value: () => rect },
    getClientRects: { configurable: true, value: () => [rect] },
  });
});

afterEach(() => {
  cleanup();
  learningEventReporter.report.mockClear();
  for (const editor of editors.splice(0)) editor.destroy();
});

afterAll(() => {
  restoreProperty(Range.prototype, "getClientRects", rangeClientRectsDescriptor);
  restoreProperty(Range.prototype, "getBoundingClientRect", rangeBoundingRectDescriptor);
});

describe("Paginated Control Binding", () => {
  it("declares only the approved selected Section capabilities", () => {
    expect((paginatedLayoutDefinition as LayoutDefinition).control).toEqual({
      semanticChildren: {
        section: {
          events: [{ type: "selected", label: "Selected" }],
          states: [
            {
              key: "selected",
              label: "Selected",
              valueType: { kind: "boolean" },
            },
          ],
          commands: [{ type: "select", label: "Select" }],
        },
      },
    });
  });

  it("serves runtime Pages through authoritative state, silent commands and direct learner events", async () => {
    const user = userEvent.setup();
    const editor = createRuntimePaginatedEditor();
    const rendered = render(createElement(EditorContent, { editor }));
    const binding = await requirePaginatedBinding(editor);
    const events: ControlEvent[] = [];
    const stateAtEvent: boolean[] = [];
    const unsubscribe = binding.eventSource?.subscribe((event) => {
      events.push(event);
      stateAtEvent.push(
        binding.stateReader?.read({ targetId: event.targetId, key: "selected" }) === true,
      );
    });

    expect(binding.stateReader?.read({ targetId: FIRST_SECTION_ID, key: "selected" })).toBe(true);
    expect(binding.stateReader?.read({ targetId: SECOND_SECTION_ID, key: "selected" })).toBe(false);
    await waitFor(() => expect(learningEventReporter.report).toHaveBeenCalled());
    learningEventReporter.report.mockClear();

    const semanticEnvironment = getSemanticTargetInteractionEnvironmentForEditor(editor);
    await expect(
      semanticEnvironment.coordinator.activate(SECOND_SECTION_ID, {
        origin: "configured-presentation",
      }),
    ).resolves.toEqual({ kind: "reached", requestedId: SECOND_SECTION_ID });
    await waitFor(() =>
      expect(binding.stateReader?.read({ targetId: SECOND_SECTION_ID, key: "selected" })).toBe(
        true,
      ),
    );
    expect(events).toEqual([]);
    expect(learningEventReporter.report).not.toHaveBeenCalled();

    const selectResult = await binding.commandExecutor?.execute({
      targetId: FIRST_SECTION_ID,
      type: "select",
      signal: new AbortController().signal,
    });
    expect(selectResult?.isOk()).toBe(true);
    expect(binding.stateReader?.read({ targetId: FIRST_SECTION_ID, key: "selected" })).toBe(true);

    const idempotentResult = await binding.commandExecutor?.execute({
      targetId: FIRST_SECTION_ID,
      type: "select",
      signal: new AbortController().signal,
    });
    expect(idempotentResult?.isOk()).toBe(true);
    expect(events).toEqual([]);
    await waitFor(() => expect(learningEventReporter.report).not.toHaveBeenCalled());

    const abortAfterCommit = new AbortController();
    const committedResultPromise = binding.commandExecutor?.execute({
      targetId: SECOND_SECTION_ID,
      type: "select",
      signal: abortAfterCommit.signal,
    });
    abortAfterCommit.abort();
    expect((await committedResultPromise)?.isOk()).toBe(true);
    expect(binding.stateReader?.read({ targetId: SECOND_SECTION_ID, key: "selected" })).toBe(true);
    expect(events).toEqual([]);
    await waitFor(() => expect(learningEventReporter.report).not.toHaveBeenCalled());

    const cancelled = new AbortController();
    cancelled.abort();
    const cancelledResult = await binding.commandExecutor?.execute({
      targetId: FIRST_SECTION_ID,
      type: "select",
      signal: cancelled.signal,
    });
    expect(cancelledResult?.isErr()).toBe(true);
    if (!cancelledResult || cancelledResult.isOk()) {
      throw new Error("Expected the pre-aborted Paginated command to be cancelled.");
    }
    expect(cancelledResult.error).toEqual({ reason: "cancelled" });
    expect(binding.stateReader?.read({ targetId: SECOND_SECTION_ID, key: "selected" })).toBe(true);

    await user.click(screen.getByRole("button", { name: "Overview" }));
    await waitFor(() => {
      expect(binding.stateReader?.read({ targetId: FIRST_SECTION_ID, key: "selected" })).toBe(true);
      expect(events).toEqual([{ targetId: FIRST_SECTION_ID, type: "selected" }]);
    });
    expect(stateAtEvent).toEqual([true]);

    expect(() => binding.stateReader?.read({ targetId: FIRST_SECTION_ID, key: "unknown" })).toThrow(
      `Control state "unknown" is not declared for target "${FIRST_SECTION_ID}".`,
    );
    await expect(
      binding.commandExecutor?.execute({
        targetId: FIRST_SECTION_ID,
        type: "unknown",
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(
      `Control command "unknown" is not declared for target "${FIRST_SECTION_ID}".`,
    );
    expect(() =>
      binding.stateReader?.read({
        targetId: "foreignSec01" as EmbeddedNodeId,
        key: "selected",
      }),
    ).toThrow(`Control target "foreignSec01" does not belong to owner "${LAYOUT_ID}".`);

    rendered.unmount();
    await waitFor(() =>
      expect(getControlBindingRegistryForEditor(editor).get(LAYOUT_ID)).toBeUndefined(),
    );
    expect(() =>
      binding.stateReader?.read({ targetId: FIRST_SECTION_ID, key: "selected" }),
    ).toThrow(`Control Binding for owner "${LAYOUT_ID}" is no longer mounted.`);
    unsubscribe?.();
  });

  it("keeps one silent authoring binding mounted across direct selection and node revisions", async () => {
    const user = userEvent.setup();
    const editor = createAuthoringPaginatedEditor();
    const rendered = render(
      createAuthoringMovementTestRoot(editor, createElement(EditorContent, { editor })),
    );
    const registry = getControlBindingRegistryForEditor(editor);
    const binding = await requirePaginatedBinding(editor);
    const events: ControlEvent[] = [];
    const unsubscribe = binding.eventSource?.subscribe((event) => events.push(event));

    expect(() => registry.register(binding)).toThrow(
      `Duplicate Control Binding for owner "${LAYOUT_ID}".`,
    );

    await user.click(screen.getByRole("button", { name: "Practice" }));
    await waitFor(() =>
      expect(binding.stateReader?.read({ targetId: SECOND_SECTION_ID, key: "selected" })).toBe(
        true,
      ),
    );
    expect(events).toEqual([]);

    const secondPosition = requireNodePosition(editor, SECOND_SECTION_ID);
    const secondSection = editor.state.doc.nodeAt(secondPosition);
    if (!secondSection) throw new Error("Expected the second Paginated Section node.");
    const replacementId = "sectionPagC3" as EmbeddedNodeId;
    editor.view.dispatch(
      editor.state.tr
        .setNodeMarkup(secondPosition, undefined, {
          ...secondSection.attrs,
          id: replacementId,
        })
        .setMeta("studentGuard", "allow"),
    );

    await waitFor(() => {
      expect(registry.get(LAYOUT_ID)).toBe(binding);
      expect(() =>
        binding.stateReader?.read({ targetId: SECOND_SECTION_ID, key: "selected" }),
      ).toThrow();
      expect(binding.stateReader?.read({ targetId: replacementId, key: "selected" })).toBe(false);
    });
    expect(events).toEqual([]);

    rendered.unmount();
    await waitFor(() => expect(registry.get(LAYOUT_ID)).toBeUndefined());
    expect(() =>
      binding.stateReader?.read({ targetId: FIRST_SECTION_ID, key: "selected" }),
    ).toThrow(`Control Binding for owner "${LAYOUT_ID}" is no longer mounted.`);
    unsubscribe?.();
  });
});

async function requirePaginatedBinding(editor: Editor): Promise<ControlBinding> {
  const registry = getControlBindingRegistryForEditor(editor);
  await waitFor(() => expect(registry.get(LAYOUT_ID)).toBeDefined());
  const binding = registry.get(LAYOUT_ID);
  if (!binding) throw new Error("Expected mounted Paginated Control Binding.");
  return binding;
}

function createRuntimePaginatedEditor(): Editor {
  const editor = new Editor({
    editable: false,
    extensions: createCourseDocumentRuntimeExtensions({ composition: application.runtime }),
    content: paginatedDocument(),
  });
  editors.push(editor);
  return editor;
}

function createAuthoringPaginatedEditor(): Editor {
  const environment = createCourseDocumentAuthoringEnvironment({
    composition: application.authoring,
    editable: true,
  });
  const editor = new Editor({
    editable: true,
    extensions: getCourseDocumentAuthoringEnvironmentState(environment).extensions,
    content: paginatedDocument(),
  });
  editors.push(editor);
  return editor;
}

function requireNodePosition(editor: Editor, id: EmbeddedNodeId): number {
  let position: number | undefined;
  editor.state.doc.descendants((node, nodePosition) => {
    if (node.attrs["id"] !== id) return true;
    position = nodePosition;
    return false;
  });
  if (position === undefined) throw new Error(`Expected document node "${id}".`);
  return position;
}

function paginatedDocument(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { id: "coursePagCtl", mode: "page" },
        content: [
          {
            type: "surface",
            attrs: { id: "surfacePagCt", variant: "page-default" },
            content: [
              {
                type: "layout",
                attrs: { id: LAYOUT_ID, variant: "paginated" },
                content: [
                  paginatedSection(FIRST_SECTION_ID, "Overview", "paraPagCtl01"),
                  paginatedSection(SECOND_SECTION_ID, "Practice", "paraPagCtl02"),
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function paginatedSection(id: EmbeddedNodeId, label: string, paragraphId: string): JSONContent {
  return {
    type: "section",
    attrs: { id, role: "page", options: { label } },
    content: [
      createLayerWithContent([
        {
          type: "paragraph",
          attrs: { id: paragraphId },
          content: [{ type: "text", text: label }],
        },
      ]),
    ],
  };
}

function restoreProperty(
  target: object,
  key: PropertyKey,
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor) {
    Object.defineProperty(target, key, descriptor);
    return;
  }
  Reflect.deleteProperty(target, key);
}
