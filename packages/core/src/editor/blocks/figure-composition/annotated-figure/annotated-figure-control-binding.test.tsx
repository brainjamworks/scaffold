// @vitest-environment jsdom

import type { EmbeddedNodeId } from "@scaffold/contracts";
import { Editor, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
import type { BlockDefinition } from "@/editor/blocks/block-definition";
import { createAuthoringMovementTestRoot } from "@/editor/movement/tests/authoring-movement-test-root";
import { AppThemeProvider } from "@/theme/app/AppThemeProvider";
import { CourseThemeProvider } from "@/theme/course";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";

import { annotatedFigureDefinition } from "./annotated-figure-definition";

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
const OWNER_ID = "annotFigCtl1" as EmbeddedNodeId;
const FIRST_ANNOTATION_ID = "annotPinCtl1" as EmbeddedNodeId;
const SECOND_ANNOTATION_ID = "annotPinCtl2" as EmbeddedNodeId;

afterEach(() => {
  cleanup();
  learningEventReporter.report.mockClear();
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("Annotated Figure Control Binding", () => {
  it("declares only the approved public figure capabilities", () => {
    expect((annotatedFigureDefinition as BlockDefinition).control).toEqual({
      owner: {
        states: [
          {
            key: "completed",
            label: "Completed",
            valueType: { kind: "boolean" },
          },
        ],
      },
      semanticChildren: {
        annotated_figure_annotation: {
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

  it("serves authoritative state, silent commands and direct learner events in popover mode", async () => {
    const user = userEvent.setup();
    const editor = createRuntimeEditor("popover");
    const rendered = renderEditor(editor);
    const binding = await requireAnnotatedFigureBinding(editor);
    const events: ControlEvent[] = [];
    const stateAtEvent: boolean[] = [];
    const unsubscribe = binding.eventSource?.subscribe((event) => {
      events.push(event);
      stateAtEvent.push(
        binding.stateReader?.read({ targetId: event.targetId, key: "open" }) === true,
      );
    });

    expect(binding.stateReader?.read({ targetId: FIRST_ANNOTATION_ID, key: "open" })).toBe(false);
    expect(binding.stateReader?.read({ targetId: SECOND_ANNOTATION_ID, key: "open" })).toBe(false);

    const openEmpty = await binding.commandExecutor?.execute({
      targetId: SECOND_ANNOTATION_ID,
      type: "open",
      signal: new AbortController().signal,
    });
    expect(openEmpty?.isOk()).toBe(true);
    expect(binding.stateReader?.read({ targetId: SECOND_ANNOTATION_ID, key: "open" })).toBe(true);
    expect(await screen.findByText("Annotation 2")).toBeInTheDocument();

    const idempotentOpen = await binding.commandExecutor?.execute({
      targetId: SECOND_ANNOTATION_ID,
      type: "open",
      signal: new AbortController().signal,
    });
    expect(idempotentOpen?.isOk()).toBe(true);

    const closeEmpty = await binding.commandExecutor?.execute({
      targetId: SECOND_ANNOTATION_ID,
      type: "close",
      signal: new AbortController().signal,
    });
    expect(closeEmpty?.isOk()).toBe(true);
    const idempotentClose = await binding.commandExecutor?.execute({
      targetId: SECOND_ANNOTATION_ID,
      type: "close",
      signal: new AbortController().signal,
    });
    expect(idempotentClose?.isOk()).toBe(true);
    expect(events).toEqual([]);
    expect(learningEventReporter.report).not.toHaveBeenCalled();

    const cancelled = new AbortController();
    cancelled.abort();
    const cancelledResult = await binding.commandExecutor?.execute({
      targetId: FIRST_ANNOTATION_ID,
      type: "open",
      signal: cancelled.signal,
    });
    expect(cancelledResult?.isErr()).toBe(true);
    if (!cancelledResult || cancelledResult.isOk()) {
      throw new Error("Expected the pre-aborted Annotated Figure command to be cancelled.");
    }
    expect(cancelledResult.error).toEqual({ reason: "cancelled" });
    expect(binding.stateReader?.read({ targetId: FIRST_ANNOTATION_ID, key: "open" })).toBe(false);

    const abortAfterCommit = new AbortController();
    const committed = binding.commandExecutor?.execute({
      targetId: FIRST_ANNOTATION_ID,
      type: "open",
      signal: abortAfterCommit.signal,
    });
    abortAfterCommit.abort();
    expect((await committed)?.isOk()).toBe(true);
    expect(binding.stateReader?.read({ targetId: FIRST_ANNOTATION_ID, key: "open" })).toBe(true);
    expect(events).toEqual([]);
    expect(learningEventReporter.report).not.toHaveBeenCalled();

    await binding.commandExecutor?.execute({
      targetId: FIRST_ANNOTATION_ID,
      type: "close",
      signal: new AbortController().signal,
    });
    await user.click(screen.getByRole("button", { name: "View annotation 1" }));
    await waitFor(() => {
      expect(binding.stateReader?.read({ targetId: FIRST_ANNOTATION_ID, key: "open" })).toBe(true);
      expect(events).toEqual([{ targetId: FIRST_ANNOTATION_ID, type: "opened" }]);
    });

    await user.click(screen.getByRole("button", { name: "View annotation 2" }));
    await waitFor(() => {
      expect(binding.stateReader?.read({ targetId: FIRST_ANNOTATION_ID, key: "open" })).toBe(false);
      expect(binding.stateReader?.read({ targetId: SECOND_ANNOTATION_ID, key: "open" })).toBe(true);
      expect(events).toEqual([
        { targetId: FIRST_ANNOTATION_ID, type: "opened" },
        { targetId: SECOND_ANNOTATION_ID, type: "opened" },
      ]);
    });

    await user.click(screen.getByRole("button", { name: "View annotation 2" }));
    await waitFor(() => {
      expect(binding.stateReader?.read({ targetId: SECOND_ANNOTATION_ID, key: "open" })).toBe(
        false,
      );
      expect(events.at(-1)).toEqual({ targetId: SECOND_ANNOTATION_ID, type: "closed" });
    });

    await user.click(screen.getByRole("button", { name: "View annotation 1" }));
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(binding.stateReader?.read({ targetId: FIRST_ANNOTATION_ID, key: "open" })).toBe(false);
      expect(events.slice(-2)).toEqual([
        { targetId: FIRST_ANNOTATION_ID, type: "opened" },
        { targetId: FIRST_ANNOTATION_ID, type: "closed" },
      ]);
    });
    expect(stateAtEvent).toEqual([true, true, false, true, false]);
    expect(learningEventReporter.report).toHaveBeenCalledTimes(2);

    const eventCountBeforeSemanticActivation = events.length;
    learningEventReporter.report.mockClear();
    await expect(
      getSemanticTargetInteractionEnvironmentForEditor(editor).coordinator.activate(
        SECOND_ANNOTATION_ID,
        { origin: "configured-presentation" },
      ),
    ).resolves.toEqual({ kind: "reached", requestedId: SECOND_ANNOTATION_ID });
    await waitFor(() =>
      expect(binding.stateReader?.read({ targetId: SECOND_ANNOTATION_ID, key: "open" })).toBe(true),
    );
    expect(events).toHaveLength(eventCountBeforeSemanticActivation);
    expect(learningEventReporter.report).not.toHaveBeenCalled();

    expect(() =>
      binding.stateReader?.read({
        targetId: "foreignAnn01" as EmbeddedNodeId,
        key: "open",
      }),
    ).toThrow(`Control target "foreignAnn01" does not belong to owner "${OWNER_ID}".`);

    rendered.unmount();
    await waitFor(() =>
      expect(getControlBindingRegistryForEditor(editor).get(OWNER_ID)).toBeUndefined(),
    );
    expect(() => binding.stateReader?.read({ targetId: FIRST_ANNOTATION_ID, key: "open" })).toThrow(
      `Control Binding for owner "${OWNER_ID}" is no longer mounted.`,
    );
    unsubscribe?.();
  });

  it("marks the figure completed after the learner opens every annotation", async () => {
    const user = userEvent.setup();
    const editor = createRuntimeEditor("popover");
    renderEditor(editor);
    const binding = await requireAnnotatedFigureBinding(editor);

    expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "completed" })).toBe(false);

    await user.click(screen.getByRole("button", { name: "View annotation 1" }));
    expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "completed" })).toBe(false);

    await user.click(screen.getByRole("button", { name: "View annotation 2" }));
    expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "completed" })).toBe(true);
  });

  it("preserves an open annotation on lightbox transfer and reports explicit viewer dismissal", async () => {
    const user = userEvent.setup();
    const editor = createRuntimeEditor("popover");
    renderEditor(editor);
    const binding = await requireAnnotatedFigureBinding(editor);
    const events: ControlEvent[] = [];
    binding.eventSource?.subscribe((event) => events.push(event));

    await user.click(screen.getByRole("button", { name: "View annotation 1" }));
    await waitFor(() => expect(events).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "Expand annotated figure" }));

    const dialog = await screen.findByRole("dialog", { name: "Annotated figure viewer" });
    expect(within(dialog).getByRole("button", { name: "View annotation 1" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(binding.stateReader?.read({ targetId: FIRST_ANNOTATION_ID, key: "open" })).toBe(true);
    expect(events).toEqual([{ targetId: FIRST_ANNOTATION_ID, type: "opened" }]);

    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => {
      expect(binding.stateReader?.read({ targetId: FIRST_ANNOTATION_ID, key: "open" })).toBe(false);
      expect(screen.getByRole("button", { name: "View annotation 1" })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    });
    expect(events).toEqual([
      { targetId: FIRST_ANNOTATION_ID, type: "opened" },
      { targetId: FIRST_ANNOTATION_ID, type: "closed" },
    ]);
  });

  it("keeps list mode and authoring outside the live binding lifecycle", async () => {
    const runtime = createRuntimeEditor("list");
    renderEditor(runtime);
    await screen.findByRole("list", { name: "Annotations" });
    expect(getControlBindingRegistryForEditor(runtime).get(OWNER_ID)).toBeUndefined();
    cleanup();

    const authoring = createAuthoringEditor();
    render(
      <AppThemeProvider appearance="light">
        <CourseThemeProvider
          appearance="light"
          hasBackground={false}
          theme={createDefaultPersistedCourseTheme()}
        >
          {createAuthoringMovementTestRoot(authoring, <EditorContent editor={authoring} />)}
        </CourseThemeProvider>
      </AppThemeProvider>,
    );
    await screen.findByRole("group", { name: "Annotated figure image" });
    expect(getControlBindingRegistryForEditor(authoring).get(OWNER_ID)).toBeUndefined();
  });

  it("survives annotation revisions and silently reconciles deleted open targets", async () => {
    const editor = createRuntimeEditor("popover");
    renderEditor(editor);
    const registry = getControlBindingRegistryForEditor(editor);
    const binding = await requireAnnotatedFigureBinding(editor);
    const events: ControlEvent[] = [];
    binding.eventSource?.subscribe((event) => events.push(event));

    await binding.commandExecutor?.execute({
      targetId: FIRST_ANNOTATION_ID,
      type: "open",
      signal: new AbortController().signal,
    });
    const firstPosition = requireNodePosition(editor, FIRST_ANNOTATION_ID);
    const firstAnnotation = editor.state.doc.nodeAt(firstPosition);
    if (!firstAnnotation) throw new Error("Expected the first Annotated Figure annotation.");
    const replacementId = "annotPinCtl3" as EmbeddedNodeId;
    editor.view.dispatch(
      editor.state.tr
        .setNodeMarkup(firstPosition, undefined, {
          ...firstAnnotation.attrs,
          id: replacementId,
        })
        .setMeta("studentGuard", "allow"),
    );

    await waitFor(() => {
      expect(registry.get(OWNER_ID)).toBe(binding);
      expect(() =>
        binding.stateReader?.read({ targetId: FIRST_ANNOTATION_ID, key: "open" }),
      ).toThrow();
      expect(binding.stateReader?.read({ targetId: replacementId, key: "open" })).toBe(false);
    });
    expect(events).toEqual([]);

    const ownerPosition = requireNodePosition(editor, OWNER_ID);
    const owner = editor.state.doc.nodeAt(ownerPosition);
    if (!owner) throw new Error("Expected the Annotated Figure owner.");
    editor.view.dispatch(
      editor.state.tr
        .setNodeMarkup(ownerPosition, undefined, {
          ...owner.attrs,
          data: { ...owner.attrs["data"], captionDisplay: "list" },
        })
        .setMeta("studentGuard", "allow"),
    );
    await waitFor(() => expect(registry.get(OWNER_ID)).toBeUndefined());
    expect(events).toEqual([]);
  });
});

