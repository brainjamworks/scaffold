// @vitest-environment jsdom

import type { EmbeddedNodeId } from "@scaffold/contracts";
import { Editor, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createScaffoldApplication } from "@/composition/application/create-scaffold-application";
import {
  createCourseDocumentAuthoringEnvironment,
  getCourseDocumentAuthoringEnvironmentState,
} from "@/composition/authoring/create-authoring-composition";
import { createCourseDocumentRuntimeExtensions } from "@/composition/runtime/create-runtime-composition";
import {
  getControlBindingRegistryForEditor,
  type ControlBinding,
  type ControlEvent,
} from "@/document/control-binding";
import { getSemanticTargetInteractionEnvironmentForEditor } from "@/document/semantic-target-interaction";
import { createAuthoringMovementTestRoot } from "@/editor/movement/tests/authoring-movement-test-root";

import type { LayoutDefinition } from "../model/layout-definition";
import { accordionLayoutDefinition } from "./accordion-definition";

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
const LAYOUT_ID = "layoutAccCtl" as EmbeddedNodeId;
const FIRST_SECTION_ID = "sectionAccC1" as EmbeddedNodeId;
const SECOND_SECTION_ID = "sectionAccC2" as EmbeddedNodeId;

afterEach(() => {
  cleanup();
  learningEventReporter.report.mockClear();
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("Accordion Control Binding", () => {
  it("declares only the approved open and close Section capabilities", () => {
    expect((accordionLayoutDefinition as LayoutDefinition).control).toEqual({
      semanticChildren: {
        section: {
          events: [
            { type: "opened", label: "Opened" },
            { type: "closed", label: "Closed" },
          ],
          states: [
            {
              key: "open",
              label: "Open",
              valueType: { kind: "boolean" },
            },
          ],
          commands: [
            { type: "open", label: "Open" },
            { type: "close", label: "Close" },
          ],
        },
      },
    });
  });

  it("serves runtime Sections through authoritative state, silent commands and direct learner events", async () => {
    const user = userEvent.setup();
    const editor = createRuntimeAccordionEditor();
    const rendered = render(createElement(EditorContent, { editor }));
    const binding = await requireAccordionBinding(editor);
    const events: ControlEvent[] = [];
    const stateAtEvent: boolean[] = [];
    const unsubscribe = binding.eventSource?.subscribe((event) => {
      events.push(event);
      stateAtEvent.push(
        binding.stateReader?.read({ targetId: event.targetId, key: "open" }) === true,
      );
    });

    expect(binding.stateReader?.read({ targetId: FIRST_SECTION_ID, key: "open" })).toBe(true);
    expect(binding.stateReader?.read({ targetId: SECOND_SECTION_ID, key: "open" })).toBe(false);
    await waitFor(() => expect(learningEventReporter.report).toHaveBeenCalled());
    learningEventReporter.report.mockClear();

    const semanticEnvironment = getSemanticTargetInteractionEnvironmentForEditor(editor);
    await expect(
      semanticEnvironment.coordinator.activate(SECOND_SECTION_ID, {
        origin: "configured-presentation",
      }),
    ).resolves.toEqual({ kind: "reached", requestedId: SECOND_SECTION_ID });
    await waitFor(() =>
      expect(binding.stateReader?.read({ targetId: SECOND_SECTION_ID, key: "open" })).toBe(true),
    );
    expect(events).toEqual([]);
    expect(learningEventReporter.report).not.toHaveBeenCalled();

    const openResult = await binding.commandExecutor?.execute({
      targetId: SECOND_SECTION_ID,
      type: "open",
      signal: new AbortController().signal,
    });
    expect(openResult?.isOk()).toBe(true);
    expect(binding.stateReader?.read({ targetId: FIRST_SECTION_ID, key: "open" })).toBe(false);
    expect(binding.stateReader?.read({ targetId: SECOND_SECTION_ID, key: "open" })).toBe(true);

    const idempotentOpenResult = await binding.commandExecutor?.execute({
      targetId: SECOND_SECTION_ID,
      type: "open",
      signal: new AbortController().signal,
    });
    expect(idempotentOpenResult?.isOk()).toBe(true);
    expect(events).toEqual([]);

    const closeResult = await binding.commandExecutor?.execute({
      targetId: SECOND_SECTION_ID,
      type: "close",
      signal: new AbortController().signal,
    });
    expect(closeResult?.isOk()).toBe(true);
    const idempotentCloseResult = await binding.commandExecutor?.execute({
      targetId: SECOND_SECTION_ID,
      type: "close",
      signal: new AbortController().signal,
    });
    expect(idempotentCloseResult?.isOk()).toBe(true);
    expect(binding.stateReader?.read({ targetId: SECOND_SECTION_ID, key: "open" })).toBe(false);
    await waitFor(() => expect(learningEventReporter.report).not.toHaveBeenCalled());

    const cancelled = new AbortController();
    cancelled.abort();
    const cancelledResult = await binding.commandExecutor?.execute({
      targetId: FIRST_SECTION_ID,
      type: "close",
      signal: cancelled.signal,
    });
    expect(cancelledResult?.isErr()).toBe(true);
    if (!cancelledResult || cancelledResult.isOk()) {
      throw new Error("Expected the pre-aborted Accordion command to be cancelled.");
    }
    expect(cancelledResult.error).toEqual({ reason: "cancelled" });
    expect(binding.stateReader?.read({ targetId: FIRST_SECTION_ID, key: "open" })).toBe(false);

    const abortAfterCommit = new AbortController();
    const committedResultPromise = binding.commandExecutor?.execute({
      targetId: FIRST_SECTION_ID,
      type: "open",
      signal: abortAfterCommit.signal,
    });
    abortAfterCommit.abort();
    expect((await committedResultPromise)?.isOk()).toBe(true);
    expect(binding.stateReader?.read({ targetId: FIRST_SECTION_ID, key: "open" })).toBe(true);
    expect(events).toEqual([]);
    expect(learningEventReporter.report).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Second" }));
    await waitFor(() => {
      expect(binding.stateReader?.read({ targetId: FIRST_SECTION_ID, key: "open" })).toBe(false);
      expect(binding.stateReader?.read({ targetId: SECOND_SECTION_ID, key: "open" })).toBe(true);
      expect(events).toEqual([{ targetId: SECOND_SECTION_ID, type: "opened" }]);
    });
    expect(stateAtEvent).toEqual([true]);

    await user.click(screen.getByRole("button", { name: "Second" }));
    await waitFor(() => {
      expect(binding.stateReader?.read({ targetId: SECOND_SECTION_ID, key: "open" })).toBe(false);
      expect(events).toEqual([
        { targetId: SECOND_SECTION_ID, type: "opened" },
        { targetId: SECOND_SECTION_ID, type: "closed" },
      ]);
    });
    expect(stateAtEvent).toEqual([true, false]);

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
        key: "open",
      }),
    ).toThrow(`Control target "foreignSec01" does not belong to owner "${LAYOUT_ID}".`);

    rendered.unmount();
    await waitFor(() =>
      expect(getControlBindingRegistryForEditor(editor).get(LAYOUT_ID)).toBeUndefined(),
    );
    expect(() => binding.stateReader?.read({ targetId: FIRST_SECTION_ID, key: "open" })).toThrow(
      `Control Binding for owner "${LAYOUT_ID}" is no longer mounted.`,
    );
    unsubscribe?.();
  });

  it("keeps one authoring binding mounted across direct interaction and node revisions", async () => {
    const user = userEvent.setup();
    const editor = createAuthoringAccordionEditor();
    const rendered = render(
      createAuthoringMovementTestRoot(editor, createElement(EditorContent, { editor })),
    );
    const registry = getControlBindingRegistryForEditor(editor);
    const binding = await requireAccordionBinding(editor);
    const events: ControlEvent[] = [];
    const unsubscribe = binding.eventSource?.subscribe((event) => events.push(event));

    expect(() => registry.register(binding)).toThrow(
      `Duplicate Control Binding for owner "${LAYOUT_ID}".`,
    );

    await user.click(screen.getByRole("button", { name: "Second" }));
    await waitFor(() =>
      expect(binding.stateReader?.read({ targetId: SECOND_SECTION_ID, key: "open" })).toBe(true),
    );
    expect(events).toEqual([]);

    const secondPosition = requireNodePosition(editor, SECOND_SECTION_ID);
    const secondSection = editor.state.doc.nodeAt(secondPosition);
    if (!secondSection) throw new Error("Expected the second Accordion Section node.");
    const replacementId = "sectionAccC3" as EmbeddedNodeId;
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
        binding.stateReader?.read({ targetId: SECOND_SECTION_ID, key: "open" }),
      ).toThrow();
      expect(binding.stateReader?.read({ targetId: replacementId, key: "open" })).toBe(false);
    });
    expect(events).toEqual([]);

    rendered.unmount();
    await waitFor(() => expect(registry.get(LAYOUT_ID)).toBeUndefined());
    expect(() => binding.stateReader?.read({ targetId: FIRST_SECTION_ID, key: "open" })).toThrow(
      `Control Binding for owner "${LAYOUT_ID}" is no longer mounted.`,
    );
    unsubscribe?.();
  });

  it("preserves other open Sections when commands target an allow-multiple Accordion", async () => {
    const editor = createRuntimeAccordionEditor(true);
    render(createElement(EditorContent, { editor }));
    const binding = await requireAccordionBinding(editor);
    const events: ControlEvent[] = [];
    binding.eventSource?.subscribe((event) => events.push(event));
    await waitFor(() => expect(learningEventReporter.report).toHaveBeenCalled());
    learningEventReporter.report.mockClear();

    const openResult = await binding.commandExecutor?.execute({
      targetId: SECOND_SECTION_ID,
      type: "open",
      signal: new AbortController().signal,
    });
    expect(openResult?.isOk()).toBe(true);
    expect(binding.stateReader?.read({ targetId: FIRST_SECTION_ID, key: "open" })).toBe(true);
    expect(binding.stateReader?.read({ targetId: SECOND_SECTION_ID, key: "open" })).toBe(true);

    const closeResult = await binding.commandExecutor?.execute({
      targetId: FIRST_SECTION_ID,
      type: "close",
      signal: new AbortController().signal,
    });
    expect(closeResult?.isOk()).toBe(true);
    expect(binding.stateReader?.read({ targetId: FIRST_SECTION_ID, key: "open" })).toBe(false);
    expect(binding.stateReader?.read({ targetId: SECOND_SECTION_ID, key: "open" })).toBe(true);
    await waitFor(() => expect(learningEventReporter.report).not.toHaveBeenCalled());
    expect(events).toEqual([]);
  });
});

