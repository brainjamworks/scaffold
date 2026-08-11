// @vitest-environment happy-dom

import { cleanup, render, waitFor } from "@testing-library/react";
import { type Editor, type JSONContent } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";
import { CourseDocumentEditor } from "./CourseDocumentEditor.test-harness";

const coreAuthoringComposition = createCoreScaffoldAuthoringComposition();

afterEach(cleanup);

describe("CourseDocumentEditor portable content", () => {
  it("initializes a non-collaborative editor from portable JSON and emits updated JSON", async () => {
    const content = pageDocument("Initial portable content");
    const onReady = vi.fn();
    const onUpdate = vi.fn();

    render(
      createElement(CourseDocumentEditor, {
        composition: coreAuthoringComposition,
        source: { mode: "document", content, onUpdate },
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const editor = onReady.mock.calls[0]?.[0] as Editor;
    editor.commands.insertContent("Portable update");

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalled();
      expect(onUpdate.mock.lastCall?.[0]).toEqual(editor.getJSON());
    });
  });

  it("mounts unavailable canonical content as working state and emits only canonical updates", async () => {
    const original = {
      type: "plus_private_block",
      attrs: { id: "plusblock001", private: "preserve exactly" },
    };
    const content = pageDocument("Editable content");
    content.content![0]!.content![0]!.content!.push(original);
    const onReady = vi.fn();
    const onUpdate = vi.fn();

    render(
      createElement(CourseDocumentEditor, {
        composition: coreAuthoringComposition,
        source: { mode: "document", content, onUpdate },
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const editor = onReady.mock.calls[0]?.[0] as Editor;

    editor.commands.insertContent(" updated");

    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    const [canonical, unavailable] = onUpdate.mock.lastCall ?? [];
    expect(findNode(canonical, "plus_private_block")).toEqual(original);
    expect(findNode(canonical, "unavailable_block")).toBeUndefined();
    expect(unavailable).toEqual([
      expect.objectContaining({
        kind: "block",
        capabilityId: "plus_private_block",
        stableId: "plusblock001",
      }),
    ]);
  });

  it("opens, selects, deletes, and losslessly saves an unavailable Surface", async () => {
    const content = slideshowDocumentWithUnavailableSurface();
    const unavailableOriginal = structuredClone(content.content![0]!.content![1]!);
    const onReady = vi.fn();
    const onUpdate = vi.fn();

    render(
      createElement(CourseDocumentEditor, {
        composition: coreAuthoringComposition,
        source: { mode: "document", content, onUpdate },
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const editor = onReady.mock.calls[0]?.[0] as Editor;
    const position = firstNodePosition(editor, "unavailable_surface");
    const unavailableNode = editor.state.doc.nodeAt(position);
    if (!unavailableNode) throw new Error("Expected unavailable Surface.");

    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(position, undefined, { ...unavailableNode.attrs }),
    );

    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    expect(findNodeById(onUpdate.mock.lastCall?.[0], "plussurf0001")).toEqual(unavailableOriginal);
    expect(findNode(onUpdate.mock.lastCall?.[0], "unavailable_surface")).toBeUndefined();

    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, position)),
    );
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect(editor.commands.deleteSelection()).toBe(true);

    await waitFor(() =>
      expect(findNodeById(onUpdate.mock.lastCall?.[0], "plussurf0001")).toBeUndefined(),
    );
  });

  it("canonicalizes delete and undo of an unavailable item without resurrection side state", async () => {
    const content = pageDocument("Editable content");
    content.content![0]!.content![0]!.content!.push({
      type: "plus_private_block",
      attrs: { id: "plusblock001", private: "preserve exactly" },
    });
    const onReady = vi.fn();
    const onUpdate = vi.fn();

    render(
      createElement(CourseDocumentEditor, {
        composition: coreAuthoringComposition,
        source: { mode: "document", content, onUpdate },
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const editor = onReady.mock.calls[0]?.[0] as Editor;
    const position = firstNodePosition(editor, "unavailable_block");
    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, position)),
    );
    editor.commands.deleteSelection();

    await waitFor(() =>
      expect(findNode(onUpdate.mock.lastCall?.[0], "plus_private_block")).toBeUndefined(),
    );
    expect(editor.commands.undo()).toBe(true);
    await waitFor(() =>
      expect(findNode(onUpdate.mock.lastCall?.[0], "plus_private_block")).toBeDefined(),
    );
  });

  it("canonicalizes an unavailable item moved within its legal parent", async () => {
    const original = {
      type: "plus_private_block",
      attrs: { id: "plusblock001", private: "preserve exactly" },
    };
    const content = pageDocument("Editable content");
    content.content![0]!.content![0]!.content!.push(original);
    const onReady = vi.fn();
    const onUpdate = vi.fn();

    render(
      createElement(CourseDocumentEditor, {
        composition: coreAuthoringComposition,
        source: { mode: "document", content, onUpdate },
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const editor = onReady.mock.calls[0]?.[0] as Editor;
    const unavailablePosition = firstNodePosition(editor, "unavailable_block");
    const paragraphPosition = firstNodePosition(editor, "paragraph");
    const unavailableNode = editor.state.doc.nodeAt(unavailablePosition);
    if (!unavailableNode) throw new Error("expected unavailable compatibility item");

    editor.view.dispatch(
      editor.state.tr
        .delete(unavailablePosition, unavailablePosition + unavailableNode.nodeSize)
        .insert(paragraphPosition, unavailableNode),
    );

    await waitFor(() => {
      const canonicalSurface = findNode(onUpdate.mock.lastCall?.[0], "surface");
      expect(canonicalSurface?.content?.map(({ type }) => type)).toEqual([
        "plus_private_block",
        "paragraph",
      ]);
      expect(canonicalSurface?.content?.[0]).toEqual(original);
    });
  });

  it.each([
    ["invalid", pageDocumentWithoutCourseId()],
    ["requires-scaffold-plus", plusRequiredPageDocument()],
    ["unsupported-core-format", futurePageDocument()],
  ] as const)("withholds mount and onReady for %s portable content", async (status, content) => {
    const onReady = vi.fn();
    const onDocumentError = vi.fn();

    render(
      createElement(CourseDocumentEditor, {
        composition: coreAuthoringComposition,
        source: { mode: "document", content },
        onReady,
        onDocumentError,
      }),
    );

    await waitFor(() =>
      expect(onDocumentError).toHaveBeenCalledWith(expect.objectContaining({ status })),
    );
    expect(onReady).not.toHaveBeenCalled();
  });

  it("does not emit a persistence update after the course requirement is changed", async () => {
    const onReady = vi.fn();
    const onUpdate = vi.fn();
    const onDocumentError = vi.fn();

    render(
      createElement(CourseDocumentEditor, {
        composition: coreAuthoringComposition,
        source: { mode: "document", content: pageDocument("Protected"), onUpdate },
        onReady,
        onDocumentError,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const editor = onReady.mock.calls[0]?.[0] as Editor;
    const courseDocument = editor.state.doc.nodeAt(0);
    if (!courseDocument) throw new Error("Expected Course Document root.");
    onUpdate.mockClear();

    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(0, undefined, {
        ...courseDocument.attrs,
        requiresScaffoldPlus: true,
      }),
    );

    await waitFor(() =>
      expect(onDocumentError).toHaveBeenCalledWith({
        status: "canonicalization-failed",
        issues: [expect.objectContaining({ code: "scaffold_plus_requirement_changed" })],
      }),
    );
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("treats the source as initial state for the mounted session", async () => {
    const onReady = vi.fn();
    const { rerender } = render(
      createElement(CourseDocumentEditor, {
        composition: coreAuthoringComposition,
        source: { mode: "document", content: pageDocument("First artifact") },
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const editor = onReady.mock.calls[0]?.[0] as Editor;

    rerender(
      createElement(CourseDocumentEditor, {
        composition: coreAuthoringComposition,
        source: { mode: "document", content: pageDocument("Different artifact") },
        onReady,
      }),
    );

    expect(editor.getText()).toContain("First artifact");
    expect(editor.getText()).not.toContain("Different artifact");
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("uses the latest update observer without replacing mounted document state", async () => {
    const firstOnUpdate = vi.fn();
    const nextOnUpdate = vi.fn();
    const onReady = vi.fn();
    const { rerender } = render(
      createElement(CourseDocumentEditor, {
        composition: coreAuthoringComposition,
        source: {
          mode: "document",
          content: pageDocument("First artifact"),
          onUpdate: firstOnUpdate,
        },
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const editor = onReady.mock.calls[0]?.[0] as Editor;
    firstOnUpdate.mockClear();

    rerender(
      createElement(CourseDocumentEditor, {
        composition: coreAuthoringComposition,
        source: {
          mode: "document",
          content: pageDocument("Ignored replacement"),
          onUpdate: nextOnUpdate,
        },
        onReady,
      }),
    );
    editor.commands.insertContent(" fresh callback");

    await waitFor(() => expect(nextOnUpdate).toHaveBeenCalledTimes(1));
    expect(firstOnUpdate).not.toHaveBeenCalled();
    expect(editor.getText()).toContain("First artifact");
    expect(editor.getText()).not.toContain("Ignored replacement");
  });
});

function pageDocument(text: string): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: {
          id: "course000001",
          schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
          requiresScaffoldPlus: false,
          mode: "page",
          surfaceSize: "fluid",
          overflowMode: "grow",
          theme: createDefaultPersistedCourseTheme(),
        },
        content: [
          {
            type: "surface",
            attrs: { id: "surface-page", variant: "page-default" },
            content: [
              {
                type: "paragraph",
                attrs: { id: "paragraph001" },
                content: [{ type: "text", text }],
              },
            ],
          },
        ],
      },
    ],
  };
}

function plusRequiredPageDocument(): JSONContent {
  const content = pageDocument("Plus required");
  content.content![0]!.attrs!["requiresScaffoldPlus"] = true;
  return content;
}

function pageDocumentWithoutCourseId(): JSONContent {
  const content = pageDocument("Invalid");
  delete content.content?.[0]?.attrs?.["id"];
  return content;
}

function slideshowDocumentWithUnavailableSurface(): JSONContent {
  const content = createScaffoldDocumentContent({
    mode: "slideshow",
    surfaceId: "surface00001",
  });
  const courseDocument = content.content![0]!;
  courseDocument.content!.push({
    type: "surface",
    attrs: {
      id: "plussurf0001",
      variant: "plus.private-surface",
      settings: { private: "preserve exactly" },
    },
    content: [
      {
        type: "private_surface_child",
        attrs: { id: "private00001", answer: "opaque private answer" },
      },
    ],
  });
  return content;
}

function futurePageDocument(): JSONContent {
  const content = pageDocument("Future");
  content.content![0]!.attrs!["schemaVersion"] = SCAFFOLD_DOCUMENT_FORMAT_VERSION + 1;
  return content;
}

function findNode(root: unknown, type: string): JSONContent | undefined {
  const stack = [root];
  while (stack.length > 0) {
    const value = stack.pop();
    if (!value || typeof value !== "object") continue;
    const node = value as JSONContent;
    if (node.type === type) return node;
    stack.push(...(node.content ?? []));
  }
  return undefined;
}

function findNodeById(root: unknown, id: string): JSONContent | undefined {
  const stack = [root];
  while (stack.length > 0) {
    const value = stack.pop();
    if (!value || typeof value !== "object") continue;
    const node = value as JSONContent;
    if (node.attrs?.["id"] === id) return node;
    stack.push(...(node.content ?? []));
  }
  return undefined;
}

function firstNodePosition(editor: Editor, type: string): number {
  let position: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== type) return true;
    position = pos;
    return false;
  });
  if (position === null) throw new Error(`Expected ${type}.`);
  return position;
}
