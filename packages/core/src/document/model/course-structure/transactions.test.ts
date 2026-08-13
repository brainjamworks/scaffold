// @vitest-environment happy-dom

import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { Editor, Node, type JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import StarterKit from "@tiptap/starter-kit";
import type { Transaction } from "@tiptap/pm/state";
import { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createScaffoldCapabilitiesStorageExtension } from "@/composition/extensions/scaffold-capabilities-storage";
import {
  resolveScaffoldCapabilities,
  type ResolvedBlockCapabilities,
} from "@/composition/model/resolved-scaffold-capabilities";
import { createCourseStructureCommandsExtension } from "@/document/authoring/course-structure-commands";
import {
  authoringCourseDocumentContentExpression,
  createUnavailableContentAuthoringExtensions,
} from "@/document/authoring/unavailable-content";
import { ARRANGEMENT_CONTENT } from "@/document/model/content-model/content-groups";
import { CourseDocumentNode, DocumentNode, createCourseSectionNode } from "@/document/model/nodes";
import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { isNodeSelection } from "@/editor/selection/selection-facts";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import { createSurfaceVariantRegistry } from "@/editor/surfaces/model/surface-variant-registry";
import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";

import type { CourseStructureCommand } from "./index";

const COURSE_ID = EmbeddedNodeIdSchema.parse("course000001");
const SURFACE_1 = EmbeddedNodeIdSchema.parse("surface00001");
const SURFACE_2 = EmbeddedNodeIdSchema.parse("surface00002");
const SURFACE_3 = EmbeddedNodeIdSchema.parse("surface00003");
const SURFACE_4 = EmbeddedNodeIdSchema.parse("surface00004");
const UNAVAILABLE_SURFACE = EmbeddedNodeIdSchema.parse("unavail00001");
const SECTION_1 = EmbeddedNodeIdSchema.parse("section00001");
const SECTION_2 = EmbeddedNodeIdSchema.parse("section00002");
const SECTION_3 = EmbeddedNodeIdSchema.parse("section00003");
const BLOCK_1 = EmbeddedNodeIdSchema.parse("copyblock001");

const editors: Editor[] = [];
const EMPTY_BLOCK_CAPABILITIES: ResolvedBlockCapabilities = Object.freeze({
  registry: createBlockRegistry([]),
  duplication: Object.freeze({ getByNodeType: () => undefined, hasNodeType: () => false }),
});
const TestArrangementNode = Node.create({
  name: "testArrangement",
  group: ARRANGEMENT_CONTENT,
  content: "paragraph*",
});
const CopyFixtureNode = Node.create({
  name: "copy_fixture",
  group: "block",
  atom: true,
  addAttributes() {
    return { id: { default: null }, data: { default: {} } };
  },
  renderHTML() {
    return ["div", { "data-copy-fixture": "" }];
  },
});
const TestCourseDocumentNode = CourseDocumentNode.extend({
  content: authoringCourseDocumentContentExpression(),
});
const surfaceVariants = createSurfaceVariantRegistry([
  {
    id: "test-flex-slide",
    modes: ["slideshow"],
    title: "Flexible test slide",
    description: "Course Structure Block duplication fixture.",
    settingsSchema: z.object({}).strict(),
    createSurface: ({ surfaceId }) => surface(surfaceId, undefined, "test-flex-slide"),
  },
  {
    id: "test-slide",
    modes: ["slideshow"],
    defaultForModes: ["slideshow"],
    title: "Test slide",
    description: "Course Structure command fixture.",
    settingsSchema: z.object({}).strict(),
    createSurface: ({ surfaceId }) => surface(surfaceId),
  },
]);

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("Course Structure Tiptap commands", () => {
  it("renames with one local Tiptap transaction", () => {
    const editor = makeEditor(
      [section(SECTION_1, "One"), surface(SURFACE_1, paragraph("Alpha"))],
      "slideshow",
      [],
    );
    let dispatched: Transaction | undefined;
    editor.on("transaction", ({ transaction }) => {
      if (transaction.docChanged) dispatched = transaction;
    });

    const handled = editor
      .chain()
      .setTextSelection(4)
      .applyCourseStructureCommand({
        type: "course-section.rename",
        courseSectionId: SECTION_1,
        title: "  Introduction  ",
      })
      .run();

    expect(handled).toBe(true);
    expect(courseChildren(editor)[0]?.attrs?.["title"]).toBe("Introduction");
    expect(dispatched?.steps.map((step) => step.toJSON())).toEqual([
      expect.objectContaining({ stepType: "attr", pos: 1, attr: "title" }),
    ]);
    expect(editor.state.selection.anchor).toBe(4);
  });

  it("appends a genuinely empty Course Section with the next default title", () => {
    const editor = makeEditor([section(SECTION_1, "One"), surface(SURFACE_1)], "slideshow", [
      "newsect_0001",
    ]);
    expect(
      runCommand(editor, {
        type: "course-section.create",
        placement: "end",
      }),
    ).toBe(true);
    expect(childIdentity(editor)).toEqual([SECTION_1, SURFACE_1, "newsect_0001"]);
    expect(courseChildren(editor).at(-1)?.attrs?.["title"]).toBe("Section 2");
  });

  it("deletes exactly the confirmed populated Section membership", () => {
    const editor = makeEditor(
      [
        section(SECTION_1, "One"),
        surface(SURFACE_1),
        section(SECTION_2, "Two"),
        surface(SURFACE_2),
      ],
      "slideshow",
      [],
    );

    const before = editor.getJSON();
    expect(
      runCommand(editor, {
        type: "course-section.delete",
        courseSectionId: SECTION_1,
        expectedSurfaceIds: [SURFACE_2],
      }),
    ).toBe(false);
    expect(editor.getJSON()).toEqual(before);
    expect(
      runCommand(editor, {
        type: "course-section.delete",
        courseSectionId: SECTION_1,
        expectedSurfaceIds: [SURFACE_1],
      }),
    ).toBe(true);
    expect(childIdentity(editor)).toEqual([SECTION_2, SURFACE_2]);
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getJSON()).toEqual(before);
  });

  it("rejects deletion of the final Course Section", () => {
    const editor = makeEditor([section(SECTION_1, "One"), surface(SURFACE_1)], "slideshow", []);
    expect(
      runCommand(editor, {
        type: "course-section.delete",
        courseSectionId: SECTION_1,
        expectedSurfaceIds: [SURFACE_1],
      }),
    ).toBe(false);
  });

  it("duplicates a complete section with coordinated fresh identities", () => {
    const editor = makeEditor(
      [
        section(SECTION_1, "One"),
        surface(SURFACE_1),
        surface(SURFACE_2),
        section(SECTION_2, "Two"),
        surface(SURFACE_3),
      ],
      "slideshow",
      ["copysect0001", "copysurf0001", "copysurf0002"],
    );

    expect(
      runCommand(editor, {
        type: "course-section.duplicate",
        courseSectionId: SECTION_1,
      }),
    ).toBe(true);
    expect(childIdentity(editor)).toEqual([
      SECTION_1,
      SURFACE_1,
      SURFACE_2,
      "copysect0001",
      "copysurf0001",
      "copysurf0002",
      SECTION_2,
      SURFACE_3,
    ]);
  });

  it("inserts, duplicates, moves, and deletes Surfaces locally", () => {
    const editor = makeEditor(
      [
        section(SECTION_1, "One"),
        surface(SURFACE_1),
        section(SECTION_2, "Two"),
        surface(SURFACE_2),
      ],
      "slideshow",
      ["dupesurf0001"],
    );
    const insertedNode = editor.schema.nodeFromJSON(surface(SURFACE_3));

    expect(
      runCommand(editor, {
        type: "surface.insert",
        surface: insertedNode,
        destination: { beforeSurfaceId: SURFACE_2 },
      }),
    ).toBe(true);
    expect(runCommand(editor, { type: "surface.duplicate", surfaceId: SURFACE_1 })).toBe(true);
    expect(
      runCommand(editor, {
        type: "surface.move",
        surfaceId: SURFACE_1,
        destination: { afterSurfaceId: SURFACE_3 },
      }),
    ).toBe(true);
    expect(runCommand(editor, { type: "surface.delete", surfaceId: SURFACE_2 })).toBe(true);
    expect(childIdentity(editor)).toEqual([
      SECTION_1,
      "dupesurf0001",
      SECTION_2,
      SURFACE_3,
      SURFACE_1,
    ]);
  });

  it("moves a final Surface into an empty Course Section and retains the source boundary", () => {
    const editor = makeEditor(
      [section(SECTION_1, "One"), surface(SURFACE_1), section(SECTION_2, "Empty")],
      "slideshow",
      [],
    );

    expect(
      runCommand(editor, {
        type: "surface.move",
        surfaceId: SURFACE_1,
        destination: { intoCourseSectionId: SECTION_2, edge: "end" },
      }),
    ).toBe(true);
    expect(childIdentity(editor)).toEqual([SECTION_1, SECTION_2, SURFACE_1]);
  });

  it("moves an unavailable Surface opaquely and resolves it as a destination", () => {
    const unavailable = unavailableSurface(UNAVAILABLE_SURFACE);
    const editor = makeEditor(
      [
        section(SECTION_1, "One"),
        unavailable,
        surface(SURFACE_1),
        section(SECTION_2, "Two"),
        surface(SURFACE_2),
      ],
      "slideshow",
      [],
    );
    editor.commands.setNodeSelection(
      directChildPosition(editor, "unavailable_surface", UNAVAILABLE_SURFACE),
    );

    expect(
      runCommand(editor, {
        type: "surface.move",
        surfaceId: UNAVAILABLE_SURFACE,
        destination: { intoCourseSectionId: SECTION_2, edge: "end" },
      }),
    ).toBe(true);
    expect(
      runCommand(editor, {
        type: "surface.move",
        surfaceId: SURFACE_1,
        destination: { beforeSurfaceId: UNAVAILABLE_SURFACE },
      }),
    ).toBe(true);

    expect(childIdentity(editor)).toEqual([
      SECTION_1,
      SECTION_2,
      SURFACE_2,
      SURFACE_1,
      UNAVAILABLE_SURFACE,
    ]);
    expect(courseChildren(editor).at(-1)).toEqual(unavailable);
    expect(isNodeSelection(editor.state.selection)).toBe(true);
    expect(editor.state.selection.$from.nodeAfter?.attrs["id"]).toBe(UNAVAILABLE_SURFACE);
  });

  it("deletes and restores an unavailable Surface without changing its payload", () => {
    const unavailable = unavailableSurface(UNAVAILABLE_SURFACE);
    const editor = makeEditor(
      [
        section(SECTION_1, "One"),
        surface(SURFACE_1),
        unavailable,
        section(SECTION_2, "Two"),
        surface(SURFACE_2),
      ],
      "slideshow",
      [],
    );
    const before = editor.getJSON();

    expect(runCommand(editor, { type: "surface.delete", surfaceId: UNAVAILABLE_SURFACE })).toBe(
      true,
    );
    expect(childIdentity(editor)).toEqual([SECTION_1, SURFACE_1, SECTION_2, SURFACE_2]);
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getJSON()).toEqual(before);
    expect(courseChildren(editor)[2]).toEqual(unavailable);
  });

  it("requires unavailable Surfaces in confirmed Section deletion membership", () => {
    const editor = makeEditor(
      [
        section(SECTION_1, "One"),
        surface(SURFACE_1),
        unavailableSurface(UNAVAILABLE_SURFACE),
        section(SECTION_2, "Two"),
        surface(SURFACE_2),
      ],
      "slideshow",
      [],
    );
    const before = editor.getJSON();

    expect(
      runCommand(editor, {
        type: "course-section.delete",
        courseSectionId: SECTION_1,
        expectedSurfaceIds: [SURFACE_1],
      }),
    ).toBe(false);
    expect(editor.getJSON()).toEqual(before);
    expect(
      runCommand(editor, {
        type: "course-section.delete",
        courseSectionId: SECTION_1,
        expectedSurfaceIds: [SURFACE_1, UNAVAILABLE_SURFACE],
      }),
    ).toBe(true);
    expect(childIdentity(editor)).toEqual([SECTION_2, SURFACE_2]);
  });

  it("continues to refuse unavailable Surface and owning Section duplication", () => {
    const editor = makeEditor(
      [
        section(SECTION_1, "One"),
        unavailableSurface(UNAVAILABLE_SURFACE),
        section(SECTION_2, "Two"),
        surface(SURFACE_2),
      ],
      "slideshow",
      ["unusedid0001"],
    );
    const before = editor.getJSON();

    expect(runCommand(editor, { type: "surface.duplicate", surfaceId: UNAVAILABLE_SURFACE })).toBe(
      false,
    );
    expect(
      runCommand(editor, {
        type: "course-section.duplicate",
        courseSectionId: SECTION_1,
      }),
    ).toBe(false);
    expect(editor.getJSON()).toEqual(before);
  });

  it("duplicates an empty Course Section as empty with fresh identity", () => {
    const editor = makeEditor(
      [section(SECTION_1, "One"), surface(SURFACE_1), section(SECTION_2, "Empty")],
      "slideshow",
      ["copysect0001"],
    );

    expect(
      runCommand(editor, { type: "course-section.duplicate", courseSectionId: SECTION_2 }),
    ).toBe(true);
    expect(childIdentity(editor)).toEqual([SECTION_1, SURFACE_1, SECTION_2, "copysect0001"]);
  });

  it("retains the boundary vacated by a singleton Surface", () => {
    const editor = makeEditor(
      [
        section(SECTION_1, "One"),
        surface(SURFACE_1),
        section(SECTION_2, "Two"),
        surface(SURFACE_2),
        section(SECTION_3, "Three"),
        surface(SURFACE_3),
      ],
      "slideshow",
      [],
    );

    expect(runCommand(editor, { type: "surface.delete", surfaceId: SURFACE_2 })).toBe(true);
    expect(childIdentity(editor)).toEqual([SECTION_1, SURFACE_1, SECTION_2, SECTION_3, SURFACE_3]);
    expect(selectedSurfaceId(editor)).toBe(SURFACE_3);
  });

  it("returns false for inapplicable operations without dispatching", () => {
    const one = makeEditor([section(SECTION_1, "One"), surface(SURFACE_1)], "slideshow", []);
    expect(runCommand(one, { type: "surface.delete", surfaceId: SURFACE_1 })).toBe(true);
    expect(childIdentity(one)).toEqual([SECTION_1]);

    const two = makeEditor(
      [section(SECTION_1, "One"), surface(SURFACE_1), surface(SURFACE_2)],
      "slideshow",
      [],
    );
    expect(runCommand(two, { type: "surface.delete", surfaceId: SURFACE_4 })).toBe(false);
    expect(
      runCommand(two, {
        type: "surface.move",
        surfaceId: SURFACE_1,
        destination: { beforeSurfaceId: SURFACE_2 },
      }),
    ).toBe(false);

    const page = makeEditor([surface(SURFACE_1)], "page", []);
    const transactions = vi.fn();
    page.on("transaction", transactions);
    expect(runCommand(page, { type: "surface.delete", surfaceId: SURFACE_1 })).toBe(false);
    expect(transactions).not.toHaveBeenCalled();
  });

  it("refuses Course Structure commands without dispatching while the editor is read-only", () => {
    const editor = makeEditor([section(SECTION_1, "One"), surface(SURFACE_1)], "slideshow", []);
    const before = editor.getJSON();
    editor.setEditable(false, false);
    const transactions = vi.fn();
    const updates = vi.fn();
    editor.on("transaction", transactions);
    editor.on("update", updates);

    expect(
      runCommand(editor, {
        type: "course-section.rename",
        courseSectionId: SECTION_1,
        title: "Renamed",
      }),
    ).toBe(false);
    expect(editor.getJSON()).toEqual(before);
    expect(transactions).not.toHaveBeenCalled();
    expect(updates).not.toHaveBeenCalled();
  });

  it("lets a mounted Block rewrite private identity during Surface duplication", () => {
    const duplication = vi.fn(({ content, nodeIdChanges }) => {
      const data = content.attrs?.["data"];
      const referenceId =
        data && typeof data === "object" && "referenceId" in data ? data.referenceId : undefined;
      const replacement =
        typeof referenceId === "string"
          ? nodeIdChanges.get(EmbeddedNodeIdSchema.parse(referenceId))
          : undefined;
      return replacement
        ? { ...content, attrs: { ...content.attrs, data: { ...data, referenceId: replacement } } }
        : content;
    });
    const mountedBlocks = Object.freeze({
      registry: createBlockRegistry([
        defineBlock({ nodeType: "copy_fixture", title: "Copy fixture" }),
      ]),
      duplication: Object.freeze({
        getByNodeType: (nodeType: string) =>
          nodeType === "copy_fixture" ? duplication : undefined,
        hasNodeType: (nodeType: string) => nodeType === "copy_fixture",
      }),
    });
    const editor = makeEditor(
      [
        section(SECTION_1, "One"),
        surface(
          SURFACE_1,
          [{ type: "copy_fixture", attrs: { id: BLOCK_1, data: { referenceId: BLOCK_1 } } }],
          "test-flex-slide",
        ),
      ],
      "slideshow",
      ["copysurf0001", "copyblock002"],
      mountedBlocks,
    );

    expect(runCommand(editor, { type: "surface.duplicate", surfaceId: SURFACE_1 })).toBe(true);
    expect(courseChildren(editor)[2]?.content?.[0]).toMatchObject({
      type: "copy_fixture",
      attrs: { id: "copyblock002", data: { referenceId: "copyblock002" } },
    });
    expect(duplication).toHaveBeenCalledOnce();
  });

  it("lets a mounted Block repair private identity during Course Section duplication", () => {
    const duplication = vi.fn(({ content, nodeIdChanges }) => {
      const data = content.attrs?.["data"];
      const referenceId =
        data && typeof data === "object" && "referenceId" in data ? data.referenceId : undefined;
      const replacement =
        typeof referenceId === "string"
          ? nodeIdChanges.get(EmbeddedNodeIdSchema.parse(referenceId))
          : undefined;
      return replacement
        ? { ...content, attrs: { ...content.attrs, data: { ...data, referenceId: replacement } } }
        : content;
    });
    const mountedBlocks = Object.freeze({
      registry: createBlockRegistry([
        defineBlock({ nodeType: "copy_fixture", title: "Copy fixture" }),
      ]),
      duplication: Object.freeze({
        getByNodeType: (nodeType: string) =>
          nodeType === "copy_fixture" ? duplication : undefined,
        hasNodeType: (nodeType: string) => nodeType === "copy_fixture",
      }),
    });
    const editor = makeEditor(
      [
        section(SECTION_1, "One"),
        surface(
          SURFACE_1,
          [{ type: "copy_fixture", attrs: { id: BLOCK_1, data: { referenceId: BLOCK_1 } } }],
          "test-flex-slide",
        ),
        section(SECTION_2, "Two"),
        surface(SURFACE_2),
      ],
      "slideshow",
      ["copysect0001", "copysurf0001", "copyblock002"],
      mountedBlocks,
    );

    expect(
      runCommand(editor, {
        type: "course-section.duplicate",
        courseSectionId: SECTION_1,
      }),
    ).toBe(true);
    expect(courseChildren(editor)[3]?.content?.[0]).toMatchObject({
      type: "copy_fixture",
      attrs: { id: "copyblock002", data: { referenceId: "copyblock002" } },
    });
    expect(duplication).toHaveBeenCalledOnce();
  });
});

