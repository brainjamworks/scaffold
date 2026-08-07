// @vitest-environment happy-dom

import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { Editor, JSONContent } from "@tiptap/core";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { CourseDocumentEditor } from "@/document/authoring/CourseDocumentEditor";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { slideCoverSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-cover";
import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";

const composition = createCoreScaffoldAuthoringComposition();
const FIRST_SURFACE_ID = createEmbeddedNodeId();
const SECOND_SURFACE_ID = createEmbeddedNodeId();
const THIRD_SURFACE_ID = createEmbeddedNodeId();

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("mounted Course Section authoring", () => {
  it("persists the complete accessible workflow as atomic history actions", async () => {
    const source = slideshowDocument([FIRST_SURFACE_ID, SECOND_SURFACE_ID, THIRD_SURFACE_ID]);
    const onReady = vi.fn<(editor: Editor) => void>();
    const onUpdate = vi.fn<(json: JSONContent) => void>();
    const user = userEvent.setup();

    render(
      createElement(CourseDocumentEditor, {
        composition,
        source: { mode: "document", content: source, onUpdate },
        onReady,
      }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const editor = onReady.mock.calls[0]?.[0];
    if (!editor) throw new Error("Expected the mounted Course Document editor.");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start Course Section at slide 2" })).toBeVisible();
    });
    const unsectioned = structuredClone(editor.getJSON());
    expect(readSurfaceIds(editor)).toEqual([FIRST_SURFACE_ID, SECOND_SURFACE_ID, THIRD_SURFACE_ID]);
    onUpdate.mockClear();

    fireEvent.keyDown(screen.getByRole("button", { name: "Start Course Section at slide 2" }), {
      key: "Enter",
    });
    const startDialog = await screen.findByRole("dialog", { name: "Start Course Section" });
    await user.type(within(startDialog).getByLabelText("Leading Course Section title"), "Shared");
    await user.type(within(startDialog).getByLabelText("Course Section title"), "Shared");
    await user.click(within(startDialog).getByRole("button", { name: "Start Course Section" }));

    await waitFor(() => {
      expect(
        screen.getByRole("group", { name: "Shared, Course Section 1 of 2" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("group", { name: "Shared, Course Section 2 of 2" }),
      ).toBeInTheDocument();
    });
    expect(readSectionTitles(editor)).toEqual(["Shared", "Shared"]);
    expect(readSurfaceIds(editor)).toEqual([FIRST_SURFACE_ID, SECOND_SURFACE_ID, THIRD_SURFACE_ID]);
    await expectOnePersistedUpdate(onUpdate, editor);
    const enabled = structuredClone(editor.getJSON());

    act(() => expect(editor.commands.undo()).toBe(true));
    await waitForJson(editor, unsectioned);
    await expectOnePersistedUpdate(onUpdate, editor);
    act(() => expect(editor.commands.redo()).toBe(true));
    await waitForJson(editor, enabled);
    await expectOnePersistedUpdate(onUpdate, editor);

    await user.click(screen.getByRole("button", { name: "Start Course Section at slide 3" }));
    const splitDialog = await screen.findByRole("dialog", { name: "Start Course Section" });
    expect(within(splitDialog).queryByLabelText("Leading Course Section title")).toBeNull();
    await user.type(within(splitDialog).getByLabelText("Course Section title"), "Practice");
    await user.click(within(splitDialog).getByRole("button", { name: "Start Course Section" }));
    await waitFor(() =>
      expect(readSectionTitles(editor)).toEqual(["Shared", "Shared", "Practice"]),
    );
    await expectOnePersistedUpdate(onUpdate, editor);

    const practiceBoundary = await screen.findByRole("group", {
      name: "Practice, Course Section 3 of 3",
    });
    await user.click(
      within(practiceBoundary).getByRole("button", {
        name: "Rename Practice, Course Section 3 of 3",
      }),
    );
    const renameDialog = await screen.findByRole("dialog", { name: "Rename Course Section" });
    const titleInput = within(renameDialog).getByLabelText("Course Section title");
    await user.clear(titleInput);
    await user.type(titleInput, "Shared");
    await user.click(within(renameDialog).getByRole("button", { name: "Rename Course Section" }));
    await waitFor(() => {
      expect(
        screen.getByRole("group", { name: "Shared, Course Section 1 of 3" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("group", { name: "Shared, Course Section 2 of 3" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("group", { name: "Shared, Course Section 3 of 3" }),
      ).toBeInTheDocument();
    });
    await expectOnePersistedUpdate(onUpdate, editor);

    const middleBoundary = screen.getByRole("group", {
      name: "Shared, Course Section 2 of 3",
    });
    await user.click(
      within(middleBoundary).getByRole("button", {
        name: "Remove Shared, Course Section 2 of 3",
      }),
    );
    await waitFor(() => expect(readSectionTitles(editor)).toEqual(["Shared", "Shared"]));
    expect(readSurfaceIds(editor)).toEqual([FIRST_SURFACE_ID, SECOND_SURFACE_ID, THIRD_SURFACE_ID]);
    await expectOnePersistedUpdate(onUpdate, editor);

    const duplicateSource = screen.getByRole("group", {
      name: "Shared, Course Section 1 of 2",
    });
    const beforeSectionDuplicate = structuredClone(editor.getJSON());
    await user.click(
      within(duplicateSource).getByRole("button", {
        name: "Duplicate Shared, Course Section 1 of 2",
      }),
    );
    await waitFor(() => expect(readSurfaceIds(editor)).toHaveLength(5));
    const afterSectionDuplicate = structuredClone(editor.getJSON());
    expect(readSectionTitles(editor)).toEqual(["Shared", "Shared", "Shared"]);
    expect(allNodeIds(afterSectionDuplicate).size).toBe(
      allNodeIdsArray(afterSectionDuplicate).length,
    );
    await expectOnePersistedUpdate(onUpdate, editor);

    act(() => expect(editor.commands.undo()).toBe(true));
    await waitForJson(editor, beforeSectionDuplicate);
    await expectOnePersistedUpdate(onUpdate, editor);
    act(() => expect(editor.commands.redo()).toBe(true));
    await waitForJson(editor, afterSectionDuplicate);
    await expectOnePersistedUpdate(onUpdate, editor);

    expect(
      screen.queryByRole("button", { name: /Move Course Section|Move earlier|Move later/ }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /Move Surface/ })).toBeNull();
    expect(globalThis.document.querySelectorAll("[data-course-section-authoring]")).toHaveLength(3);
    expect(globalThis.document.querySelectorAll('[data-node="surface"]')).toHaveLength(5);
    expect(
      Array.from(globalThis.document.querySelectorAll("[data-course-section-authoring]")).every(
        (boundary) => boundary.closest("[data-surface-content]") === null,
      ),
    ).toBe(true);

    await user.click(screen.getByRole("button", { name: "Add slide after slide 1" }));
    const templateDialog = await screen.findByRole("dialog", { name: "Choose slide template" });
    await user.click(within(templateDialog).getByRole("button", { name: "Content" }));
    await waitFor(() => expect(readSurfaceIds(editor)).toHaveLength(6));
    await expectOnePersistedUpdate(onUpdate, editor);

    const firstSurfaceId = readSurfaceIds(editor)[0];
    if (!firstSurfaceId) throw new Error("Expected a Surface to duplicate.");
    act(() => {
      expect(
        editor
          .chain()
          .focus()
          .applyCourseStructureCommand({
            type: "surface.duplicate",
            surfaceId: firstSurfaceId,
          })
          .scrollIntoView()
          .run(),
      ).toBe(true);
    });
    await waitFor(() => expect(readSurfaceIds(editor)).toHaveLength(7));
    expect(new Set(readSurfaceIds(editor)).size).toBe(7);
    await expectOnePersistedUpdate(onUpdate, editor);

    const beforeSingletonDelete = structuredClone(editor.getJSON());
    act(() => {
      expect(
        editor
          .chain()
          .focus()
          .applyCourseStructureCommand({
            type: "surface.delete",
            surfaceId: THIRD_SURFACE_ID,
          })
          .scrollIntoView()
          .run(),
      ).toBe(true);
    });
    await waitFor(() => expect(readSurfaceIds(editor)).not.toContain(THIRD_SURFACE_ID));
    const afterSingletonDelete = structuredClone(editor.getJSON());
    expect(readSectionTitles(editor)).toEqual(["Shared", "Shared"]);
    expect(selectionIsInsideSurface(editor)).toBe(true);
    await expectOnePersistedUpdate(onUpdate, editor);

    act(() => expect(editor.commands.undo()).toBe(true));
    await waitForJson(editor, beforeSingletonDelete);
    await expectOnePersistedUpdate(onUpdate, editor);
    act(() => expect(editor.commands.redo()).toBe(true));
    await waitForJson(editor, afterSingletonDelete);
    expect(selectionIsInsideSurface(editor)).toBe(true);
    await expectOnePersistedUpdate(onUpdate, editor);

    const finalJson = editor.getJSON();
    expect(onUpdate.mock.calls).toHaveLength(0);
    expect(
      directCourseChildren(finalJson).every(
        (child) => child.type !== "courseSection" || !child.content,
      ),
    ).toBe(true);
    expect(JSON.stringify(finalJson)).not.toContain("authoring-slide-divider");
    expect(JSON.stringify(finalJson)).not.toContain("Start Course Section");
  });
});

async function expectOnePersistedUpdate(
  onUpdate: ReturnType<typeof vi.fn<(json: JSONContent) => void>>,
  editor: Editor,
): Promise<void> {
  await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
  expect(onUpdate.mock.lastCall?.[0]).toEqual(editor.getJSON());
  onUpdate.mockClear();
}

async function waitForJson(editor: Editor, expected: JSONContent): Promise<void> {
  await waitFor(() => expect(editor.getJSON()).toEqual(expected));
}

function slideshowDocument(surfaceIds: readonly EmbeddedNodeId[]): JSONContent {
  return addMissingNodeIds({
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: {
          id: createEmbeddedNodeId(),
          schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
          mode: "slideshow",
          surfaceSize: "16x9",
          overflowMode: "clip",
          theme: createDefaultPersistedCourseTheme(),
        },
        content: surfaceIds.map((surfaceId) =>
          slideCoverSurfaceDefinition.createSurface({ surfaceId }),
        ),
      },
    ],
  });
}

function addMissingNodeIds(node: JSONContent): JSONContent {
  if (node.type === "text") return node;
  return {
    ...node,
    attrs: {
      ...node.attrs,
      id: node.attrs?.["id"] ?? createEmbeddedNodeId(),
    },
    ...(node.content ? { content: node.content.map(addMissingNodeIds) } : {}),
  };
}

function directCourseChildren(json: JSONContent): JSONContent[] {
  return json.content?.[0]?.content ?? [];
}

function readSectionTitles(editor: Editor): unknown[] {
  return directCourseChildren(editor.getJSON())
    .filter((child) => child.type === "courseSection")
    .map((child) => child.attrs?.["title"]);
}

function readSurfaceIds(editor: Editor): EmbeddedNodeId[] {
  return directCourseChildren(editor.getJSON())
    .filter((child) => child.type === "surface")
    .flatMap((child) => {
      const id = child.attrs?.["id"];
      return typeof id === "string" ? [id as EmbeddedNodeId] : [];
    });
}

function allNodeIds(json: JSONContent): Set<string> {
  return new Set(allNodeIdsArray(json));
}

function allNodeIdsArray(json: JSONContent): string[] {
  const ids: string[] = [];
  const visit = (node: JSONContent) => {
    const id = node.attrs?.["id"];
    if (typeof id === "string") ids.push(id);
    node.content?.forEach(visit);
  };
  visit(json);
  return ids;
}

function selectionIsInsideSurface(editor: Editor): boolean {
  let inside = false;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "surface") return true;
    if (editor.state.selection.from > pos && editor.state.selection.from < pos + node.nodeSize) {
      inside = true;
      return false;
    }
    return true;
  });
  return inside;
}
