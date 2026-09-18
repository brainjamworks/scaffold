// @vitest-environment happy-dom

import { type CourseMode, type EmbeddedNodeId } from "@scaffold/contracts";
import { Editor, Node, type JSONContent } from "@tiptap/core";
import { UndoRedo } from "@tiptap/extensions";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  createScaffoldApplication,
  defineScaffoldExtensionPack,
} from "@/composition/application/create-scaffold-application";
import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { type ResolvableBlockCapability } from "@/composition/model/resolved-scaffold-capabilities";
import { fixtureCourseDocument } from "@/document/authoring/testing/course-document-fixture";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { defineBlock } from "@/editor/blocks/block-definition";
import { pageDefaultSurfaceDefinition } from "@/editor/surfaces/model/templates/page-default";
import { slideCoverSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-cover";

import {
  canDeleteSurface,
  canDuplicateSurface,
  deleteSurface,
  duplicateSurface,
  setPageSurfaceBackground,
  setPageSurfaceNotes,
  setPageSurfaceTitle,
} from "./surface-document-commands";

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
    attrs: { id: createEmbeddedNodeId() },
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

function slideCover(id: EmbeddedNodeId): JSONContent {
  const created: JSONContent = slideCoverSurfaceDefinition.createSurface({ surfaceId: id });
  const title = created.content?.[0];
  const subtitle = created.content?.[1];
  if (!title || !subtitle) throw new Error("Expected slide cover fields.");
  title.attrs = { ...title.attrs, id: createEmbeddedNodeId() };
  subtitle.attrs = { ...subtitle.attrs, id: createEmbeddedNodeId() };
  const subtitleParagraph = subtitle.content?.[0];
  if (subtitleParagraph) {
    subtitleParagraph.attrs = { ...subtitleParagraph.attrs, id: createEmbeddedNodeId() };
  }
  return created;
}

/**
 * The `copy_fixture` Block exists only to prove that Surface duplication routes
 * nested Blocks through their owner's registered identity rewrite, so it is
 * contributed to the real composition as an extension pack rather than bolted
 * onto a hand-built schema.
 */
function makeApplication(blockCapabilities: readonly ResolvableBlockCapability[]) {
  if (blockCapabilities.length === 0) return createScaffoldApplication();
  return createScaffoldApplication({
    packs: [
      defineScaffoldExtensionPack({
        id: "surface-command-fixtures",
        blocks: blockCapabilities.map((capability) => ({
          ...capability,
          authoringExtension: TestCopyFixtureNode,
          runtimeExtension: TestCopyFixtureNode,
        })),
      }),
    ],
  });
}

function makeEditor(
  mode: CourseMode,
  surfaces: JSONContent[],
  blockCapabilities: readonly ResolvableBlockCapability[] = [],
  withHistory = false,
): Editor {
  const application = makeApplication(blockCapabilities);
  const extensions = createCourseDocumentAuthoringExtensions({
    editable: true,
    composition: application.authoring,
  });
  return new Editor({
    extensions: withHistory ? [...extensions, UndoRedo] : extensions,
    content: fixtureCourseDocument({ mode, surfaces }),
  });
}

function courseChildren(editor: Editor): JSONContent[] {
  const course = editor.getJSON().content?.[0] as JSONContent | undefined;
  return course?.content ?? [];
}

/** Course Documents also carry Course Section boundaries; these are the Surfaces. */
function surfaces(editor: Editor): JSONContent[] {
  return courseChildren(editor).filter((child) => child.type === "surface");
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

  it("rejects page surface commands for slideshow mode", () => {
    const slideshow = makeEditor("slideshow", [surface("surface00001", "Only")]);
    const beforeSlideshow = slideshow.getJSON();

    expect(setPageSurfaceTitle(slideshow, "Slide")).toBe(false);

    expect(slideshow.getJSON()).toEqual(beforeSlideshow);
    slideshow.destroy();
  });

  it("duplicates a non-page surface with fresh stable ids", () => {
    const first = slideCover(FIRST_CREATED_SURFACE_ID);
    const second = slideCover(SECOND_CREATED_SURFACE_ID);
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
    expect(nextSurfaces[1]?.content?.map((node) => node.type)).toEqual(
      nextSurfaces[0]?.content?.map((node) => node.type),
    );
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
    expect(courseChildren(editor).map((child) => child.attrs?.["id"])).toEqual([
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
      surface("surface00002", "Second", { variant: "slide-cover" }),
    ]);

    expect(canDeleteSurface(editor, "surface00001")).toBe(true);
    expect(deleteSurface(editor, "surface00001")).toBe(true);

    const nextSurfaces = surfaces(editor);
    expect(nextSurfaces).toHaveLength(1);
    expect(nextSurfaces[0]?.attrs?.["id"]).toBe("surface00002");
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
      [],
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
      expectedIds: ["section00001", "section00002", "surface00002", "surface00003"],
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
      expectedIds: [
        "section00001",
        "surface00001",
        "surface00002",
        "section00002",
        "section00003",
        "surface00004",
      ],
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
      expectedIds: ["section00001", "surface00001", "surface00002", "section00002"],
    },
  ])(
    "deletes a singleton member while retaining its $label Course Section boundary",
    ({ children, surfaceId, expectedIds }) => {
      const editor = makeEditor("slideshow", children);

      expect(canDeleteSurface(editor, surfaceId)).toBe(true);
      expect(deleteSurface(editor, surfaceId)).toBe(true);
      // These cases assert the surviving Course Structure, boundaries included.
      expect(courseChildren(editor).map((child) => child.attrs?.["id"])).toEqual(expectedIds);

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
