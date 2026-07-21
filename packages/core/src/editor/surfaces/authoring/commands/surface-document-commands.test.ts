// @vitest-environment happy-dom

import { Editor, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import {
  CellAuthoringNode,
  GridAuthoringNode,
} from "@/editor/arrangements/grid/authoring/grid-nodes";
import {
  LayoutAuthoringNode,
  SectionAuthoringNode,
} from "@/editor/arrangements/layout/authoring/layout-nodes";
import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";

import {
  canDeleteSurfaceAt,
  canDuplicateSurfaceAt,
  deleteSurfaceAt,
  duplicateSurfaceAt,
  setPageSurfaceBackground,
  setPageSurfaceNotes,
  setPageSurfaceTitle,
} from "./surface-document-commands";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SlideCoverSubtitleNode } from "@/editor/surfaces/model/nodes/slide-cover-subtitle";
import { pageDefaultSurfaceDefinition } from "@/editor/surfaces/model/templates/page-default";
import { slideCoverSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-cover";

const STABLE_ID_PATTERN = /^[0-9A-Z_a-z-]{12}$/;

function paragraph(text: string): JSONContent {
  return {
    type: "paragraph",
    content: [{ type: "text", text }],
  };
}

function surface(id: string, text: string, attrs: Record<string, unknown> = {}): JSONContent {
  return {
    type: "surface",
    attrs: { id, ...attrs },
    content: [paragraph(text)],
  };
}

function surfaceWithContent(
  id: string,
  content: JSONContent[],
  attrs: Record<string, unknown> = {},
): JSONContent {
  return {
    type: "surface",
    attrs: { id, ...attrs },
    content,
  };
}

function courseDocument(
  mode: "page" | "slideshow" | "branching",
  surfaces: JSONContent[],
): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { mode, surfaceSize: "fluid", overflowMode: "grow" },
        content: surfaces,
      },
    ],
  };
}

function makeEditor(mode: "page" | "slideshow" | "branching", surfaces: JSONContent[]): Editor {
  return new Editor({
    extensions: [
      DocumentNode,
      StarterKit.configure({
        document: false,
        paragraph: false,
        undoRedo: false,
      }),
      ExtendedParagraph,
      CourseDocumentNode,
      SurfaceNode,
      RegionNode,
      SlideCoverSubtitleNode,
      GridAuthoringNode,
      CellAuthoringNode,
      LayoutAuthoringNode,
      SectionAuthoringNode,
    ],
    content: courseDocument(mode, surfaces),
  });
}

function surfaces(editor: Editor): JSONContent[] {
  const course = editor.getJSON().content?.[0] as JSONContent | undefined;
  return course?.content ?? [];
}

function surfacePos(editor: Editor, surfaceId: string): number {
  let found: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "surface" && node.attrs["id"] === surfaceId) {
      found = pos;
      return false;
    }

    return true;
  });

  if (found === null) {
    throw new Error(`Could not find surface "${surfaceId}".`);
  }

  return found;
}