async function requireAccordionBinding(editor: Editor): Promise<ControlBinding> {
  const registry = getControlBindingRegistryForEditor(editor);
  await waitFor(() => expect(registry.get(LAYOUT_ID)).toBeDefined());
  const binding = registry.get(LAYOUT_ID);
  if (!binding) throw new Error("Expected mounted Accordion Control Binding.");
  return binding;
}

function createRuntimeAccordionEditor(allowMultiple = false): Editor {
  const editor = new Editor({
    editable: false,
    extensions: createCourseDocumentRuntimeExtensions({ composition: application.runtime }),
    content: accordionDocument(allowMultiple),
  });
  editors.push(editor);
  return editor;
}

function createAuthoringAccordionEditor(): Editor {
  const environment = createCourseDocumentAuthoringEnvironment({
    composition: application.authoring,
    editable: true,
  });
  const editor = new Editor({
    editable: true,
    extensions: getCourseDocumentAuthoringEnvironmentState(environment).extensions,
    content: accordionDocument(),
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

function accordionDocument(allowMultiple = false): JSONContent {
  const layout = accordionLayoutDefinition.createContent({
    options: { sections: 2, allowMultiple, labels: ["First", "Second"] },
  });
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { id: "courseAccCtl", mode: "page" },
        content: [
          {
            type: "surface",
            attrs: { id: "surfaceAccCt", variant: "page-default" },
            content: [
              {
                ...layout,
                attrs: { ...layout.attrs, id: LAYOUT_ID },
                content: (layout.content ?? []).map((section, index) => ({
                  ...section,
                  attrs: {
                    ...section.attrs,
                    id: index === 0 ? FIRST_SECTION_ID : SECOND_SECTION_ID,
                  },
                })),
              },
            ],
          },
        ],
      },
    ],
  };
}
