// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";

import { createCourseSectionAuthoringNode } from "./course-section-authoring-node";

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
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: { mode: "slideshow", surfaceSize: "16x9", overflowMode: "clip" },
          content: children,
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
