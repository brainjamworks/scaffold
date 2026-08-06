// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { CourseDocumentNode, DocumentNode, createCourseSectionNode } from "@/document/model/nodes";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { ARRANGEMENT_CONTENT } from "@/document/model/content-model/content-groups";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SlideCoverSubtitleNode } from "@/editor/surfaces/model/nodes/slide-cover-subtitle";
import { SlideTitleNode } from "@/editor/surfaces/model/nodes/slide-title";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";
import { createScaffoldDefaultTheme } from "@/theme/model";
import { createCourseStructureModule } from "@/document/model/course-structure";

import { createCourseStructureAuthoringPolicy } from "./course-structure-authoring-policy";

const editors: Editor[] = [];
const PAGE_SURFACE_ID = createEmbeddedNodeId();
const FIRST_SLIDE_ID = createEmbeddedNodeId();
const SECOND_SLIDE_ID = createEmbeddedNodeId();
const THIRD_SLIDE_ID = createEmbeddedNodeId();
const COMPATIBLE_SLIDE_ID = createEmbeddedNodeId();
const COURSE_DOCUMENT_ID = createEmbeddedNodeId();
const COURSE_SECTION_ID = createEmbeddedNodeId();
const courseStructure = createCourseStructureModule({
  blockDefinitions: builtInBlockRegistry,
  surfaceVariants: builtInSurfaceVariantRegistry,
});
const TestArrangementNode = Node.create({
  name: "testArrangement",
  group: ARRANGEMENT_CONTENT,
  content: "paragraph*",
});

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("Course Structure authoring policy", () => {
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
      id: PAGE_SURFACE_ID,
      variant: "page-default",
    });
  });

  it("rejects duplicate surface instance ids", () => {
    const editor = makeEditor(slideshowDocument());
    const surfacePositions = allSurfacePositions(editor);

    editor.view.dispatch(
      editor.state.tr.setNodeAttribute(surfacePositions[1]!, "id", FIRST_SLIDE_ID),
    );

    expect(allSurfaceIds(editor)).toEqual([FIRST_SLIDE_ID, SECOND_SLIDE_ID]);
  });

  it("rejects an invalid Course Section boundary", () => {
    const editor = makeEditor(sectionedSlideshowDocument());
    const sectionPosition = firstNodePosition(editor, "courseSection");

    editor.view.dispatch(editor.state.tr.setNodeAttribute(sectionPosition, "title", "   "));

    expect(editor.state.doc.nodeAt(sectionPosition)?.attrs["title"]).toBe("Introduction");
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
      id: COMPATIBLE_SLIDE_ID,
      variant: "slide-image-content-split",
    });
  });

  it("allows a genuinely new valid surface instance", () => {
    const editor = makeEditor(slideshowDocument());
    const definition = builtInSurfaceVariantRegistry.get("slide-cover")!;
    const inserted = editor.schema.nodeFromJSON(
      definition.createSurface({ surfaceId: THIRD_SLIDE_ID }),
    );

    editor.view.dispatch(editor.state.tr.insert(editor.state.doc.content.size - 1, inserted));

    expect(allSurfaceIds(editor)).toEqual([FIRST_SLIDE_ID, SECOND_SLIDE_ID, THIRD_SLIDE_ID]);
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
      id: PAGE_SURFACE_ID,
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
      createCourseSectionNode(),
      SurfaceNode,
      RegionNode,
      SlideCoverSubtitleNode,
      SlideTitleNode,
      TestArrangementNode,
      UniqueID.configure({ attributeName: "id", types: "all", updateDocument: false }),
      createCourseStructureAuthoringPolicy({ courseStructure }),
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
          id: COURSE_DOCUMENT_ID,
          schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
          mode: "page",
          surfaceSize: "fluid",
          overflowMode: "grow",
          theme: createScaffoldDefaultTheme(),
        },
        content: [
          builtInSurfaceVariantRegistry.get("page-default")!.createSurface({
            surfaceId: PAGE_SURFACE_ID,
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
          id: COURSE_DOCUMENT_ID,
          schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
          mode: "slideshow",
          surfaceSize: "16x9",
          overflowMode: "clip",
          theme: createScaffoldDefaultTheme(),
        },
        content: [
          definition.createSurface({ surfaceId: FIRST_SLIDE_ID }),
          definition.createSurface({ surfaceId: SECOND_SLIDE_ID }),
        ],
      },
    ],
  };
}

function sectionedSlideshowDocument(): JSONContent {
  const definition = builtInSurfaceVariantRegistry.get("slide-cover")!;
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: {
          id: COURSE_DOCUMENT_ID,
          schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
          mode: "slideshow",
          surfaceSize: "16x9",
          overflowMode: "clip",
          theme: createScaffoldDefaultTheme(),
        },
        content: [
          { type: "courseSection", attrs: { id: COURSE_SECTION_ID, title: "Introduction" } },
          definition.createSurface({ surfaceId: FIRST_SLIDE_ID }),
          definition.createSurface({ surfaceId: SECOND_SLIDE_ID }),
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
          id: COURSE_DOCUMENT_ID,
          schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
          mode: "slideshow",
          surfaceSize: "16x9",
          overflowMode: "clip",
          theme: createScaffoldDefaultTheme(),
        },
        content: [definition.createSurface({ surfaceId: COMPATIBLE_SLIDE_ID })],
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