function makeEditor(
  children: JSONContent[],
  mode: "page" | "slideshow",
  ids: string[],
  mountedBlocks: ResolvedBlockCapabilities = EMPTY_BLOCK_CAPABILITIES,
): Editor {
  const remainingIds = [...ids];
  const capabilities = resolveScaffoldCapabilities({
    blockCapabilities: mountedBlocks.registry.definitions.map((definition) => {
      const duplication = mountedBlocks.duplication.getByNodeType(definition.nodeType);
      return duplication ? { definition, duplication } : { definition };
    }),
    layoutDefinitions: [],
    surfaceDefinitions: surfaceVariants.definitions,
  });
  const editor = new Editor({
    extensions: [
      createScaffoldCapabilitiesStorageExtension(capabilities),
      DocumentNode,
      StarterKit.configure({ document: false, paragraph: false }),
      ExtendedParagraph,
      TestCourseDocumentNode,
      createCourseSectionNode(),
      SurfaceNode,
      RegionNode,
      TestArrangementNode,
      CopyFixtureNode,
      ...createUnavailableContentAuthoringExtensions(),
      UniqueID.configure({ attributeName: "id", types: "all", updateDocument: false }),
      createCourseStructureCommandsExtension({
        createId: () => {
          const id = remainingIds.shift();
          if (!id) throw new Error("unexpected identity allocation");
          return id;
        },
      }),
    ],
    content: document(mode, children),
  });
  editors.push(editor);
  return editor;
}