describe("surface document commands", () => {
  it("updates page surface title, background, and notes through transactions", () => {
    const editor = makeEditor("page", [surface("surface-1", "Only")]);

    expect(setPageSurfaceTitle(editor, "Visible section")).toBe(true);
    expect(setPageSurfaceBackground(editor, { color: "#123456" })).toBe(true);
    expect(setPageSurfaceNotes(editor, "Draft note")).toBe(true);

    expect(surfaces(editor)[0]?.attrs).toMatchObject({
      title: "Visible section",
      settings: { background: { color: "#123456" } },
      notes: "Draft note",
    });
    editor.destroy();
  });

  it("keeps the surface variant stable across generic page authoring commands", () => {
    const original = pageDefaultSurfaceDefinition.createSurface({ surfaceId: "surface-1" });
    const editor = makeEditor("page", [original]);

    expect(setPageSurfaceTitle(editor, "Visible section")).toBe(true);
    expect(setPageSurfaceBackground(editor, { color: "#123456" })).toBe(true);
    expect(setPageSurfaceNotes(editor, "Draft note")).toBe(true);

    expect(surfaces(editor)[0]?.attrs?.["variant"]).toBe("page-default");
    editor.destroy();
  });

  it("creates a visible title heading when setting the page surface title", () => {
    const editor = makeEditor("page", [surface("surface-1", "Body")]);

    expect(setPageSurfaceTitle(editor, "Introduction")).toBe(true);

    const content = surfaces(editor)[0]?.content ?? [];
    expect(content[0]).toMatchObject({
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "Introduction" }],
    });
    expect(content[1]).toMatchObject({
      type: "paragraph",
      content: [{ type: "text", text: "Body" }],
    });
    expect(surfaces(editor)[0]?.attrs).toMatchObject({
      title: "Introduction",
    });
    editor.destroy();
  });

  it("updates the existing visible title heading without inserting a duplicate", () => {
    const editor = makeEditor("page", [
      surfaceWithContent("surface-1", [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Draft" }],
        },
        paragraph("Body"),
      ]),
    ]);

    expect(setPageSurfaceTitle(editor, "Published")).toBe(true);

    const content = surfaces(editor)[0]?.content ?? [];
    expect(content).toHaveLength(2);
    expect(content[0]).toMatchObject({
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "Published" }],
    });
    expect(content[1]).toMatchObject({
      type: "paragraph",
      content: [{ type: "text", text: "Body" }],
    });
    editor.destroy();
  });

  it("rejects page surface commands for slideshow or branching mode", () => {
    const slideshow = makeEditor("slideshow", [
      surface("surface-1", "First"),
      surface("surface-2", "Second"),
    ]);
    const branching = makeEditor("branching", [surface("surface-1", "Only")]);
    const beforeSlideshow = slideshow.getJSON();
    const beforeBranching = branching.getJSON();

    expect(setPageSurfaceTitle(slideshow, "Slide")).toBe(false);
    expect(setPageSurfaceTitle(branching, "Branch")).toBe(false);

    expect(slideshow.getJSON()).toEqual(beforeSlideshow);
    expect(branching.getJSON()).toEqual(beforeBranching);
    slideshow.destroy();
    branching.destroy();
  });

  it("duplicates a non-page surface with fresh stable ids", () => {
    const first = slideCoverSurfaceDefinition.createSurface({ surfaceId: "surface-1" });
    const second = slideCoverSurfaceDefinition.createSurface({ surfaceId: "surface-2" });
    const editor = makeEditor("slideshow", [first, second]);

    const pos = surfacePos(editor, "surface-1");
    expect(canDuplicateSurfaceAt(editor, pos)).toBe(true);
    expect(duplicateSurfaceAt(editor, pos)).toBe(true);

    const nextSurfaces = surfaces(editor);
    expect(nextSurfaces).toHaveLength(3);
    expect(nextSurfaces[0]?.attrs?.["id"]).toBe("surface-1");
    expect(nextSurfaces[1]?.attrs?.["id"]).toEqual(expect.stringMatching(STABLE_ID_PATTERN));
    expect(nextSurfaces[1]?.attrs?.["id"]).not.toBe("surface-1");
    expect(nextSurfaces[1]?.attrs?.["variant"]).toBe("slide-cover");
    expect(nextSurfaces[1]?.attrs?.["settings"]).toEqual(nextSurfaces[0]?.attrs?.["settings"]);
    expect(nextSurfaces[1]?.content).toEqual(nextSurfaces[0]?.content);
    expect(nextSurfaces[2]?.attrs?.["id"]).toBe("surface-2");

    editor.destroy();
  });

  it("does not duplicate page surfaces", () => {
    const editor = makeEditor("page", [surface("surface-1", "Only", { variant: "page-default" })]);
    const before = editor.getJSON();
    const pos = surfacePos(editor, "surface-1");

    expect(canDuplicateSurfaceAt(editor, pos)).toBe(false);
    expect(duplicateSurfaceAt(editor, pos)).toBe(false);
    expect(editor.getJSON()).toEqual(before);

    editor.destroy();
  });

  it("deletes a non-page surface while preserving a neighboring surface", () => {
    const editor = makeEditor("slideshow", [
      surface("surface-1", "First", { variant: "slide-cover" }),
      surface("surface-2", "Second", { variant: "slide-cover" }),
    ]);

    const pos = surfacePos(editor, "surface-1");
    expect(canDeleteSurfaceAt(editor, pos)).toBe(true);
    expect(deleteSurfaceAt(editor, pos)).toBe(true);

    const nextSurfaces = surfaces(editor);
    expect(nextSurfaces).toHaveLength(1);
    expect(nextSurfaces[0]?.attrs?.["id"]).toBe("surface-2");
    expect(editor.state.doc.textContent).toBe("Second");

    editor.destroy();
  });

  it("does not delete the final remaining surface", () => {
    const editor = makeEditor("slideshow", [
      surface("surface-1", "Only", { variant: "slide-cover" }),
    ]);
    const before = editor.getJSON();
    const pos = surfacePos(editor, "surface-1");

    expect(canDeleteSurfaceAt(editor, pos)).toBe(false);
    expect(deleteSurfaceAt(editor, pos)).toBe(false);
    expect(editor.getJSON()).toEqual(before);

    editor.destroy();
  });
});
