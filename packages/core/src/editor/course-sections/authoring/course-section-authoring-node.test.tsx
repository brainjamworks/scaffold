// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { createCourseStructureCommandsExtension } from "@/document/authoring/course-structure-commands";
import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";

import { createCourseSectionAuthoringNode } from "./course-section-authoring-node";

const editors: Editor[] = [];
const SECTION_1 = "section00001";
const SECTION_2 = "section00002";
const SURFACE_1 = "surface00001";
const SURFACE_2 = "surface00002";
const REPLACEMENT_SECTION_ID = "section99999";

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

describe("Course Section authoring node", () => {
  it("renders authored text as an accessible Course Section boundary", async () => {
    const editor = createEditor([
      courseSection("section00001", "Introduction"),
      surface("surface00001", "First slide"),
    ]);

    render(<EditorContent editor={editor} />);

    const boundary = await screen.findByRole("group", {
      name: "Course Section: Introduction",
    });
    expect(within(boundary).getByText("Course Section")).toBeInTheDocument();
    expect(within(boundary).getByRole("heading", { name: "Introduction" })).toBeInTheDocument();
    expect(boundary).toHaveAttribute("contenteditable", "false");
    expect(boundary.querySelector("[contenteditable='true']")).toBeNull();
  });

  it("renders repeated authored titles as separate safe boundaries", async () => {
    const editor = createEditor([
      courseSection("section00001", "Practice"),
      surface("surface00001", "First slide"),
      courseSection("section00002", "Practice"),
      surface("surface00002", "Second slide"),
    ]);

    render(<EditorContent editor={editor} />);

    await waitFor(() => {
      expect(screen.getAllByRole("group", { name: "Course Section: Practice" })).toHaveLength(2);
      expect(screen.getAllByRole("heading", { name: "Practice" })).toHaveLength(2);
    });
  });

  it("projects ProseMirror node selection without becoming editable content", async () => {
    const editor = createEditor([
      courseSection("section00001", "Selected boundary"),
      surface("surface00001", "First slide"),
    ]);
    editor.commands.setTextSelection(findNodePosition(editor, "surface", "surface00001") + 2);
    render(<EditorContent editor={editor} />);
    const boundary = await screen.findByRole("group", {
      name: "Course Section: Selected boundary",
    });

    expect(boundary).not.toHaveAttribute("data-selected");
    editor.commands.setNodeSelection(findNodePosition(editor, "courseSection", "section00001"));

    await waitFor(() => expect(boundary).toHaveAttribute("data-selected", "true"));
    expect(boundary.querySelector("[contenteditable='true']")).toBeNull();
  });

  it("renames through one stable-ID command and preserves the boundary identity", async () => {
    const editor = createEditor([
      courseSection(SECTION_1, "Introduction"),
      surface(SURFACE_1, "First slide"),
    ]);
    const user = userEvent.setup();
    let documentTransactions = 0;
    editor.on("transaction", ({ transaction }) => {
      if (transaction.docChanged) documentTransactions += 1;
    });
    render(<EditorContent editor={editor} />);

    const boundary = await screen.findByRole("group", {
      name: "Course Section: Introduction",
    });
    await user.click(within(boundary).getByRole("button", { name: "Rename Course Section" }));
    const dialog = await screen.findByRole("dialog", { name: "Rename Course Section" });
    const input = within(dialog).getByLabelText("Course Section title");
    await user.clear(input);
    await user.type(input, "Overview");
    await user.click(within(dialog).getByRole("button", { name: "Rename Course Section" }));

    await screen.findByRole("group", { name: "Course Section: Overview" });
    expect(readCourseChildren(editor)[0]).toMatchObject({
      attrs: { id: SECTION_1, title: "Overview" },
      type: "courseSection",
    });
    expect(documentTransactions).toBe(1);
  });

  it("allows a repeated authored title without changing either boundary identity", async () => {
    const editor = createEditor([
      courseSection(SECTION_1, "Introduction"),
      surface(SURFACE_1, "First slide"),
      courseSection(SECTION_2, "Practice"),
      surface(SURFACE_2, "Second slide"),
    ]);
    const user = userEvent.setup();
    render(<EditorContent editor={editor} />);

    const firstBoundary = await screen.findByRole("group", {
      name: "Course Section: Introduction",
    });
    await user.click(within(firstBoundary).getByRole("button", { name: "Rename Course Section" }));
    const dialog = await screen.findByRole("dialog", { name: "Rename Course Section" });
    const input = within(dialog).getByLabelText("Course Section title");
    await user.clear(input);
    await user.type(input, "Practice");
    await user.click(within(dialog).getByRole("button", { name: "Rename Course Section" }));

    await waitFor(() => {
      expect(screen.getAllByRole("group", { name: "Course Section: Practice" })).toHaveLength(2);
    });
    expect(readSectionIds(editor)).toEqual([SECTION_1, SECTION_2]);
  });

  it.each([
    {
      expectedFeedback: "Enter a Course Section title",
      input: "   ",
      label: "invalid title",
    },
    {
      expectedFeedback: "Enter a different Course Section title",
      input: "Introduction",
      label: "unchanged title",
    },
  ])("keeps an $label local without mutating content", async ({ expectedFeedback, input }) => {
    const editor = createEditor([
      courseSection(SECTION_1, "Introduction"),
      surface(SURFACE_1, "First slide"),
    ]);
    const before = editor.getJSON();
    const user = userEvent.setup();
    render(<EditorContent editor={editor} />);

    const boundary = await screen.findByRole("group", {
      name: "Course Section: Introduction",
    });
    await user.click(within(boundary).getByRole("button", { name: "Rename Course Section" }));
    const dialog = await screen.findByRole("dialog", { name: "Rename Course Section" });
    const titleInput = within(dialog).getByLabelText("Course Section title");
    await user.clear(titleInput);
    await user.type(titleInput, input);
    await user.click(within(dialog).getByRole("button", { name: "Rename Course Section" }));

    expect(within(dialog).getByRole("alert")).toHaveTextContent(expectedFeedback);
    expect(editor.getJSON()).toEqual(before);
  });

  it("reports a stale stable ID locally without applying a second document change", async () => {
    const editor = createEditor([
      courseSection(SECTION_1, "Introduction"),
      surface(SURFACE_1, "First slide"),
    ]);
    const user = userEvent.setup();
    render(<EditorContent editor={editor} />);

    const boundary = await screen.findByRole("group", {
      name: "Course Section: Introduction",
    });
    await user.click(within(boundary).getByRole("button", { name: "Rename Course Section" }));
    const dialog = await screen.findByRole("dialog", { name: "Rename Course Section" });
    const sectionPos = findNodePosition(editor, "courseSection", SECTION_1);
    act(() => {
      const section = editor.state.doc.nodeAt(sectionPos);
      if (!section) throw new Error("Expected the requested Course Section.");
      editor.view.dispatch(
        editor.state.tr.setNodeMarkup(sectionPos, undefined, {
          ...section.attrs,
          id: REPLACEMENT_SECTION_ID,
        }),
      );
    });
    const afterExternalChange = editor.getJSON();
    const input = within(dialog).getByLabelText("Course Section title");
    await user.clear(input);
    await user.type(input, "Overview");
    await user.click(within(dialog).getByRole("button", { name: "Rename Course Section" }));

    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "This Course Section could not be renamed",
    );
    expect(editor.getJSON()).toEqual(afterExternalChange);
  });

  it.each([
    {
      children: [
        courseSection(SECTION_1, "Only"),
        surface(SURFACE_1, "First slide"),
        surface(SURFACE_2, "Second slide"),
      ],
      expectedSectionIds: [],
      label: "sole boundary",
      removeTitle: "Only",
      selectedSurfaceId: SURFACE_1,
    },
    {
      children: [
        courseSection(SECTION_1, "First"),
        surface(SURFACE_1, "First slide"),
        courseSection(SECTION_2, "Second"),
        surface(SURFACE_2, "Second slide"),
      ],
      expectedSectionIds: [SECTION_2],
      label: "first boundary",
      removeTitle: "First",
      selectedSurfaceId: SURFACE_1,
    },
    {
      children: [
        courseSection(SECTION_1, "First"),
        surface(SURFACE_1, "First slide"),
        courseSection(SECTION_2, "Second"),
        surface(SURFACE_2, "Second slide"),
      ],
      expectedSectionIds: [SECTION_1],
      label: "non-first boundary",
      removeTitle: "Second",
      selectedSurfaceId: SURFACE_2,
    },
  ])(
    "removes a $label through one command while preserving every Surface",
    async ({ children, expectedSectionIds, removeTitle, selectedSurfaceId }) => {
      const editor = createEditor(children);
      const user = userEvent.setup();
      let documentTransactions = 0;
      editor.on("transaction", ({ transaction }) => {
        if (transaction.docChanged) documentTransactions += 1;
      });
      render(<EditorContent editor={editor} />);

      const boundary = await screen.findByRole("group", {
        name: "Course Section: " + removeTitle,
      });
      await user.click(within(boundary).getByRole("button", { name: "Remove Course Section" }));

      await waitFor(() => expect(readSectionIds(editor)).toEqual(expectedSectionIds));
      expect(readSurfaceIds(editor)).toEqual([SURFACE_1, SURFACE_2]);
      expect(readSurfaceText(editor)).toEqual(["First slide", "Second slide"]);
      expect(selectionIsInsideSurface(editor, selectedSurfaceId)).toBe(true);
      expect(documentTransactions).toBe(1);
    },
  );
});

