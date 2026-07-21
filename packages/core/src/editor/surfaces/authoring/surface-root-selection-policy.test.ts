// @vitest-environment happy-dom

import { Editor, type JSONContent } from "@tiptap/core";
import { GapCursor } from "@tiptap/pm/gapcursor";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) {
    editor.destroy();
  }
});

describe("SurfaceRootSelectionPolicy", () => {
  it("redirects gap cursor selections from a surface variant with root insertion disabled", () => {
    const editor = makeEditor(
      surfaceDocument("slide-cover", [
        { type: "heading", attrs: { level: 1 } },
        {
          type: "slide_cover_subtitle",
          content: [{ type: "paragraph" }],
        },
      ]),
    );
    const gapPos = surfaceEndPos(editor);
    const $gapPos = editor.state.doc.resolve(gapPos);

    editor.view.dispatch(editor.state.tr.setSelection(new GapCursor($gapPos)));

    expect(editor.state.selection).not.toBeInstanceOf(GapCursor);
    expect(selectionAncestorNames(editor)).toContain("slide_cover_subtitle");
  });

  it("leaves gap cursor selections alone for surface variants that allow root insertion", () => {
    const editor = makeEditor(surfaceDocument("page-default", [{ type: "paragraph" }]));
    const gapPos = surfaceEndPos(editor);

    editor.view.dispatch(
      editor.state.tr.setSelection(new GapCursor(editor.state.doc.resolve(gapPos))),
    );

    expect(editor.state.selection).toBeInstanceOf(GapCursor);
    expect(editor.state.selection.$from.parent.type.name).toBe("surface");
  });
});

function makeEditor(content: JSONContent): Editor {
  const editor = new Editor({
    extensions: createCourseDocumentAuthoringExtensions({ editable: true }),
    content,
  });
  editors.push(editor);
  return editor;
}

function surfaceDocument(
  variant: "page-default" | "slide-cover",
  surfaceContent: JSONContent[],
): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { mode: variant === "slide-cover" ? "slideshow" : "page" },
        content: [
          {
            type: "surface",
            attrs: { id: `surface-${variant}`, variant },
            content: surfaceContent,
          },
        ],
      },
    ],
  };
}

function surfaceEndPos(editor: Editor): number {
  let result: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "surface") return true;
    result = pos + node.nodeSize - 1;
    return false;
  });

  if (result === null) throw new Error("expected a surface node");
  return result;
}

function selectionAncestorNames(editor: Editor): string[] {
  const { $from } = editor.state.selection;
  const names: string[] = [];
  for (let depth = 0; depth <= $from.depth; depth += 1) {
    names.push($from.node(depth).type.name);
  }
  return names;
}