async function requireAnnotatedFigureBinding(editor: Editor): Promise<ControlBinding> {
  const registry = getControlBindingRegistryForEditor(editor);
  await waitFor(() => expect(registry.get(OWNER_ID)).toBeDefined());
  const binding = registry.get(OWNER_ID);
  if (!binding) throw new Error("Expected mounted Annotated Figure Control Binding.");
  return binding;
}

function createRuntimeEditor(captionDisplay: "list" | "popover"): Editor {
  const editor = new Editor({
    editable: false,
    extensions: createCourseDocumentRuntimeExtensions({ composition: application.runtime }),
    content: annotatedFigureDocument(captionDisplay),
  });
  editors.push(editor);
  return editor;
}

function renderEditor(editor: Editor) {
  return render(
    <AppThemeProvider appearance="light">
      <CourseThemeProvider
        appearance="light"
        hasBackground={false}
        theme={createDefaultPersistedCourseTheme()}
      >
        <EditorContent editor={editor} />
      </CourseThemeProvider>
    </AppThemeProvider>,
  );
}

function createAuthoringEditor(): Editor {
  const environment = createCourseDocumentAuthoringEnvironment({
    composition: application.authoring,
    editable: true,
  });
  const editor = new Editor({
    editable: true,
    extensions: getCourseDocumentAuthoringEnvironmentState(environment).extensions,
    content: annotatedFigureDocument("popover"),
  });
  editors.push(editor);
  return editor;
}

function annotatedFigureDocument(captionDisplay: "list" | "popover"): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { id: "courseAnnCtl", mode: "page" },
        content: [
          {
            type: "surface",
            attrs: { id: "surfaceAnCtl", variant: "page-default" },
            content: [
              {
                type: "annotated_figure",
                attrs: {
                  id: OWNER_ID,
                  data: {
                    type: "annotated_figure",
                    source: { mode: "external", src: "https://example.com/figure.jpg" },
                    alt: "Annotated control figure",
                    captionDisplay,
                  },
                },
                content: [
                  { type: "annotated_figure_canvas" },
                  {
                    type: "annotated_figure_legend",
                    content: [
                      annotation(FIRST_ANNOTATION_ID, "Authored title", "Authored caption"),
                      annotation(SECOND_ANNOTATION_ID, "", ""),
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function annotation(id: EmbeddedNodeId, title: string, caption: string): JSONContent {
  return {
    type: "annotated_figure_annotation",
    attrs: { id, title, x: 25, y: 35 },
    content: [
      {
        type: "paragraph",
        ...(caption ? { content: [{ type: "text", text: caption }] } : {}),
      },
    ],
  };
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