function createEditor(children: readonly JSONContent[]): Editor {
  const editor = new Editor({
    extensions: [
      DocumentNode,
      StarterKit.configure({ document: false, paragraph: false, undoRedo: false }),
      ExtendedParagraph,
      CourseDocumentNode,
      createCourseSectionAuthoringNode(),
      SurfaceNode,
      TestArrangementNode,
      TestRegionNode,
      UniqueID.configure({ attributeName: "id", types: "all", updateDocument: false }),
      createCourseStructureCommandsExtension(),
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: { mode: "slideshow", surfaceSize: "16x9", overflowMode: "clip" },
          content: [...children],
        },
      ],
    },
  });
  editors.push(editor);
  return editor;
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

function findNodePosition(editor: Editor, type: string, id: string): number {
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== type || node.attrs["id"] !== id) return true;
    found = pos;
    return false;
  });
  if (found === null) throw new Error(`Expected ${type} "${id}".`);
  return found;
}

function readCourseChildren(editor: Editor): JSONContent[] {
  return editor.getJSON().content?.[0]?.content ?? [];
}

function readSectionIds(editor: Editor): unknown[] {
  return readCourseChildren(editor)
    .filter((child) => child.type === "courseSection")
    .map((child) => child.attrs?.["id"]);
}

function readSurfaceIds(editor: Editor): unknown[] {
  return readCourseChildren(editor)
    .filter((child) => child.type === "surface")
    .map((child) => child.attrs?.["id"]);
}

function readSurfaceText(editor: Editor): string[] {
  return readCourseChildren(editor)
    .filter((child) => child.type === "surface")
    .map((child) => child.content?.[0]?.content?.[0]?.text ?? "");
}

function selectionIsInsideSurface(editor: Editor, surfaceId: string): boolean {
  const surfacePos = findNodePosition(editor, "surface", surfaceId);
  const surface = editor.state.doc.nodeAt(surfacePos);
  if (!surface) return false;
  return (
    editor.state.selection.from > surfacePos &&
    editor.state.selection.from < surfacePos + surface.nodeSize
  );
}
