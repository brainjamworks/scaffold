// @vitest-environment happy-dom

import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { Editor, Node, type JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import StarterKit from "@tiptap/starter-kit";
import { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { DocumentNode, CourseDocumentNode, createCourseSectionNode } from "@/document/model/nodes";
import { ARRANGEMENT_CONTENT } from "@/document/model/content-model/content-groups";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import { createSurfaceVariantRegistry } from "@/editor/surfaces/model/surface-variant-registry";
import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";
import { createScaffoldDefaultTheme } from "@/theme/model";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import { defineBlock } from "@/editor/blocks/block-definition";

import {
  createCourseStructureModule,
  type CourseStructureTransactionResult,
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

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("CourseStructureModule.buildTransaction Course Sections", () => {
  it("starts at the first Surface or creates two authored sections away from the first", () => {
    const firstEditor = makeEditor([surface(SURFACE_1), surface(SURFACE_2)]);
    const firstModule = moduleWithIds(["newsect_0001"]);
    const first = succeed(
      firstModule.buildTransaction(firstEditor.state, {
        type: "course-section.start",
        atSurfaceId: SURFACE_1,
        title: "  Introduction  ",
      }),
    );

    expect(first.next).toMatchObject({
      sectioning: "course-sections",
      courseSections: [{ id: "newsect_0001", title: "Introduction", surfaceIds: [SURFACE_1, SURFACE_2] }],
    });
    expect(firstEditor.getJSON().content?.[0]?.content?.[0]?.type).toBe("surface");

    const laterEditor = makeEditor([surface(SURFACE_1), surface(SURFACE_2), surface(SURFACE_3)]);
    const laterModule = moduleWithIds(["leading_0001", "latersec0001"]);
    const later = succeed(
      laterModule.buildTransaction(laterEditor.state, {
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
  });

  it("requires a leading title, splits a section and rejects an existing start", () => {
    const unsectioned = makeEditor([surface(SURFACE_1), surface(SURFACE_2)]);
    expect(
      moduleWithIds([]).buildTransaction(unsectioned.state, {
        type: "course-section.start",
        atSurfaceId: SURFACE_2,
        title: "Later",
      }),
    ).toMatchObject({ ok: false, issue: { code: "leading_section_title_required" } });

    const sectioned = makeEditor([
      section(SECTION_1, "One"),
      surface(SURFACE_1),
      surface(SURFACE_2),
    ]);
    const courseStructure = moduleWithIds(["splitsec0001"]);
    const split = succeed(
      courseStructure.buildTransaction(sectioned.state, {
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
      courseStructure.buildTransaction(sectioned.state, {
        type: "course-section.start",
        atSurfaceId: SURFACE_1,
        title: "Duplicate start",
      }),
    ).toMatchObject({ ok: false, issue: { code: "section_already_starts_at_surface" } });
  });

  it("renames with normalized titles and reports no change", () => {
    const editor = makeEditor([section(SECTION_1, "One"), surface(SURFACE_1)]);
    const courseStructure = moduleWithIds([]);
    const renamed = succeed(
      courseStructure.buildTransaction(editor.state, {
        type: "course-section.rename",
        courseSectionId: SECTION_1,
        title: "  Introduction  ",
      }),
    );

    expect(renamed.next.courseSections[0]).toMatchObject({ id: SECTION_1, title: "Introduction" });
    expect(
      courseStructure.buildTransaction(editor.state, {
        type: "course-section.rename",
        courseSectionId: SECTION_1,
        title: "One",
      }),
    ).toMatchObject({ ok: false, issue: { code: "no_change" } });
  });

  it("applies each deterministic remove-and-merge rule without deleting Surfaces", () => {
    const sole = succeed(
      moduleWithIds([]).buildTransaction(
        makeEditor([section(SECTION_1, "One"), surface(SURFACE_1), surface(SURFACE_2)]).state,
        { type: "course-section.remove", courseSectionId: SECTION_1 },
      ),
    );
    expect(sole.next).toMatchObject({ sectioning: "none", surfaceIds: [SURFACE_1, SURFACE_2] });

    const nonFirst = succeed(
      moduleWithIds([]).buildTransaction(
        makeEditor([
          section(SECTION_1, "One"),
          surface(SURFACE_1),
          section(SECTION_2, "Two"),
          surface(SURFACE_2),
        ]).state,
        { type: "course-section.remove", courseSectionId: SECTION_2 },
      ),
    );
    expect(nonFirst.next.courseSections).toEqual([
      expect.objectContaining({ id: SECTION_1, surfaceIds: [SURFACE_1, SURFACE_2] }),
    ]);

    const first = succeed(
      moduleWithIds([]).buildTransaction(
        makeEditor([
          section(SECTION_1, "One"),
          surface(SURFACE_1),
          section(SECTION_2, "Two"),
          surface(SURFACE_2),
        ]).state,
        { type: "course-section.remove", courseSectionId: SECTION_1 },
      ),
    );
    expect(first.next.courseSections).toEqual([
      expect.objectContaining({ id: SECTION_2, surfaceIds: [SURFACE_1, SURFACE_2] }),
    ]);
  });

  it("moves a complete section, reports effective no-change and rejects self destinations", () => {
    const editor = makeEditor([
      section(SECTION_1, "One"),
      surface(SURFACE_1),
      section(SECTION_2, "Two"),
      surface(SURFACE_2),
      section(SECTION_3, "Three"),
      surface(SURFACE_3),
    ]);
    const courseStructure = moduleWithIds([]);
    const moved = succeed(
      courseStructure.buildTransaction(editor.state, {
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
    expect(
      courseStructure.buildTransaction(editor.state, {
        type: "course-section.move",
        courseSectionId: SECTION_1,
        beforeCourseSectionId: SECTION_2,
      }),
    ).toMatchObject({ ok: false, issue: { code: "no_change" } });
    expect(
      courseStructure.buildTransaction(editor.state, {
        type: "course-section.move",
        courseSectionId: SECTION_1,
        beforeCourseSectionId: SECTION_1,
      }),
    ).toMatchObject({ ok: false, issue: { code: "invalid_destination" } });
  });

  it("duplicates one complete section with one coordinated fresh identity set", () => {
    const editor = makeEditor([
      section(SECTION_1, "One"),
      surface(SURFACE_1),
      surface(SURFACE_2),
      section(SECTION_2, "Two"),
      surface(SURFACE_3),
    ]);
    const courseStructure = moduleWithIds(["copysect0001", "copysurf0001", "copysurf0002"]);
    const result = succeed(
      courseStructure.buildTransaction(editor.state, {
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
  });
});

describe("CourseStructureModule.buildTransaction Surfaces", () => {
  it("inserts and duplicates Surfaces at stable destinations", () => {
    const editor = makeEditor([
      section(SECTION_1, "One"),
      surface(SURFACE_1),
      section(SECTION_2, "Two"),
      surface(SURFACE_2),
    ]);
    const insertedNode = editor.schema.nodeFromJSON(surface(SURFACE_3));
    const inserted = succeed(
      moduleWithIds([]).buildTransaction(editor.state, {
        type: "surface.insert",
        surface: insertedNode,
        destination: { beforeSurfaceId: SURFACE_2 },
      }),
    );
    expect(inserted.next.courseSections).toMatchObject([
      { id: SECTION_1, surfaceIds: [SURFACE_1] },
      { id: SECTION_2, surfaceIds: [SURFACE_3, SURFACE_2] },
    ]);

    const duplicated = succeed(
      moduleWithIds(["dupesurf0001"]).buildTransaction(editor.state, {
        type: "surface.duplicate",
        surfaceId: SURFACE_1,
      }),
    );
    expect(duplicated.next.courseSections[0]).toMatchObject({
      id: SECTION_1,
      surfaceIds: [SURFACE_1, "dupesurf0001"],
    });
  });

  it("lets a mounted Block repair its private identity when its Surface is duplicated", () => {
    const rewriteCopiedContent = vi.fn(({ content, nodeIdChanges }) => {
      const data = content.attrs?.["data"];
      const referenceId =
        data && typeof data === "object" && "referenceId" in data
          ? data.referenceId
          : undefined;
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
    const editor = makeEditor([
      surface(SURFACE_1, [
        { type: "copy_fixture", attrs: { id: BLOCK_1, data: { referenceId: BLOCK_1 } } },
      ], "test-flex-slide"),
    ]);

    const result = succeed(
      moduleWithIds(["copysurf0001", "copyblock002"], mountedBlocks).buildTransaction(
        editor.state,
        { type: "surface.duplicate", surfaceId: SURFACE_1 },
      ),
    );
    const copiedBlock = result.transaction.doc.toJSON().content?.[0]?.content?.[1]?.content?.[0];

    expect(rewriteCopiedContent).toHaveBeenCalledOnce();
    expect(copiedBlock).toMatchObject({
      type: "copy_fixture",
      attrs: { id: "copyblock002", data: { referenceId: "copyblock002" } },
    });
  });

  it.each([SURFACE_1, SURFACE_2, SURFACE_3])(
    "deletes a singleton section boundary with %s",
    (surfaceId) => {
      const editor = makeEditor([
        section(SECTION_1, "One"),
        surface(SURFACE_1),
        section(SECTION_2, "Two"),
        surface(SURFACE_2),
        section(SECTION_3, "Three"),
        surface(SURFACE_3),
      ]);

      const result = succeed(
        moduleWithIds([]).buildTransaction(editor.state, { type: "surface.delete", surfaceId }),
      );

      expect(result.next.surfaceIds).not.toContain(surfaceId);
      expect(result.next.courseSections).toHaveLength(2);
      expect(result.next.courseSections.flatMap((item) => item.surfaceIds)).toEqual(
        result.next.surfaceIds,
      );
    },
  );

  it("moves a Surface across sections and removes a vacated singleton boundary", () => {
    const editor = makeEditor([
      section(SECTION_1, "One"),
      surface(SURFACE_1),
      section(SECTION_2, "Two"),
      surface(SURFACE_2),
      surface(SURFACE_3),
    ]);
    const result = succeed(
      moduleWithIds([]).buildTransaction(editor.state, {
        type: "surface.move",
        surfaceId: SURFACE_1,
        destination: { afterSurfaceId: SURFACE_2 },
      }),
    );

    expect(result.next.courseSections).toMatchObject([
      { id: SECTION_2, surfaceIds: [SURFACE_2, SURFACE_1, SURFACE_3] },
    ]);
  });

  it("rejects the last-Surface delete, stale targets, invalid destinations and no-op moves", () => {
    const one = makeEditor([surface(SURFACE_1)]);
    expect(
      moduleWithIds([]).buildTransaction(one.state, {
        type: "surface.delete",
        surfaceId: SURFACE_1,
      }),
    ).toMatchObject({ ok: false, issue: { code: "cannot_delete_last_surface" } });

    const two = makeEditor([surface(SURFACE_1), surface(SURFACE_2)]);
    const courseStructure = moduleWithIds([]);
    expect(
      courseStructure.buildTransaction(two.state, {
        type: "surface.delete",
        surfaceId: SURFACE_4,
      }),
    ).toMatchObject({ ok: false, issue: { code: "target_not_found" } });
    expect(
      courseStructure.buildTransaction(two.state, {
        type: "surface.move",
        surfaceId: SURFACE_1,
        destination: { beforeSurfaceId: SURFACE_4 },
      }),
    ).toMatchObject({ ok: false, issue: { code: "invalid_destination" } });
    expect(
      courseStructure.buildTransaction(two.state, {
        type: "surface.move",
        surfaceId: SURFACE_1,
        destination: { beforeSurfaceId: SURFACE_2 },
      }),
    ).toMatchObject({ ok: false, issue: { code: "no_change" } });
    expect(
      courseStructure.buildTransaction(two.state, {
        type: "surface.move",
        surfaceId: SURFACE_1,
        destination: { afterSurfaceId: SURFACE_1 },
      }),
    ).toMatchObject({ ok: false, issue: { code: "invalid_destination" } });
  });

  it("rejects invalid source documents and Page structural commands", () => {
    const page = makeEditor([surface(SURFACE_1)], "page");
    expect(
      moduleWithIds([]).buildTransaction(page.state, {
        type: "surface.delete",
        surfaceId: SURFACE_1,
      }),
    ).toMatchObject({ ok: false, issue: { code: "unsupported_mode" } });

    const valid = makeEditor([surface(SURFACE_1), surface(SURFACE_2)]);
    const invalidState = valid.state.apply(valid.state.tr.setNodeAttribute(1, "id", SURFACE_2));
    expect(
      moduleWithIds([]).buildTransaction(invalidState, {
        type: "surface.delete",
        surfaceId: SURFACE_1,
      }),
    ).toMatchObject({ ok: false, issue: { code: "invalid_source_document" } });
  });
});

function moduleWithIds(ids: string[], mountedBlocks = blockDefinitions) {
  const remaining = [...ids];
  return createCourseStructureModule({
    blockDefinitions: mountedBlocks,
    surfaceVariants,
    createId: () => {
      const id = remaining.shift();
      if (!id) throw new Error("unexpected identity allocation");
      return id;
    },
  });
}

function succeed(result: CourseStructureTransactionResult) {
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
): Editor {
  const editor = new Editor({
    extensions: [
      DocumentNode,
      StarterKit.configure({ document: false, paragraph: false, undoRedo: false }),
      ExtendedParagraph,
      CourseDocumentNode,
      createCourseSectionNode(),
      SurfaceNode,
      RegionNode,
      TestArrangementNode,
      CopyFixtureNode,
      UniqueID.configure({ attributeName: "id", types: "all", updateDocument: false }),
    ],
    content: document(mode, children),
  });
  editors.push(editor);
  return editor;
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
