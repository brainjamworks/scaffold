// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it, vi } from "vite-plus/test";

import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { createScaffoldCapabilitiesStorageExtension } from "@/composition/extensions/scaffold-capabilities-storage";
import {
  resolveScaffoldCapabilities,
  type ResolvableBlockCapability,
} from "@/composition/model/resolved-scaffold-capabilities";
import { createCourseStructureCommandsExtension } from "@/document/authoring/course-structure-commands";
import {
  CellAuthoringNode,
  GridAuthoringNode,
} from "@/editor/arrangements/grid/authoring/grid-nodes";
import {
  LayoutAuthoringNode,
  SectionAuthoringNode,
} from "@/editor/arrangements/layout/authoring/layout-nodes";
import { CourseDocumentNode, DocumentNode, createCourseSectionNode } from "@/document/model/nodes";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { defineBlock } from "@/editor/blocks/block-definition";

import {
  canDeleteSurface,
  canDuplicateSurface,
  deleteSurface,
  duplicateSurface,
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
const FIRST_CREATED_SURFACE_ID = createEmbeddedNodeId();
const SECOND_CREATED_SURFACE_ID = createEmbeddedNodeId();

const TestCopyFixtureNode = Node.create({
  name: "copy_fixture",
  group: "block",
  atom: true,
  addAttributes: () => ({ id: { default: null }, data: { default: null } }),
  renderHTML: ({ HTMLAttributes }) => ["div", HTMLAttributes],
});

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

function section(id: string, title: string): JSONContent {
  return {
    type: "courseSection",
    attrs: { id, title },
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

function makeEditor(
  mode: "page" | "slideshow" | "branching",
  surfaces: JSONContent[],
  blockCapabilities: readonly ResolvableBlockCapability[] = [],
  withHistory = false,
): Editor {
  const capabilities = resolveScaffoldCapabilities({
    blockCapabilities,
    layoutDefinitions: [],
    surfaceDefinitions: [pageDefaultSurfaceDefinition, slideCoverSurfaceDefinition],
  });
  return new Editor({
    extensions: [
      createScaffoldCapabilitiesStorageExtension(capabilities),
      DocumentNode,
      StarterKit.configure({
        document: false,
        paragraph: false,
        undoRedo: withHistory ? {} : false,
      }),
      ExtendedParagraph,
      CourseDocumentNode,
      createCourseSectionNode(),
      SurfaceNode,
      RegionNode,
      SlideCoverSubtitleNode,
      GridAuthoringNode,
      CellAuthoringNode,
      LayoutAuthoringNode,
      SectionAuthoringNode,
      TestCopyFixtureNode,
      UniqueID.configure({ attributeName: "id", types: "all", updateDocument: false }),
      createCourseStructureCommandsExtension(),
    ],
    content: courseDocument(mode, surfaces),
  });
}

function surfaces(editor: Editor): JSONContent[] {
  const course = editor.getJSON().content?.[0] as JSONContent | undefined;
  return course?.content ?? [];
}

describe("surface document commands", () => {
  it("updates page surface title, background, and notes through transactions", () => {
    const editor = makeEditor("page", [surface("surface00001", "Only")]);

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
    const original = pageDefaultSurfaceDefinition.createSurface({
      surfaceId: FIRST_CREATED_SURFACE_ID,
    });
    const editor = makeEditor("page", [original]);

    expect(setPageSurfaceTitle(editor, "Visible section")).toBe(true);
    expect(setPageSurfaceBackground(editor, { color: "#123456" })).toBe(true);
    expect(setPageSurfaceNotes(editor, "Draft note")).toBe(true);

    expect(surfaces(editor)[0]?.attrs?.["variant"]).toBe("page-default");
    editor.destroy();
  });

  it("creates a visible title heading when setting the page surface title", () => {
    const editor = makeEditor("page", [surface("surface00001", "Body")]);

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
      surfaceWithContent("surface00001", [
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
      surface("surface00001", "First"),
      surface("surface-2", "Second"),
    ]);
    const branching = makeEditor("branching", [surface("surface00001", "Only")]);
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
    const first = slideCoverSurfaceDefinition.createSurface({
      surfaceId: FIRST_CREATED_SURFACE_ID,
    });
    const second = slideCoverSurfaceDefinition.createSurface({
      surfaceId: SECOND_CREATED_SURFACE_ID,
    });
    const editor = makeEditor("slideshow", [first, second]);

    expect(canDuplicateSurface(editor, FIRST_CREATED_SURFACE_ID)).toBe(true);
    expect(duplicateSurface(editor, FIRST_CREATED_SURFACE_ID)).toBe(true);

    const nextSurfaces = surfaces(editor);
    expect(nextSurfaces).toHaveLength(3);
    expect(nextSurfaces[0]?.attrs?.["id"]).toBe(FIRST_CREATED_SURFACE_ID);
    expect(nextSurfaces[1]?.attrs?.["id"]).toEqual(expect.stringMatching(STABLE_ID_PATTERN));
    expect(nextSurfaces[1]?.attrs?.["id"]).not.toBe(FIRST_CREATED_SURFACE_ID);
    expect(nextSurfaces[1]?.attrs?.["variant"]).toBe("slide-cover");
    expect(nextSurfaces[1]?.attrs?.["settings"]).toEqual(nextSurfaces[0]?.attrs?.["settings"]);
    expect(nextSurfaces[1]?.content).toEqual(nextSurfaces[0]?.content);
    expect(nextSurfaces[2]?.attrs?.["id"]).toBe(SECOND_CREATED_SURFACE_ID);

    editor.destroy();
  });

  it("duplicates an ordinary Course Section member by stable Surface ID", () => {
    const editor = makeEditor("slideshow", [
      section("section00001", "First"),
      surface("surface00001", "First", { variant: "slide-cover", settings: {} }),
      surface("surface00002", "Second", { variant: "slide-cover", settings: {} }),
    ]);

    expect(canDuplicateSurface(editor, "surface00001")).toBe(true);
    expect(duplicateSurface(editor, "surface00001")).toBe(true);
    expect(surfaces(editor).map((child) => child.attrs?.["id"])).toEqual([
      "section00001",
      "surface00001",
      expect.stringMatching(STABLE_ID_PATTERN),
      "surface00002",
    ]);

    editor.destroy();
  });

  it("routes nested Blocks through mounted owners while duplicating a Surface", () => {
    const rewrite = vi.fn(({ content }) => ({
      ...content,
      attrs: { ...content.attrs, data: { copiedBy: "surface-owner" } },
    }));
    const definition = defineBlock({ nodeType: "copy_fixture", title: "Copy fixture" });
    const blockCapabilities = [
      {
        definition,
        identityRewrites: [{ nodeType: definition.nodeType, rewrite }],
      },
    ];
    const editor = makeEditor(
      "slideshow",
      [
        surfaceWithContent(
          "surface00001",
          [{ type: "copy_fixture", attrs: { id: "copyblock001", data: null } }],
          { variant: "slide-cover", settings: {} },
        ),
        surface("surface00002", "Second", { variant: "slide-cover", settings: {} }),
      ],
      blockCapabilities,
    );

    expect(duplicateSurface(editor, "surface00001")).toBe(true);

    const duplicatedBlock = surfaces(editor)[1]?.content?.[0];
    expect(rewrite).toHaveBeenCalledOnce();
    expect(duplicatedBlock?.attrs?.["data"]).toEqual({ copiedBy: "surface-owner" });
    editor.destroy();
  });

  it("does not duplicate page surfaces", () => {
    const editor = makeEditor("page", [
      surface("surface00001", "Only", { variant: "page-default" }),
    ]);
    const before = editor.getJSON();

    expect(canDuplicateSurface(editor, "surface00001")).toBe(false);
    expect(duplicateSurface(editor, "surface00001")).toBe(false);
    expect(editor.getJSON()).toEqual(before);

    editor.destroy();
  });

  it("deletes a non-page surface while preserving a neighboring surface", () => {
    const editor = makeEditor("slideshow", [
      surface("surface00001", "First", { variant: "slide-cover" }),
      surface("surface-2", "Second", { variant: "slide-cover" }),
    ]);

    expect(canDeleteSurface(editor, "surface00001")).toBe(true);
    expect(deleteSurface(editor, "surface00001")).toBe(true);

    const nextSurfaces = surfaces(editor);
    expect(nextSurfaces).toHaveLength(1);
    expect(nextSurfaces[0]?.attrs?.["id"]).toBe("surface-2");
    expect(editor.state.doc.textContent).toBe("Second");

    editor.destroy();
  });

  it.each([
    {
      label: "duplicate",
      apply: (editor: Editor) => duplicateSurface(editor, "surface00001"),
    },
    {
      label: "delete",
      apply: (editor: Editor) => deleteSurface(editor, "surface00001"),
    },
  ])("keeps a successful $label as one undoable document transaction", ({ apply }) => {
    const editor = makeEditor(
      "slideshow",
      [
        surface("surface00001", "First", { variant: "slide-cover" }),
        surface("surface00002", "Second", { variant: "slide-cover" }),
      ],
      EMPTY_BLOCK_CAPABILITIES,
      true,
    );
    const before = editor.getJSON();
    let changedTransactions = 0;
    editor.on("transaction", ({ transaction }) => {
      if (transaction.docChanged) changedTransactions += 1;
    });

    expect(apply(editor)).toBe(true);
    const after = editor.getJSON();
    expect(after).not.toEqual(before);
    expect(changedTransactions).toBe(1);

    expect(editor.commands.undo()).toBe(true);
    expect(editor.getJSON()).toEqual(before);
    expect(changedTransactions).toBe(2);

    expect(editor.commands.redo()).toBe(true);
    expect(editor.getJSON()).toEqual(after);
    expect(changedTransactions).toBe(3);

    editor.destroy();
  });

  it("does not delete the final remaining surface", () => {
    const editor = makeEditor("slideshow", [
      surface("surface00001", "Only", { variant: "slide-cover" }),
    ]);
    const before = editor.getJSON();

    expect(canDeleteSurface(editor, "surface00001")).toBe(false);
    expect(deleteSurface(editor, "surface00001")).toBe(false);
    expect(editor.getJSON()).toEqual(before);

    editor.destroy();
  });

  it.each([
    {
      label: "beginning",
      children: [
        section("section00001", "First"),
        surface("surface00001", "First"),
        section("section00002", "Second"),
        surface("surface00002", "Second"),
        surface("surface00003", "Third"),
      ],
      surfaceId: "surface00001",
      expectedIds: ["section00002", "surface00002", "surface00003"],
    },
    {
      label: "middle",
      children: [
        section("section00001", "First"),
        surface("surface00001", "First"),
        surface("surface00002", "Second"),
        section("section00002", "Middle"),
        surface("surface00003", "Third"),
        section("section00003", "Last"),
        surface("surface00004", "Fourth"),
      ],
      surfaceId: "surface00003",
      expectedIds: ["section00001", "surface00001", "surface00002", "section00003", "surface00004"],
    },
    {
      label: "end",
      children: [
        section("section00001", "First"),
        surface("surface00001", "First"),
        surface("surface00002", "Second"),
        section("section00002", "Last"),
        surface("surface00003", "Third"),
      ],
      surfaceId: "surface00003",
      expectedIds: ["section00001", "surface00001", "surface00002"],
    },
  ])(
    "deletes a singleton member and its $label Course Section boundary",
    ({ children, surfaceId, expectedIds }) => {
      const editor = makeEditor("slideshow", children);

      expect(canDeleteSurface(editor, surfaceId)).toBe(true);
      expect(deleteSurface(editor, surfaceId)).toBe(true);
      expect(surfaces(editor).map((child) => child.attrs?.["id"])).toEqual(expectedIds);

      editor.destroy();
    },
  );

  it("returns false without dispatching for stale Surface IDs", () => {
    const editor = makeEditor("slideshow", [
      surface("surface00001", "First"),
      surface("surface00002", "Second"),
    ]);
    const dispatched = vi.fn();
    editor.on("transaction", dispatched);

    expect(canDuplicateSurface(editor, "surface99999")).toBe(false);
    expect(canDeleteSurface(editor, "surface99999")).toBe(false);
    expect(duplicateSurface(editor, "surface99999")).toBe(false);
    expect(deleteSurface(editor, "surface99999")).toBe(false);
    expect(dispatched).not.toHaveBeenCalled();

    editor.destroy();
  });
});
