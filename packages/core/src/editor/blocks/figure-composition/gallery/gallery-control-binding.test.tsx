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

import { GALLERY_ITEM_NODE, GALLERY_NODE, emptyGalleryData } from "./content";
import { galleryDefinition } from "./gallery-definition";

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
const OWNER_ID = "gallery_0001" as EmbeddedNodeId;
const FIRST_ITEM_ID = "galleryimg01" as EmbeddedNodeId;
const SECOND_ITEM_ID = "galleryimg02" as EmbeddedNodeId;

afterEach(() => {
  cleanup();
  learningEventReporter.report.mockClear();
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("Gallery Control Binding", () => {
  it("declares only the approved public carousel item capabilities", () => {
    expect((galleryDefinition as BlockDefinition).control).toEqual({
      semanticChildren: {
        gallery_item: {
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

  it("reads current state, executes silent commands and emits only changed learner selections", async () => {
    const user = userEvent.setup();
    const editor = createRuntimeEditor("carousel");
    const rendered = renderRuntimeEditor(editor);
    const binding = await requireGalleryBinding(editor);
    const events: ControlEvent[] = [];
    const stateAtEvent: boolean[] = [];
    binding.eventSource?.subscribe((event) => {
      events.push(event);
      stateAtEvent.push(
        binding.stateReader?.read({ targetId: event.targetId, key: "selected" }) === true,
      );
    });

    expect(binding.stateReader?.read({ targetId: FIRST_ITEM_ID, key: "selected" })).toBe(true);
    expect(binding.stateReader?.read({ targetId: SECOND_ITEM_ID, key: "selected" })).toBe(false);

    await user.click(screen.getByRole("button", { name: "Show image 2" }));
    await waitFor(() => {
      expect(binding.stateReader?.read({ targetId: SECOND_ITEM_ID, key: "selected" })).toBe(true);
      expect(events).toEqual([{ targetId: SECOND_ITEM_ID, type: "selected" }]);
    });
    expect(stateAtEvent).toEqual([true]);

    await user.click(screen.getByRole("button", { name: "Show image 2" }));
    expect(events).toHaveLength(1);

    const selectedFirst = await binding.commandExecutor?.execute({
      targetId: FIRST_ITEM_ID,
      type: "select",
      signal: new AbortController().signal,
    });
    expect(selectedFirst?.isOk()).toBe(true);
    expect(binding.stateReader?.read({ targetId: FIRST_ITEM_ID, key: "selected" })).toBe(true);
    const repeatedSelect = await binding.commandExecutor?.execute({
      targetId: FIRST_ITEM_ID,
      type: "select",
      signal: new AbortController().signal,
    });
    expect(repeatedSelect?.isOk()).toBe(true);
    expect(events).toHaveLength(1);
    expect(learningEventReporter.report).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Open First image fullscreen" }));
    const lightbox = await screen.findByRole("dialog", { name: "Gallery viewer" });
    await user.click(within(lightbox).getByRole("button", { name: "Next image" }));
    expect(within(lightbox).getByRole("img", { name: "Second image" })).toBeInTheDocument();
    expect(binding.stateReader?.read({ targetId: FIRST_ITEM_ID, key: "selected" })).toBe(true);
    expect(events).toHaveLength(1);
    await user.click(within(lightbox).getByRole("button", { name: "Close" }));

    const cancelled = new AbortController();
    cancelled.abort();
    const cancelledResult = await binding.commandExecutor?.execute({
      targetId: SECOND_ITEM_ID,
      type: "select",
      signal: cancelled.signal,
    });
    expect(cancelledResult?.isErr()).toBe(true);
    if (!cancelledResult || cancelledResult.isOk()) {
      throw new Error("Expected the pre-aborted Gallery command to be cancelled.");
    }
    expect(cancelledResult.error).toEqual({ reason: "cancelled" });
    expect(binding.stateReader?.read({ targetId: FIRST_ITEM_ID, key: "selected" })).toBe(true);

    const abortAfterCommit = new AbortController();
    const committed = binding.commandExecutor?.execute({
      targetId: SECOND_ITEM_ID,
      type: "select",
      signal: abortAfterCommit.signal,
    });
    abortAfterCommit.abort();
    expect((await committed)?.isOk()).toBe(true);
    expect(binding.stateReader?.read({ targetId: SECOND_ITEM_ID, key: "selected" })).toBe(true);
    expect(events).toHaveLength(1);
    expect(learningEventReporter.report).not.toHaveBeenCalled();

    await binding.commandExecutor?.execute({
      targetId: FIRST_ITEM_ID,
      type: "select",
      signal: new AbortController().signal,
    });
    await expect(
      getSemanticTargetInteractionEnvironmentForEditor(editor).coordinator.activate(
        SECOND_ITEM_ID,
        { origin: "configured-presentation" },
      ),
    ).resolves.toEqual({ kind: "reached", requestedId: SECOND_ITEM_ID });
    await waitFor(() =>
      expect(binding.stateReader?.read({ targetId: SECOND_ITEM_ID, key: "selected" })).toBe(true),
    );
    expect(events).toHaveLength(1);
    expect(learningEventReporter.report).not.toHaveBeenCalled();

    expect(() =>
      binding.stateReader?.read({
        targetId: "foreignGalleryItem" as EmbeddedNodeId,
        key: "selected",
      }),
    ).toThrow(`Control target "foreignGalleryItem" does not belong to owner "${OWNER_ID}".`);

    rendered.unmount();
    await waitFor(() =>
      expect(getControlBindingRegistryForEditor(editor).get(OWNER_ID)).toBeUndefined(),
    );
    expect(() => binding.stateReader?.read({ targetId: FIRST_ITEM_ID, key: "selected" })).toThrow(
      `Control Binding for owner "${OWNER_ID}" is no longer mounted.`,
    );
  });

  it("survives revisions and silently reconciles deletion, reorder and layout changes", async () => {
    const editor = createRuntimeEditor("carousel");
    renderRuntimeEditor(editor);
    const registry = getControlBindingRegistryForEditor(editor);
    const binding = await requireGalleryBinding(editor);
    const events: ControlEvent[] = [];
    binding.eventSource?.subscribe((event) => events.push(event));
    await binding.commandExecutor?.execute({
      targetId: SECOND_ITEM_ID,
      type: "select",
      signal: new AbortController().signal,
    });

    const ownerPosition = requireNodePosition(editor, OWNER_ID);
    const owner = editor.state.doc.nodeAt(ownerPosition);
    if (!owner) throw new Error("Expected the Gallery owner.");
    const first = owner.child(0);
    const second = owner.child(1);
    const reordered = owner.type.create(owner.attrs, [second, first]);
    editor.view.dispatch(
      editor.state.tr
        .replaceWith(ownerPosition, ownerPosition + owner.nodeSize, reordered)
        .setMeta("studentGuard", "allow"),
    );
    await waitFor(() => {
      expect(registry.get(OWNER_ID)).toBe(binding);
      expect(binding.stateReader?.read({ targetId: SECOND_ITEM_ID, key: "selected" })).toBe(true);
    });
    expect(events).toEqual([]);

    const currentOwner = editor.state.doc.nodeAt(ownerPosition);
    if (!currentOwner) throw new Error("Expected the reordered Gallery owner.");
    const withoutSecond = currentOwner.type.create(currentOwner.attrs, [currentOwner.child(1)]);
    editor.view.dispatch(
      editor.state.tr
        .replaceWith(ownerPosition, ownerPosition + currentOwner.nodeSize, withoutSecond)
        .setMeta("studentGuard", "allow"),
    );
    await waitFor(() => {
      expect(binding.stateReader?.read({ targetId: FIRST_ITEM_ID, key: "selected" })).toBe(true);
      expect(() =>
        binding.stateReader?.read({ targetId: SECOND_ITEM_ID, key: "selected" }),
      ).toThrow();
    });
    expect(events).toEqual([]);

    const latestOwner = editor.state.doc.nodeAt(ownerPosition);
    if (!latestOwner) throw new Error("Expected the current Gallery owner.");
    editor.view.dispatch(
      editor.state.tr
        .setNodeMarkup(ownerPosition, undefined, {
          ...latestOwner.attrs,
          data: { ...latestOwner.attrs["data"], layout: "grid" },
        })
        .setMeta("studentGuard", "allow"),
    );
    await waitFor(() => expect(registry.get(OWNER_ID)).toBeUndefined());
    expect(events).toEqual([]);
  });

  it("mounts no live binding for grid runtime or authoring", async () => {
    const runtime = createRuntimeEditor("grid");
    renderRuntimeEditor(runtime);
    await screen.findByRole("list");
    expect(getControlBindingRegistryForEditor(runtime).get(OWNER_ID)).toBeUndefined();
    cleanup();

    const authoring = createAuthoringEditor();
    renderAuthoringEditor(authoring);
    await screen.findByRole("button", { name: "Show image 1" });
    expect(getControlBindingRegistryForEditor(authoring).get(OWNER_ID)).toBeUndefined();
  });
});

async function requireGalleryBinding(editor: Editor): Promise<ControlBinding> {
  const registry = getControlBindingRegistryForEditor(editor);
  await waitFor(() => expect(registry.get(OWNER_ID)).toBeDefined());
  const binding = registry.get(OWNER_ID);
  if (!binding) throw new Error("Expected mounted Gallery Control Binding.");
  return binding;
}

function createRuntimeEditor(layout: "carousel" | "grid"): Editor {
  const editor = new Editor({
    editable: false,
    extensions: createCourseDocumentRuntimeExtensions({ composition: application.runtime }),
    content: galleryDocument(layout),
  });
  editors.push(editor);
  return editor;
}

function renderRuntimeEditor(editor: Editor) {
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
    content: galleryDocument("carousel"),
  });
  editors.push(editor);
  return editor;
}

function renderAuthoringEditor(editor: Editor) {
  return render(
    <AppThemeProvider appearance="light">
      <CourseThemeProvider
        appearance="light"
        hasBackground={false}
        theme={createDefaultPersistedCourseTheme()}
      >
        {createAuthoringMovementTestRoot(editor, <EditorContent editor={editor} />)}
      </CourseThemeProvider>
    </AppThemeProvider>,
  );
}

function galleryDocument(layout: "carousel" | "grid"): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { id: "courseGal001", mode: "page" },
        content: [
          {
            type: "surface",
            attrs: { id: "surfaceGal01", variant: "page-default" },
            content: [
              {
                type: GALLERY_NODE,
                attrs: { id: OWNER_ID, data: emptyGalleryData({ layout }) },
                content: [
                  galleryItem(FIRST_ITEM_ID, "First image", "image-1.jpg"),
                  galleryItem(SECOND_ITEM_ID, "Second image", "image-2.jpg"),
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function galleryItem(id: EmbeddedNodeId, alt: string, filename: string): JSONContent {
  return {
    type: GALLERY_ITEM_NODE,
    attrs: {
      id,
      data: {
        image: { mode: "external", src: `https://example.com/${filename}`, alt },
        caption: { type: "doc", content: [{ type: "paragraph" }] },
      },
    },
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
