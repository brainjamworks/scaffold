// @vitest-environment happy-dom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import Collaboration from "@tiptap/extension-collaboration";
import { Editor, getSchema, type JSONContent } from "@tiptap/core";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProsemirrorJSON } from "y-prosemirror";
import * as Y from "yjs";

import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";

import { COURSE_DOCUMENT_FRAGMENT } from "@/document/model/constants";
import { CourseDocumentEditor } from "./CourseDocumentEditor";
import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CourseDocumentEditor interaction guardrails", () => {
  it("does not mount invalid initial authoritative surface state", async () => {
    const document = createSeededYDoc(
      pageDocument({ id: "surface-page", variant: "mystery-surface" }),
    );
    const onReady = vi.fn();

    render(createElement(CourseDocumentEditor, { document, onReady }));

    expect(await screen.findByText(/cannot be edited/)).toBeInTheDocument();
    expect(screen.queryByTestId("course-document-editor")).toBeNull();
    expect(onReady).not.toHaveBeenCalled();
    expect(authoritativeSurfaceAttrs(document, 0)).toMatchObject({
      id: "surface-page",
      variant: "mystery-surface",
    });
  });

  it("keeps remote invalid state authoritative without emitting an editor update", async () => {
    const document = createSeededYDoc(
      pageDocument({ id: "surface-page", variant: "page-default" }),
    );
    const onReady = vi.fn();
    const onUpdate = vi.fn();
    render(createElement(CourseDocumentEditor, { document, onReady, onUpdate }));
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const editor = onReady.mock.calls[0]?.[0] as Editor;
    onUpdate.mockClear();

    act(() => {
      applyAuthoritativePeerContent(
        document,
        pageDocument({ id: "surface-page", variant: "mystery-surface" }),
      );
    });

    expect(await screen.findByText(/cannot be edited/)).toBeInTheDocument();
    await waitFor(() => expect(editor.isDestroyed).toBe(true));
    expect(onUpdate).not.toHaveBeenCalled();
    expect(authoritativeSurfaceAttrs(document, 0)).toMatchObject({
      id: "surface-page",
      variant: "mystery-surface",
    });
  });

  it("remounts only after a later valid authoritative update", async () => {
    const document = createSeededYDoc(
      pageDocument({ id: "surface-page", variant: "page-default" }),
    );
    const onReady = vi.fn();
    render(createElement(CourseDocumentEditor, { document, onReady }));
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    act(() => {
      applyAuthoritativePeerContent(
        document,
        pageDocument({ id: "surface-page", variant: "mystery-surface" }),
      );
    });
    expect(await screen.findByText(/cannot be edited/)).toBeInTheDocument();

    act(() => {
      applyAuthoritativePeerContent(
        document,
        pageDocument({ id: "surface-page", variant: "page-default" }),
      );
    });

    await waitFor(() => {
      expect(onReady).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId("course-document-editor")).toBeInTheDocument();
    });
    const remountedEditor = onReady.mock.calls[1]?.[0] as Editor;
    expect(surfaceAttrsAt(remountedEditor, 0)).toMatchObject({
      id: "surface-page",
      variant: "page-default",
    });
    expect(screen.queryByText(/cannot be edited/)).toBeNull();
  });

  it("surfaces a remote compatible variant relabel and recovers from the last accepted variant", async () => {
    const document = createSeededYDoc(compatibleSlideshowDocument("slide-image-content-split"));
    const onReady = vi.fn();
    const onUpdate = vi.fn();
    render(createElement(CourseDocumentEditor, { document, onReady, onUpdate }));
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const editor = onReady.mock.calls[0]?.[0] as Editor;
    onUpdate.mockClear();

    act(() => {
      applyAuthoritativePeerSurfaceVariant(document, "slide-image-content-stacked");
    });

    expect(await screen.findByText(/cannot be edited/)).toBeInTheDocument();
    expect(editor.isDestroyed).toBe(true);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(authoritativeSurfaceAttrs(document, 0)).toMatchObject({
      id: "slide-compatible",
      variant: "slide-image-content-stacked",
    });

    act(() => {
      applyAuthoritativePeerSurfaceVariant(document, "slide-image-content-split");
    });

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(2));
    const recoveredEditor = onReady.mock.calls[1]?.[0] as Editor;
    expect(surfaceAttrsAt(recoveredEditor, 0)).toMatchObject({
      id: "slide-compatible",
      variant: "slide-image-content-split",
    });
    expect(screen.queryByText(/cannot be edited/)).toBeNull();
  });

  it("recovers from invalid to different valid Yjs content in the same React turn", async () => {
    const document = createSeededYDoc(
      pageDocument({ id: "surface-page", variant: "page-default" }),
    );
    const onReady = vi.fn();
    const onUpdate = vi.fn();
    render(createElement(CourseDocumentEditor, { document, onReady, onUpdate }));
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const staleEditor = onReady.mock.calls[0]?.[0] as Editor;
    const staleNodeView = staleEditor.view.dom;
    onUpdate.mockClear();

    act(() => {
      applyAuthoritativePeerContent(
        document,
        pageDocument({ id: "surface-page", variant: "mystery-surface" }),
      );
      applyAuthoritativePeerContent(
        document,
        pageDocument({ id: "surface-recovered", variant: "page-default" }),
      );
    });

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(2));
    const recoveredEditor = onReady.mock.calls[1]?.[0] as Editor;
    expect(staleEditor.isDestroyed).toBe(true);
    expect(staleNodeView.isConnected).toBe(false);
    expect(
      onUpdate.mock.calls.every(([content]) =>
        contentHasSurface(content as JSONContent, "surface-recovered", "page-default"),
      ),
    ).toBe(true);
    expect(authoritativeSurfaceAttrs(document, 0)).toMatchObject({
      id: "surface-recovered",
      variant: "page-default",
    });
    expect(surfaceAttrsAt(recoveredEditor, 0)).toMatchObject({
      id: "surface-recovered",
      variant: "page-default",
    });
    expect(screen.getByTestId("course-document-editor")).toBeInTheDocument();
    expect(screen.queryByText(/cannot be edited/)).toBeNull();
  });

  it("preserves the page surface variant through text click, typing, and Backspace", async () => {
    const document = createSeededYDoc(
      pageDocument({ id: "surface-page", variant: "page-default" }),
    );
    const editor = await mountEditor(document);

    clickSurfaceText(editor);
    typeAndBackspace(editor);

    expect(surfaceAttrsAt(editor, 0)).toMatchObject({
      id: "surface-page",
      variant: "page-default",
    });
    expect(surfaceCount(editor)).toBe(1);
  });

  it("preserves slideshow surface variants through text click, typing, and Backspace", async () => {
    const document = createSeededYDoc(
      slideshowDocument([
        { id: "slide-a", variant: "slide-cover" },
        { id: "slide-b", variant: "slide-cover" },
      ]),
    );
    const editor = await mountEditor(document);

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
    const document = createSeededYDoc(
      pageDocument({ id: "surface-page", variant: "page-default" }),
    );
    const editor = await mountEditor(document);

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

function createSeededYDoc(content: JSONContent): Y.Doc {
  const document = new Y.Doc();
  const seeder = new Editor({
    extensions: [
      ...createCourseDocumentAuthoringExtensions({ editable: true }).filter(
        (extension) => extension.name !== "surfaceLifecycleAuthoringPolicy",
      ),
      Collaboration.configure({
        document,
        field: COURSE_DOCUMENT_FRAGMENT,
      }),
    ],
  });
  seeder.commands.setContent(content, { emitUpdate: false });
  seeder.destroy();
  return document;
}

function applyAuthoritativePeerContent(document: Y.Doc, content: JSONContent): void {
  const peer = new Y.Doc();
  Y.applyUpdate(peer, Y.encodeStateAsUpdate(document));
  const schema = getSchema(
    createCourseDocumentAuthoringExtensions({ editable: true }).filter(
      (extension) => extension.name !== "surfaceLifecycleAuthoringPolicy",
    ),
  );
  prosemirrorJSONToYXmlFragment(schema, content, peer.getXmlFragment(COURSE_DOCUMENT_FRAGMENT));
  Y.applyUpdate(document, Y.encodeStateAsUpdate(peer, Y.encodeStateVector(document)));
}

function applyAuthoritativePeerSurfaceVariant(document: Y.Doc, variant: string): void {
  const peer = new Y.Doc();
  Y.applyUpdate(peer, Y.encodeStateAsUpdate(document));
  const fragment = peer.getXmlFragment(COURSE_DOCUMENT_FRAGMENT);
  const courseDocument = fragment.get(0);
  const surface = courseDocument instanceof Y.XmlElement ? courseDocument.get(0) : undefined;
  if (!(surface instanceof Y.XmlElement)) throw new Error("missing authoritative peer surface");
  surface.setAttribute("variant", variant);
  Y.applyUpdate(document, Y.encodeStateAsUpdate(peer, Y.encodeStateVector(document)));
}

function authoritativeSurfaceAttrs(document: Y.Doc, index: number): Record<string, unknown> {
  const json = yXmlFragmentToProsemirrorJSON(
    document.getXmlFragment(COURSE_DOCUMENT_FRAGMENT),
  ) as JSONContent;
  const surface = json.content?.[0]?.content?.[index];
  if (!surface) {
    throw new Error(
      `expected authoritative surface at index ${index}; received ${JSON.stringify(json)}`,
    );
  }
  return surface.attrs ?? {};
}

async function mountEditor(document: Y.Doc): Promise<Editor> {
  const onReady = vi.fn();
  render(createElement(CourseDocumentEditor, { document, onReady }));

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

function compatibleSlideshowDocument(
  variant: "slide-image-content-split" | "slide-image-content-stacked",
): JSONContent {
  const definition = builtInSurfaceVariantRegistry.get(variant);
  if (!definition) throw new Error(`missing ${variant} definition`);
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
        content: [definition.createSurface({ surfaceId: "slide-compatible" })],
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

function contentHasSurface(content: JSONContent, id: string, variant: string): boolean {
  const surface = content.content?.[0]?.content?.[0];
  return surface?.attrs?.["id"] === id && surface.attrs["variant"] === variant;
}
