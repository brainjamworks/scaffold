// @vitest-environment happy-dom

import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { Editor, Node, type JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import StarterKit from "@tiptap/starter-kit";
import type { Transaction } from "@tiptap/pm/state";
import { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { DocumentNode, CourseDocumentNode, createCourseSectionNode } from "@/document/model/nodes";
import { ARRANGEMENT_CONTENT } from "@/document/model/content-model/content-groups";
import { createScaffoldCapabilitiesStorageExtension } from "@/composition/extensions/scaffold-capabilities-storage";
import { createCourseStructureCommandsExtension } from "@/document/authoring/course-structure-commands";
import { createLayoutRegistry } from "@/editor/arrangements/layout/model/layout-registry";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { isNodeSelection } from "@/editor/selection/selection-facts";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import { createSurfaceVariantRegistry } from "@/editor/surfaces/model/surface-variant-registry";
import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";
import { createScaffoldDefaultTheme } from "@/theme/model";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import { defineBlock } from "@/editor/blocks/block-definition";

import {
  createCourseStructureModule,
  type CourseStructureCommand,
  type CourseStructureCommandResult,
  type CourseStructureModule,
} from "./index";

const COURSE_ID = EmbeddedNodeIdSchema.parse("course000001");
const SURFACE_1 = EmbeddedNodeIdSchema.parse("surface00001");
const SURFACE_2 = EmbeddedNodeIdSchema.parse("surface00002");
const SURFACE_3 = EmbeddedNodeIdSchema.parse("surface00003");
const SURFACE_4 = EmbeddedNodeIdSchema.parse("surface00004");
const SECTION_1 = EmbeddedNodeIdSchema.parse("section00001");
const SECTION_2 = EmbeddedNodeIdSchema.parse("section00002");
const SECTION_3 = EmbeddedNodeIdSchema.parse("section00003");
const BLOCK_1 = EmbeddedNodeIdSchema.parse("copyblock001");
const editors: Editor[] = [];
const blockDefinitions = createBlockRegistry([]);
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

interface CommandFixture {
  readonly courseStructure: CourseStructureModule;
  readonly createId: () => string;
}

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("Course Structure Tiptap command seam", () => {
  it("renames through Tiptap's active transaction with one local attribute step", () => {
    const courseStructure = moduleWithIds([]);
    const editor = makeEditor(
      [
        section(SECTION_1, "One"),
        surface(SURFACE_1, [{ type: "paragraph", content: [{ type: "text", text: "Alpha" }] }]),
      ],
      "slideshow",
      courseStructure,
    );
    let dispatched: Transaction | undefined;
    let outcome: CourseStructureCommandResult | undefined;
    editor.on("transaction", ({ transaction }) => {
      if (transaction.docChanged) dispatched = transaction;
    });

    const handled = editor
      .chain()
      .setTextSelection(4)
      .applyCourseStructureCommand(
        {
          type: "course-section.rename",
          courseSectionId: SECTION_1,
          title: "Introduction",
        },
        (result) => {
          outcome = result;
        },
      )
      .run();

    expect(handled).toBe(true);
    expect(outcome).toMatchObject({
      ok: true,
      next: { courseSections: [{ id: SECTION_1, title: "Introduction" }] },
    });
    expect(dispatched?.steps.map((step) => step.toJSON())).toEqual([
      expect.objectContaining({ stepType: "attr", pos: 1, attr: "title" }),
    ]);
    expect(editor.state.selection.anchor).toBe(4);
  });
});

describe("Course Structure Tiptap commands for Course Sections", () => {
  it("starts at the first Surface or creates two authored sections away from the first", () => {
    const firstModule = moduleWithIds(["newsect_0001"]);
    const firstEditor = makeEditor(
      [surface(SURFACE_1), surface(SURFACE_2)],
      "slideshow",
      firstModule,
    );
    const firstTransaction = captureNextDocumentChange(firstEditor);
    const first = succeed(
      runCommand(firstEditor, {
        type: "course-section.start",
        atSurfaceId: SURFACE_1,
        title: "  Introduction  ",
      }),
    );

    expect(first.next).toMatchObject({
      sectioning: "course-sections",
      courseSections: [
        { id: "newsect_0001", title: "Introduction", surfaceIds: [SURFACE_1, SURFACE_2] },
      ],
    });
    expect(firstEditor.getJSON().content?.[0]?.content?.[0]?.type).toBe("courseSection");
    expectLocalSteps(firstTransaction(), 1);

    const laterModule = moduleWithIds(["leading_0001", "latersec0001"]);
    const laterEditor = makeEditor(
      [surface(SURFACE_1), surface(SURFACE_2), surface(SURFACE_3)],
      "slideshow",
      laterModule,
    );
    const laterTransaction = captureNextDocumentChange(laterEditor);
    const later = succeed(
      runCommand(laterEditor, {
        type: "course-section.start",
        atSurfaceId: SURFACE_2,
        title: "Later",
        leadingTitle: "Leading",
      }),
    );

    expect(later.next).toMatchObject({
      courseSections: [
        { id: "leading_0001", title: "Leading", surfaceIds: [SURFACE_1] },
        { id: "latersec0001", title: "Later", surfaceIds: [SURFACE_2, SURFACE_3] },
      ],
    });
    expectLocalSteps(laterTransaction(), 2);
  });

  it("requires a leading title, splits a section and rejects an existing start", () => {
    const unsectionedModule = moduleWithIds([]);
    const unsectioned = makeEditor(
      [surface(SURFACE_1), surface(SURFACE_2)],
      "slideshow",
      unsectionedModule,
    );
    expect(
      runCommand(unsectioned, {
        type: "course-section.start",
        atSurfaceId: SURFACE_2,
        title: "Later",
      }),
    ).toMatchObject({ ok: false, issue: { code: "leading_section_title_required" } });

    const courseStructure = moduleWithIds(["splitsec0001"]);
    const sectioned = makeEditor(
      [section(SECTION_1, "One"), surface(SURFACE_1), surface(SURFACE_2)],
      "slideshow",
      courseStructure,
    );
    const split = succeed(
      runCommand(sectioned, {
        type: "course-section.start",
        atSurfaceId: SURFACE_2,
        title: "Two",
      }),
    );

    expect(split.next).toMatchObject({
      courseSections: [
        { id: SECTION_1, surfaceIds: [SURFACE_1] },
        { id: "splitsec0001", surfaceIds: [SURFACE_2] },
      ],
    });
    expect(
      runCommand(sectioned, {
        type: "course-section.start",
        atSurfaceId: SURFACE_1,
        title: "Duplicate start",
      }),
    ).toMatchObject({ ok: false, issue: { code: "section_already_starts_at_surface" } });
  });

  it("renames with normalized titles and reports no change", () => {
    const courseStructure = moduleWithIds([]);
    const editor = makeEditor(
      [section(SECTION_1, "One"), surface(SURFACE_1)],
      "slideshow",
      courseStructure,
    );
    const renamed = succeed(
      runCommand(editor, {
        type: "course-section.rename",
        courseSectionId: SECTION_1,
        title: "  Introduction  ",
      }),
    );

    expect(renamed.next.courseSections[0]).toMatchObject({ id: SECTION_1, title: "Introduction" });
    expect(
      runCommand(editor, {
        type: "course-section.rename",
        courseSectionId: SECTION_1,
        title: "Introduction",
      }),
    ).toMatchObject({ ok: false, issue: { code: "no_change" } });
  });

  it("applies each deterministic remove-and-merge rule without deleting Surfaces", () => {
    const soleModule = moduleWithIds([]);
    const soleEditor = makeEditor(
      [section(SECTION_1, "One"), surface(SURFACE_1), surface(SURFACE_2)],
      "slideshow",
      soleModule,
    );
    const soleTransaction = captureNextDocumentChange(soleEditor);
    const sole = succeed(
      runCommand(soleEditor, { type: "course-section.remove", courseSectionId: SECTION_1 }),
    );
    expect(sole.next).toMatchObject({ sectioning: "none", surfaceIds: [SURFACE_1, SURFACE_2] });
    expectLocalSteps(soleTransaction(), 1);

    const nonFirstModule = moduleWithIds([]);
    const nonFirstEditor = makeEditor(
      [
        section(SECTION_1, "One"),
        surface(SURFACE_1),
        section(SECTION_2, "Two"),
        surface(SURFACE_2),
      ],
      "slideshow",
      nonFirstModule,
    );
    const nonFirstTransaction = captureNextDocumentChange(nonFirstEditor);
    const nonFirst = succeed(
      runCommand(nonFirstEditor, {
        type: "course-section.remove",
        courseSectionId: SECTION_2,
      }),
    );
    expect(nonFirst.next.courseSections).toEqual([
      expect.objectContaining({ id: SECTION_1, surfaceIds: [SURFACE_1, SURFACE_2] }),
    ]);
    expectLocalSteps(nonFirstTransaction(), 1);

    const firstModule = moduleWithIds([]);
    const firstEditor = makeEditor(
      [
        section(SECTION_1, "One"),
        surface(SURFACE_1),
        section(SECTION_2, "Two"),
        surface(SURFACE_2),
      ],
      "slideshow",
      firstModule,
    );
    const firstTransaction = captureNextDocumentChange(firstEditor);
    const first = succeed(
      runCommand(firstEditor, { type: "course-section.remove", courseSectionId: SECTION_1 }),
    );
    expect(first.next.courseSections).toEqual([
      expect.objectContaining({ id: SECTION_2, surfaceIds: [SURFACE_1, SURFACE_2] }),
    ]);
    expectLocalSteps(firstTransaction(), 2);
  });

  it("moves a complete section, reports effective no-change and rejects self destinations", () => {
    const courseStructure = moduleWithIds([]);
    const children = [
      section(SECTION_1, "One"),
      surface(SURFACE_1),
      section(SECTION_2, "Two"),
      surface(SURFACE_2),
      section(SECTION_3, "Three"),
      surface(SURFACE_3),
    ];
    const editor = makeEditor(children, "slideshow", courseStructure);
    const moved = succeed(
      runCommand(editor, {
        type: "course-section.move",
        courseSectionId: SECTION_1,
        beforeCourseSectionId: null,
      }),
    );

    expect(moved.next.courseSections.map((item) => item.id)).toEqual([
      SECTION_2,
      SECTION_3,
      SECTION_1,
    ]);
    const noChangeEditor = makeEditor(children, "slideshow", courseStructure);
    expect(
      runCommand(noChangeEditor, {
        type: "course-section.move",
        courseSectionId: SECTION_1,
        beforeCourseSectionId: SECTION_2,
      }),
    ).toMatchObject({ ok: false, issue: { code: "no_change" } });
    const invalidEditor = makeEditor(children, "slideshow", courseStructure);
    expect(
      runCommand(invalidEditor, {
        type: "course-section.move",
        courseSectionId: SECTION_1,
        beforeCourseSectionId: SECTION_1,
      }),
    ).toMatchObject({ ok: false, issue: { code: "invalid_destination" } });
  });

  it("moves a section with local steps, follows its logical selection and undoes atomically", () => {
    const courseStructure = moduleWithIds([]);
    const editor = makeEditor(
      [
        section(SECTION_1, "One"),
        surface(SURFACE_1, [{ type: "paragraph", content: [{ type: "text", text: "Selected" }] }]),
        section(SECTION_2, "Two"),
        surface(SURFACE_2),
        section(SECTION_3, "Three"),
        surface(SURFACE_3),
      ],
      "slideshow",
      courseStructure,
    );
    const before = editor.getJSON();
    editor.commands.setTextSelection(surfaceTextPosition(editor, SURFACE_1));
    const transactions: Transaction[] = [];
    editor.on("transaction", ({ transaction }) => {
      if (transaction.docChanged) transactions.push(transaction);
    });

    const moved = succeed(
      runCommand(editor, {
        type: "course-section.move",
        courseSectionId: SECTION_1,
        beforeCourseSectionId: null,
      }),
    );

    expect(moved.next.courseSections.map((item) => item.id)).toEqual([
      SECTION_2,
      SECTION_3,
      SECTION_1,
    ]);
    expect(transactions[0]?.steps).toHaveLength(2);
    const wholeDocumentEnd = transactions[0]?.before.firstChild?.nodeSize;
    expect(
      transactions[0]?.steps.some((step) => {
        const json = step.toJSON();
        return json.from === 1 && json.to === (wholeDocumentEnd ?? 1) - 1;
      }),
    ).toBe(false);
    expect(selectedSurfaceId(editor)).toBe(SURFACE_1);

    expect(editor.commands.undo()).toBe(true);
    expect(editor.getJSON()).toEqual(before);
    expect(editor.commands.redo()).toBe(true);
    expect(courseStructure.courseStructure.validate(editor.getJSON())).toMatchObject({
      ok: true,
      value: { courseSections: [{ id: SECTION_2 }, { id: SECTION_3 }, { id: SECTION_1 }] },
    });
  });

  it("keeps a boundary NodeSelection on the same section across a local move", () => {
    const editor = makeEditor(
      [
        section(SECTION_1, "One"),
        surface(SURFACE_1),
        section(SECTION_2, "Two"),
        surface(SURFACE_2),
      ],
      "slideshow",
      moduleWithIds([]),
    );
    editor.commands.setNodeSelection(directChildPosition(editor, "courseSection", SECTION_2));

    succeed(
      runCommand(editor, {
        type: "course-section.move",
        courseSectionId: SECTION_2,
        beforeCourseSectionId: SECTION_1,
      }),
    );

    expect(editor.state.selection.from).toBe(
      directChildPosition(editor, "courseSection", SECTION_2),
    );
    expect(isNodeSelection(editor.state.selection)).toBe(true);
    if (!isNodeSelection(editor.state.selection)) throw new Error("expected a NodeSelection");
    expect(editor.state.selection.node.attrs["id"]).toBe(SECTION_2);
  });

  it("duplicates one complete section with one coordinated fresh identity set", () => {
    const courseStructure = moduleWithIds(["copysect0001", "copysurf0001", "copysurf0002"]);
    const editor = makeEditor(
      [
        section(SECTION_1, "One"),
        surface(SURFACE_1),
        surface(SURFACE_2),
        section(SECTION_2, "Two"),
        surface(SURFACE_3),
      ],
      "slideshow",
      courseStructure,
    );
    const transaction = captureNextDocumentChange(editor);
    const result = succeed(
      runCommand(editor, {
        type: "course-section.duplicate",
        courseSectionId: SECTION_1,
      }),
    );

    expect(result.next.courseSections).toMatchObject([
      { id: SECTION_1, surfaceIds: [SURFACE_1, SURFACE_2] },
      { id: "copysect0001", title: "One", surfaceIds: ["copysurf0001", "copysurf0002"] },
      { id: SECTION_2, surfaceIds: [SURFACE_3] },
    ]);
    expect(result.next.surfaceIds).toEqual([
      SURFACE_1,
      SURFACE_2,
      "copysurf0001",
      "copysurf0002",
      SURFACE_3,
    ]);
    expectLocalSteps(transaction(), 1);
  });
});

describe("Course Structure Tiptap commands for Surfaces", () => {
  it("inserts and duplicates Surfaces at stable destinations", () => {
    const children = [
      section(SECTION_1, "One"),
      surface(SURFACE_1),
      section(SECTION_2, "Two"),
      surface(SURFACE_2),
    ];
    const insertModule = moduleWithIds([]);
    const editor = makeEditor(children, "slideshow", insertModule);
    const insertTransaction = captureNextDocumentChange(editor);
    const insertedNode = editor.schema.nodeFromJSON(surface(SURFACE_3));
    const inserted = succeed(
      runCommand(editor, {
        type: "surface.insert",
        surface: insertedNode,
        destination: { beforeSurfaceId: SURFACE_2 },
      }),
    );
    expect(inserted.next.courseSections).toMatchObject([
      { id: SECTION_1, surfaceIds: [SURFACE_1] },
      { id: SECTION_2, surfaceIds: [SURFACE_3, SURFACE_2] },
    ]);
    expectLocalSteps(insertTransaction(), 1);

    const duplicateModule = moduleWithIds(["dupesurf0001"]);
    const duplicateEditor = makeEditor(children, "slideshow", duplicateModule);
    const duplicateTransaction = captureNextDocumentChange(duplicateEditor);
    const duplicated = succeed(
      runCommand(duplicateEditor, { type: "surface.duplicate", surfaceId: SURFACE_1 }),
    );
    expect(duplicated.next.courseSections[0]).toMatchObject({
      id: SECTION_1,
      surfaceIds: [SURFACE_1, "dupesurf0001"],
    });
    expectLocalSteps(duplicateTransaction(), 1);
  });

  it("lets a mounted Block repair its private identity when its Surface is duplicated", () => {
    const rewriteCopiedContent = vi.fn(({ content, nodeIdChanges }) => {
      const data = content.attrs?.["data"];
      const referenceId =
        data && typeof data === "object" && "referenceId" in data ? data.referenceId : undefined;
      const replacement =
        typeof referenceId === "string"
          ? nodeIdChanges.get(EmbeddedNodeIdSchema.parse(referenceId))
          : undefined;

      return replacement
        ? {
            ...content,
            attrs: { ...content.attrs, data: { ...data, referenceId: replacement } },
          }
        : content;
    });
    const mountedBlocks = createBlockRegistry([
      defineBlock({ nodeType: "copy_fixture", rewriteCopiedContent }),
    ]);
    const courseStructure = moduleWithIds(["copysurf0001", "copyblock002"]);
    const editor = makeEditor(
      [
        surface(
          SURFACE_1,
          [{ type: "copy_fixture", attrs: { id: BLOCK_1, data: { referenceId: BLOCK_1 } } }],
          "test-flex-slide",
        ),
      ],
      "slideshow",
      courseStructure,
      mountedBlocks,
    );

    succeed(runCommand(editor, { type: "surface.duplicate", surfaceId: SURFACE_1 }));
    const courseDocument = editor.getJSON().content?.[0] as JSONContent | undefined;
    const copiedSurface = courseDocument?.content?.[1] as JSONContent | undefined;
    const copiedBlock = copiedSurface?.content?.[0];

    expect(rewriteCopiedContent).toHaveBeenCalledOnce();
    expect(copiedBlock).toMatchObject({
      type: "copy_fixture",
      attrs: { id: "copyblock002", data: { referenceId: "copyblock002" } },
    });
  });

  it.each([SURFACE_1, SURFACE_2, SURFACE_3])(
    "deletes a singleton section boundary with %s",
    (surfaceId) => {
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
        moduleWithIds([]),
      );

      const result = succeed(runCommand(editor, { type: "surface.delete", surfaceId }));

      expect(result.next.surfaceIds).not.toContain(surfaceId);
      expect(result.next.courseSections).toHaveLength(2);
      expect(result.next.courseSections.flatMap((item) => item.surfaceIds)).toEqual(
        result.next.surfaceIds,
      );
    },
  );

  it("deletes a singleton with one local range and selects the following Surface", () => {
    const editor = makeEditor(
      [
        section(SECTION_1, "One"),
        surface(SURFACE_1),
        section(SECTION_2, "Two"),
        surface(SURFACE_2, [{ type: "paragraph", content: [{ type: "text", text: "Delete me" }] }]),
        section(SECTION_3, "Three"),
        surface(SURFACE_3, [{ type: "paragraph", content: [{ type: "text", text: "Following" }] }]),
      ],
      "slideshow",
      moduleWithIds([]),
    );
    editor.commands.setTextSelection(surfaceTextPosition(editor, SURFACE_2));
    const transaction = captureNextDocumentChange(editor);

    succeed(runCommand(editor, { type: "surface.delete", surfaceId: SURFACE_2 }));

    expect(transaction().steps).toHaveLength(1);
    expect(transaction().steps[0]?.toJSON()).toMatchObject({ stepType: "replace" });
    expect(selectedSurfaceId(editor)).toBe(SURFACE_3);
  });

  it("moves a Surface across sections and removes a vacated singleton boundary", () => {
    const editor = makeEditor(
      [
        section(SECTION_1, "One"),
        surface(SURFACE_1),
        section(SECTION_2, "Two"),
        surface(SURFACE_2),
        surface(SURFACE_3),
      ],
      "slideshow",
      moduleWithIds([]),
    );
    const transaction = captureNextDocumentChange(editor);
    const result = succeed(
      runCommand(editor, {
        type: "surface.move",
        surfaceId: SURFACE_1,
        destination: { afterSurfaceId: SURFACE_2 },
      }),
    );

    expect(result.next.courseSections).toMatchObject([
      { id: SECTION_2, surfaceIds: [SURFACE_2, SURFACE_1, SURFACE_3] },
    ]);
    expectLocalSteps(transaction(), 2);
  });

  it("rejects the last-Surface delete, stale targets, invalid destinations and no-op moves", () => {
    const one = makeEditor([surface(SURFACE_1)], "slideshow", moduleWithIds([]));
    expect(runCommand(one, { type: "surface.delete", surfaceId: SURFACE_1 })).toMatchObject({
      ok: false,
      issue: { code: "cannot_delete_last_surface" },
    });

    const two = makeEditor(
      [surface(SURFACE_1), surface(SURFACE_2)],
      "slideshow",
      moduleWithIds([]),
    );
    expect(runCommand(two, { type: "surface.delete", surfaceId: SURFACE_4 })).toMatchObject({
      ok: false,
      issue: { code: "target_not_found" },
    });
    expect(
      runCommand(two, {
        type: "surface.move",
        surfaceId: SURFACE_1,
        destination: { beforeSurfaceId: SURFACE_4 },
      }),
    ).toMatchObject({ ok: false, issue: { code: "invalid_destination" } });
    expect(
      runCommand(two, {
        type: "surface.move",
        surfaceId: SURFACE_1,
        destination: { beforeSurfaceId: SURFACE_2 },
      }),
    ).toMatchObject({ ok: false, issue: { code: "no_change" } });
    expect(
      runCommand(two, {
        type: "surface.move",
        surfaceId: SURFACE_1,
        destination: { afterSurfaceId: SURFACE_1 },
      }),
    ).toMatchObject({ ok: false, issue: { code: "invalid_destination" } });
  });

  it("rejects invalid source documents and Page structural commands without dispatching", () => {
    const page = makeEditor([surface(SURFACE_1)], "page", moduleWithIds([]));
    const pageTransactions = vi.fn();
    page.on("transaction", pageTransactions);
    expect(runCommand(page, { type: "surface.delete", surfaceId: SURFACE_1 })).toMatchObject({
      ok: false,
      issue: { code: "unsupported_mode" },
    });
    expect(pageTransactions).not.toHaveBeenCalled();

    const valid = makeEditor(
      [surface(SURFACE_1), surface(SURFACE_2)],
      "slideshow",
      moduleWithIds([]),
    );
    valid.view.updateState(valid.state.apply(valid.state.tr.setNodeAttribute(1, "id", SURFACE_2)));
    expect(runCommand(valid, { type: "surface.delete", surfaceId: SURFACE_1 })).toMatchObject({
      ok: false,
      issue: { code: "invalid_source_document" },
    });
  });
});

function moduleWithIds(ids: string[]) {
  const remaining = [...ids];
  return {
    courseStructure: createCourseStructureModule({ surfaceVariants }),
    createId: () => {
      const id = remaining.shift();
      if (!id) throw new Error("unexpected identity allocation");
      return id;
    },
  } satisfies CommandFixture;
}

function runCommand(editor: Editor, command: CourseStructureCommand): CourseStructureCommandResult {
  let outcome: CourseStructureCommandResult | undefined;
  const handled = editor.commands.applyCourseStructureCommand(command, (result) => {
    outcome = result;
  });
  if (!outcome) throw new Error("Course Structure command did not report an outcome");
  expect(handled).toBe(outcome.ok);
  return outcome;
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

function succeed(result: CourseStructureCommandResult) {
  if (!result.ok) {
    throw new Error(
      `expected transaction success, received ${result.issue.code}: ${result.issue.message}`,
    );
  }
  return result;
}

function makeEditor(
  children: JSONContent[],
  mode: "page" | "slideshow" = "slideshow",
  fixture?: CommandFixture,
  mountedBlocks = blockDefinitions,
): Editor {
  const capabilities = Object.freeze({
    blocks: Object.freeze({ registry: mountedBlocks }),
    layouts: Object.freeze({ registry: createLayoutRegistry([]) }),
    surfaces: Object.freeze({ registry: surfaceVariants }),
  });
  const editor = new Editor({
    extensions: [
      createScaffoldCapabilitiesStorageExtension(capabilities),
      DocumentNode,
      StarterKit.configure({ document: false, paragraph: false }),
      ExtendedParagraph,
      CourseDocumentNode,
      createCourseSectionNode(),
      SurfaceNode,
      RegionNode,
      TestArrangementNode,
      CopyFixtureNode,
      UniqueID.configure({ attributeName: "id", types: "all", updateDocument: false }),
      ...(fixture
        ? [
            createCourseStructureCommandsExtension({
              courseStructure: fixture.courseStructure,
              createId: fixture.createId,
            }),
          ]
        : []),
    ],
    content: document(mode, children),
  });
  editors.push(editor);
  return editor;
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
  type: "courseSection" | "surface",
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
          theme: createScaffoldDefaultTheme(),
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