function runCommand(editor: Editor, command: CourseStructureCommand): boolean {
  return editor.commands.applyCourseStructureCommand(command);
}

function courseChildren(editor: Editor): JSONContent[] {
  return editor.getJSON().content?.[0]?.content ?? [];
}

function childIdentity(editor: Editor): unknown[] {
  return courseChildren(editor).map((node) => node.attrs?.["id"]);
}

function captureNextDocumentChange(editor: Editor): () => Transaction {
  let captured: Transaction | undefined;
  editor.on("transaction", ({ transaction }) => {
    if (transaction.docChanged && !captured) captured = transaction;
  });
  return () => {
    if (!captured) throw new Error("expected one changed transaction");
    return captured;
  };
}

function expectLocalSteps(transaction: Transaction, count: number) {
  expect(transaction.steps).toHaveLength(count);
  const wholeDocumentEnd = transaction.before.firstChild?.nodeSize;
  expect(wholeDocumentEnd).toBeDefined();
  for (const step of transaction.steps) {
    expect(step.toJSON()).not.toMatchObject({ from: 1, to: wholeDocumentEnd! - 1 });
  }
}

function surfaceTextPosition(editor: Editor, surfaceId: string): number {
  const courseDocument = editor.state.doc.firstChild;
  if (!courseDocument) throw new Error("missing courseDocument");
  let position: number | null = null;
  courseDocument.forEach((node, offset) => {
    if (node.type.name === "surface" && node.attrs["id"] === surfaceId) {
      position = 1 + offset + 2;
    }
  });
  if (position === null) throw new Error(`missing Surface ${surfaceId}`);
  return position;
}

