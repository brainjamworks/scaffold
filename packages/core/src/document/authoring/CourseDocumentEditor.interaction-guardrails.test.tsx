// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { Editor, type JSONContent } from "@tiptap/core";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";

import { CourseDocumentEditor } from "./CourseDocumentEditor";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CourseDocumentEditor interaction guardrails", () => {
  it("does not mount invalid initial portable surface state", async () => {
    const content = pageDocument({ id: "surface-page", variant: "mystery-surface" });
    const onReady = vi.fn();

    render(
      createElement(CourseDocumentEditor, {
        source: { mode: "document", content },
        onReady,
      }),
    );

    expect(await screen.findByText(/cannot be edited/)).toBeInTheDocument();
    expect(screen.queryByTestId("course-document-editor")).toBeNull();
    expect(onReady).not.toHaveBeenCalled();
  });

  it("preserves the page surface variant through text click, typing, and Backspace", async () => {
    const content = pageDocument({ id: "surface-page", variant: "page-default" });
    const editor = await mountEditor(content);

    clickSurfaceText(editor);
    typeAndBackspace(editor);

    expect(surfaceAttrsAt(editor, 0)).toMatchObject({
      id: "surface-page",
      variant: "page-default",
    });
    expect(surfaceCount(editor)).toBe(1);
  });

  it("preserves slideshow surface variants through text click, typing, and Backspace", async () => {
    const content = slideshowDocument([
      { id: "slide-a", variant: "slide-cover" },
      { id: "slide-b", variant: "slide-cover" },
    ]);
    const editor = await mountEditor(content);

    clickSurfaceText(editor);
    typeAndBackspace(editor);

    expect(surfaceAttrsAt(editor, 0)).toMatchObject({
      id: "slide-a",
      variant: "slide-cover",
    });
    expect(surfaceAttrsAt(editor, 1)).toMatchObject({
      id: "slide-b",
      variant: "slide-cover",
    });
    expect(surfaceCount(editor)).toBe(2);
  });

  it("keeps Backspace at the surface text start from destroying the surface", async () => {
    const content = pageDocument({ id: "surface-page", variant: "page-default" });
    const editor = await mountEditor(content);

    clickSurfaceText(editor);
    editor.commands.setTextSelection(firstParagraphRange(editor).from);
    editor.commands.keyboardShortcut("Backspace");
    editor.commands.keyboardShortcut("Backspace");

    expect(surfaceAttrsAt(editor, 0)).toMatchObject({
      id: "surface-page",
      variant: "page-default",
    });
    expect(surfaceCount(editor)).toBe(1);
  });
});
async function mountEditor(content: JSONContent): Promise<Editor> {
  const onReady = vi.fn();
  render(
    createElement(CourseDocumentEditor, {
      source: { mode: "document", content },
      onReady,
    }),
  );

  await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
  const editor = onReady.mock.calls[0]?.[0] as Editor;
  await waitFor(() => expect(editor.getJSON().content?.[0]?.type).toBe("courseDocument"));
  return editor;
}

function pageDocument(surfaceAttrs: Record<string, unknown>): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: {
          schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
          mode: "page",
          surfaceSize: "fluid",
          overflowMode: "grow",
        },
        content: [
          {
            type: "surface",
            attrs: surfaceAttrs,
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Authored page text" }],
              },
            ],
          },
        ],
      },
    ],
  };
}

function slideshowDocument(surfaces: Array<Record<string, unknown>>): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: {
          schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
          mode: "slideshow",
          surfaceSize: "16x9",
          overflowMode: "clip",
        },
        content: surfaces.map((attrs, index) => ({
          type: "surface",
          attrs,
          content: [
            {
              type: "heading",
              attrs: { level: 1 },
              content: [{ type: "text", text: `Slide title ${index + 1}` }],
            },
            {
              type: "slide_cover_subtitle",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: `Slide text ${index + 1}` }],
                },
              ],
            },
          ],
        })),
      },
    ],
  };
}

function clickSurfaceText(editor: Editor): void {
  const paragraph = editor.view.dom.querySelector("[data-surface] p");
  if (!paragraph) throw new Error("expected surface paragraph in editor DOM");

  const mousedown = new MouseEvent("mousedown", {
    bubbles: true,
    cancelable: true,
    button: 0,
  });
  paragraph.dispatchEvent(mousedown);
  // Text clicks are editing intent: activation must leave the event to
  // ProseMirror so the browser can focus the editor and place the caret.
  expect(mousedown.defaultPrevented).toBe(false);
  editor.commands.setTextSelection(firstParagraphRange(editor).to);
}

function typeAndBackspace(editor: Editor): void {
  editor.commands.insertContent("typed");
  editor.commands.keyboardShortcut("Backspace");
}

function firstParagraphRange(editor: Editor): { from: number; to: number } {
  let range: { from: number; to: number } | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (range || node.type.name !== "paragraph") return !range;
    range = { from: pos + 1, to: pos + node.nodeSize - 1 };
    return false;
  });

  if (!range) throw new Error("expected a paragraph node");
  return range;
}

function surfaceAttrsAt(editor: Editor, index: number): Record<string, unknown> {
  const courseDocument = editor.getJSON().content?.[0] as JSONContent | undefined;
  const surface = courseDocument?.content?.[index] as JSONContent | undefined;
  if (!surface) throw new Error(`expected surface at index ${index}`);
  return surface.attrs ?? {};
}

function surfaceCount(editor: Editor): number {
  return (editor.getJSON().content?.[0]?.content ?? []).filter(
    (child: JSONContent) => child.type === "surface",
  ).length;
}
