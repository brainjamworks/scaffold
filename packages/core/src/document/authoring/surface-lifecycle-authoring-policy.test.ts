// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
import { ARRANGEMENT_CONTENT } from "@/document/model/content-model/content-groups";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SlideCoverSubtitleNode } from "@/editor/surfaces/model/nodes/slide-cover-subtitle";
import { SlideTitleNode } from "@/editor/surfaces/model/nodes/slide-title";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";

import { createSurfaceLifecycleAuthoringPolicy } from "./surface-lifecycle-authoring-policy";

const editors: Editor[] = [];
const TestArrangementNode = Node.create({
  name: "testArrangement",
  group: ARRANGEMENT_CONTENT,
  content: "paragraph*",
});

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("surface lifecycle authoring policy", () => {
  it("rejects a local transaction that clears a surface variant", () => {
    const editor = makeEditor(pageDocument());
    const surfacePosition = firstSurfacePosition(editor);
    const surface = editor.state.doc.nodeAt(surfacePosition)!;

    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(surfacePosition, undefined, {
        ...surface.attrs,
        variant: null,
      }),
    );

    expect(firstSurfaceAttrs(editor)).toMatchObject({
      id: "surface-page",
      variant: "page-default",
    });
  });

  it("rejects duplicate surface instance ids", () => {
    const editor = makeEditor(slideshowDocument());
    const surfacePositions = allSurfacePositions(editor);

    editor.view.dispatch(editor.state.tr.setNodeAttribute(surfacePositions[1]!, "id", "slide-one"));

    expect(allSurfaceIds(editor)).toEqual(["slide-one", "slide-two"]);
  });

  it("rejects relabelling an existing surface to a compatible registered variant", () => {
    const editor = makeEditor(compatibleSlideshowDocument());
    const surfacePosition = firstSurfacePosition(editor);
    const surface = editor.state.doc.nodeAt(surfacePosition)!;

    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(surfacePosition, undefined, {
        ...surface.attrs,
        variant: "slide-image-content-stacked",
      }),
    );

    expect(firstSurfaceAttrs(editor)).toMatchObject({
      id: "slide-compatible",
      variant: "slide-image-content-split",
    });
  });

  it("allows a genuinely new valid surface instance", () => {
    const editor = makeEditor(slideshowDocument());
    const definition = builtInSurfaceVariantRegistry.get("slide-cover")!;
    const inserted = editor.schema.nodeFromJSON(
      definition.createSurface({ surfaceId: "slide-three" }),
    );

    editor.view.dispatch(editor.state.tr.insert(editor.state.doc.content.size - 1, inserted));

    expect(allSurfaceIds(editor)).toEqual(["slide-one", "slide-two", "slide-three"]);
  });

  it("rejects invalid settings and fixed surface structure", () => {
    const settingsEditor = makeEditor(slideshowDocument());
    const settingsPosition = firstSurfacePosition(settingsEditor);
    settingsEditor.view.dispatch(
      settingsEditor.state.tr.setNodeAttribute(settingsPosition, "settings", {
        header: { enabled: "invalid" },
      }),
    );
    expect(firstSurfaceAttrs(settingsEditor)["settings"]).toMatchObject({
      header: { enabled: false },
    });

    const structureEditor = makeEditor(slideshowDocument());
    const headingPosition = firstNodePosition(structureEditor, "heading");
    structureEditor.view.dispatch(
      structureEditor.state.tr.delete(
        headingPosition,
        headingPosition + structureEditor.state.doc.nodeAt(headingPosition)!.nodeSize,
      ),
    );
    expect(firstSurfaceContentTypes(structureEditor)).toEqual(["heading", "slide_cover_subtitle"]);
  });

  it("allows ordinary valid document edits", () => {
    const editor = makeEditor(pageDocument());
    const before = editor.state.doc.textContent;

    expect(editor.commands.insertContentAt(3, "Valid local edit")).toBe(true);

    expect(editor.state.doc.textContent).not.toBe(before);
    expect(editor.state.doc.textContent).toContain("Valid local edit");
  });

  it("allows the first valid content transaction from an internal empty editor document", () => {
    const editor = makeEditor();

    expect(editor.commands.setContent(pageDocument(), { emitUpdate: false })).toBe(true);

    expect(firstSurfaceAttrs(editor)).toMatchObject({
      id: "surface-page",
      variant: "page-default",
    });
  });
});

function makeEditor(content?: JSONContent): Editor {
  const editor = new Editor({
    extensions: [
      DocumentNode,
      StarterKit.configure({ document: false, paragraph: false, undoRedo: false }),
      ExtendedParagraph,
      CourseDocumentNode,
      SurfaceNode,
      RegionNode,
      SlideCoverSubtitleNode,
      SlideTitleNode,
      TestArrangementNode,
      createSurfaceLifecycleAuthoringPolicy({ registry: builtInSurfaceVariantRegistry }),
    ],
    ...(content === undefined ? {} : { content }),
  });
  editors.push(editor);
  return editor;
}

function pageDocument(): JSONContent {
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
          builtInSurfaceVariantRegistry.get("page-default")!.createSurface({
            surfaceId: "surface-page",
          }),
        ],
      },
    ],
  };
}

function slideshowDocument(): JSONContent {
  const definition = builtInSurfaceVariantRegistry.get("slide-cover")!;
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
        content: [
          definition.createSurface({ surfaceId: "slide-one" }),
          definition.createSurface({ surfaceId: "slide-two" }),
        ],
      },
    ],
  };
}

function compatibleSlideshowDocument(): JSONContent {
  const definition = builtInSurfaceVariantRegistry.get("slide-image-content-split")!;
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

function firstSurfacePosition(editor: Editor): number {
  return allSurfacePositions(editor)[0]!;
}

function allSurfacePositions(editor: Editor): number[] {
  const positions: number[] = [];
  editor.state.doc.descendants((node, position) => {
    if (node.type.name === "surface") positions.push(position);
  });
  return positions;
}

function firstNodePosition(editor: Editor, nodeType: string): number {
  let found: number | null = null;
  editor.state.doc.descendants((node, position) => {
    if (node.type.name !== nodeType) return true;
    found = position;
    return false;
  });
  if (found === null) throw new Error(`missing ${nodeType} node`);
  return found;
}

function firstSurfaceAttrs(editor: Editor): Readonly<Record<string, unknown>> {
  const surface = editor.state.doc.nodeAt(firstSurfacePosition(editor));
  if (!surface) throw new Error("missing surface node");
  return surface.attrs;
}

function allSurfaceIds(editor: Editor): unknown[] {
  return allSurfacePositions(editor).map(
    (position) => editor.state.doc.nodeAt(position)?.attrs["id"],
  );
}

function firstSurfaceContentTypes(editor: Editor): string[] {
  const surface = editor.state.doc.nodeAt(firstSurfacePosition(editor));
  if (!surface) throw new Error("missing surface node");
  const types: string[] = [];
  surface.forEach((child) => types.push(child.type.name));
  return types;
}