function directChildPosition(
  editor: Editor,
  type: "courseSection" | "surface" | "unavailable_surface",
  id: string,
): number {
  const courseDocument = editor.state.doc.firstChild;
  if (!courseDocument) throw new Error("missing courseDocument");
  let position = 1;
  for (let index = 0; index < courseDocument.childCount; index += 1) {
    const node = courseDocument.child(index);
    if (node.type.name === type && node.attrs["id"] === id) return position;
    position += node.nodeSize;
  }
  throw new Error(`missing ${type} ${id}`);
}

function selectedSurfaceId(editor: Editor): string | null {
  const { $anchor } = editor.state.selection;
  for (let depth = $anchor.depth; depth >= 0; depth -= 1) {
    const node = $anchor.node(depth);
    if (node.type.name === "surface") return node.attrs["id"] as string;
  }
  return null;
}

function document(mode: "page" | "slideshow", content: JSONContent[]): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: {
          id: COURSE_ID,
          schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
          mode,
          surfaceSize: mode === "slideshow" ? "16x9" : "fluid",
          overflowMode: "grow",
          theme: createDefaultPersistedCourseTheme(),
        },
        content,
      },
    ],
  };
}

function section(id: string, title: string): JSONContent {
  return { type: "courseSection", attrs: { id, title } };
}

function surface(
  id: string,
  content: JSONContent[] = [{ type: "paragraph" }],
  variant = "test-slide",
): JSONContent {
  return {
    type: "surface",
    attrs: { id, title: null, variant, settings: {}, notes: null },
    content,
  };
}

function unavailableSurface(id: string): JSONContent {
  return {
    type: "unavailable_surface",
    attrs: {
      id,
      capabilityId: "plus-interactive-slide",
      original: {
        type: "surface",
        attrs: {
          id,
          variant: "plus-interactive-slide",
          settings: { privateMode: "guided" },
        },
        content: [
          {
            type: "plus_private_content",
            attrs: { referenceId: "private00001" },
          },
        ],
      },
    },
  };
}

function paragraph(text: string): JSONContent[] {
  return [{ type: "paragraph", content: [{ type: "text", text }] }];
}
