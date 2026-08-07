// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { createCourseStructureCommandsExtension } from "@/document/authoring/course-structure-commands";
import { CourseDocumentNode, DocumentNode, createCourseSectionNode } from "@/document/model/nodes";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import {
  AuthoringSlideDividers,
  openCourseSectionStartDialog,
} from "@/editor/surfaces/authoring/AuthoringSlideDividers";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";

import { CourseSectionStartDialog } from "./CourseSectionStartDialog";

const FIRST_SURFACE_ID = createEmbeddedNodeId();
const SECOND_SURFACE_ID = createEmbeddedNodeId();
const FIRST_SECTION_ID = createEmbeddedNodeId();
const editors: Editor[] = [];

const TestArrangementNode = Node.create({
  name: "testArrangement",
  group: "arrangement",
  content: "paragraph*",
});

const TestRegionNode = Node.create({
  name: "testRegion",
  group: "region",
  content: "paragraph*",
});

afterEach(() => {
  cleanup();
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("CourseSectionStartDialog", () => {
  it("starts the first Course Section with one authored title", async () => {
    const editor = createEditor([
      surface(FIRST_SURFACE_ID, "First slide"),
      surface(SECOND_SURFACE_ID, "Second slide"),
    ]);
    const user = userEvent.setup();
    renderDialog(editor);

    openDialog(editor, FIRST_SURFACE_ID);
    const dialog = await screen.findByRole("dialog", { name: "Start Course Section" });
    expect(within(dialog).queryByLabelText("Leading Course Section title")).toBeNull();
    await user.type(within(dialog).getByLabelText("Course Section title"), "Introduction");
    await user.click(within(dialog).getByRole("button", { name: "Start Course Section" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(readCourseChildren(editor)).toMatchObject([
      { type: "courseSection", attrs: { title: "Introduction" } },
      { type: "surface", attrs: { id: FIRST_SURFACE_ID } },
      { type: "surface", attrs: { id: SECOND_SURFACE_ID } },
    ]);
  });

  it("requires authored leading and selected titles when enabling away from slide one", async () => {
    const editor = createEditor([
      surface(FIRST_SURFACE_ID, "First slide"),
      surface(SECOND_SURFACE_ID, "Second slide"),
    ]);
    const user = userEvent.setup();
    renderDialog(editor);

    openDialog(editor, SECOND_SURFACE_ID);
    const dialog = await screen.findByRole("dialog", { name: "Start Course Section" });
    await user.type(within(dialog).getByLabelText("Leading Course Section title"), "Orientation");
    await user.type(within(dialog).getByLabelText("Course Section title"), "Practice");
    await user.click(within(dialog).getByRole("button", { name: "Start Course Section" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      readCourseChildren(editor)
        .filter((child) => child.type === "courseSection")
        .map((child) => child.attrs?.["title"]),
    ).toEqual(["Orientation", "Practice"]);
    expect(readSurfaceIds(editor)).toEqual([FIRST_SURFACE_ID, SECOND_SURFACE_ID]);
  });

  it("splits an existing Course Section without asking for a leading title", async () => {
    const editor = createEditor([
      courseSection(FIRST_SECTION_ID, "Course"),
      surface(FIRST_SURFACE_ID, "First slide"),
      surface(SECOND_SURFACE_ID, "Second slide"),
    ]);
    const user = userEvent.setup();
    renderDialog(editor);

    openDialog(editor, SECOND_SURFACE_ID);
    const dialog = await screen.findByRole("dialog", { name: "Start Course Section" });
    expect(within(dialog).queryByLabelText("Leading Course Section title")).toBeNull();
    await user.type(within(dialog).getByLabelText("Course Section title"), "Practice");
    await user.click(within(dialog).getByRole("button", { name: "Start Course Section" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      readCourseChildren(editor)
        .filter((child) => child.type === "courseSection")
        .map((child) => child.attrs?.["title"]),
    ).toEqual(["Course", "Practice"]);
    expect(readSurfaceIds(editor)).toEqual([FIRST_SURFACE_ID, SECOND_SURFACE_ID]);
  });

  it("keeps invalid authored titles local and leaves the document unchanged", async () => {
    const editor = createEditor([surface(FIRST_SURFACE_ID, "First slide")]);
    const before = editor.getJSON();
    const user = userEvent.setup();
    renderDialog(editor);

    openDialog(editor, FIRST_SURFACE_ID);
    const dialog = await screen.findByRole("dialog", { name: "Start Course Section" });
    await user.type(within(dialog).getByLabelText("Course Section title"), "   ");
    await user.click(within(dialog).getByRole("button", { name: "Start Course Section" }));

    expect(within(dialog).getByRole("alert")).toHaveTextContent("Enter a Course Section title");
    expect(editor.getJSON()).toEqual(before);
  });

  it.each([
    { label: "stale Surface", atSurfaceId: createEmbeddedNodeId(), sectioned: false },
    { label: "existing boundary", atSurfaceId: FIRST_SURFACE_ID, sectioned: true },
  ])("refuses a $label request without dispatching", async ({ atSurfaceId, sectioned }) => {
    const editor = createEditor([
      ...(sectioned ? [courseSection(FIRST_SECTION_ID, "Existing")] : []),
      surface(FIRST_SURFACE_ID, "First slide"),
    ]);
    const before = editor.getJSON();
    renderDialog(editor);

    openDialog(editor, atSurfaceId);
    const dialog = await screen.findByRole("dialog", { name: "Start Course Section" });
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "This Course Section location is no longer available",
    );
    expect(within(dialog).getByRole("button", { name: "Start Course Section" })).toBeDisabled();
    expect(editor.getJSON()).toEqual(before);
  });

  it("cancels without changing content and returns focus to the editor", async () => {
    const editor = createEditor([surface(FIRST_SURFACE_ID, "First slide")]);
    const before = editor.getJSON();
    const user = userEvent.setup();
    renderDialog(editor);

    openDialog(editor, FIRST_SURFACE_ID);
    const dialog = await screen.findByRole("dialog", { name: "Start Course Section" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(editor.getJSON()).toEqual(before);
    await waitFor(() => expect(editor.view.hasFocus()).toBe(true));
  });
});

function createEditor(children: readonly JSONContent[]): Editor {
  const editor = new Editor({
    extensions: [
      DocumentNode,
      StarterKit.configure({ document: false, paragraph: false, undoRedo: false }),
      ExtendedParagraph,
      CourseDocumentNode,
      createCourseSectionNode(),
      SurfaceNode,
      TestArrangementNode,
      TestRegionNode,
      UniqueID.configure({ attributeName: "id", types: "all", updateDocument: false }),
      createCourseStructureCommandsExtension(),
      AuthoringSlideDividers,
    ],
    content: slideshowDocument(children),
  });
  editors.push(editor);
  return editor;
}

function renderDialog(editor: Editor) {
  return render(
    <>
      <EditorContent editor={editor} />
      <CourseSectionStartDialog editor={editor} />
    </>,
  );
}

function openDialog(editor: Editor, atSurfaceId: string): void {
  act(() => openCourseSectionStartDialog(editor.view, atSurfaceId));
}

function slideshowDocument(children: readonly JSONContent[]): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { mode: "slideshow", surfaceSize: "16x9", overflowMode: "clip" },
        content: [...children],
      },
    ],
  };
}

function courseSection(id: string, title: string): JSONContent {
  return { type: "courseSection", attrs: { id, title } };
}

function surface(id: string, text: string): JSONContent {
  return {
    type: "surface",
    attrs: { id, variant: "slide-cover", settings: {} },
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

function readCourseChildren(editor: Editor): JSONContent[] {
  return editor.getJSON().content?.[0]?.content ?? [];
}

function readSurfaceIds(editor: Editor): unknown[] {
  return readCourseChildren(editor)
    .filter((child) => child.type === "surface")
    .map((child) => child.attrs?.["id"]);
}
