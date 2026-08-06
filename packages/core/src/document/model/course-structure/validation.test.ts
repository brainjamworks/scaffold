import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";
import { z } from "zod";
import { describe, expect, it } from "vite-plus/test";

import { createSurfaceVariantRegistry } from "@/editor/surfaces/model/surface-variant-registry";
import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";
import { createScaffoldDefaultTheme } from "@/theme/model";
import { createBlockRegistry } from "@/editor/blocks/block-registry";

import { createCourseStructureModule } from "./index";

const COURSE_ID = EmbeddedNodeIdSchema.parse("course000001");
const PAGE_ID = EmbeddedNodeIdSchema.parse("page_0000001");
const SURFACE_1 = EmbeddedNodeIdSchema.parse("surface00001");
const SURFACE_2 = EmbeddedNodeIdSchema.parse("surface00002");
const SURFACE_3 = EmbeddedNodeIdSchema.parse("surface00003");
const SECTION_1 = EmbeddedNodeIdSchema.parse("section00001");
const SECTION_2 = EmbeddedNodeIdSchema.parse("section00002");

const surfaceVariants = createSurfaceVariantRegistry([
  {
    id: "test-page",
    modes: ["page"],
    defaultForModes: ["page"],
    title: "Test page",
    description: "Course Structure page fixture.",
    settingsSchema: z.object({}).strict(),
    createSurface: ({ surfaceId }) => surface(surfaceId, "test-page"),
  },
  {
    id: "test-slide",
    modes: ["slideshow"],
    defaultForModes: ["slideshow"],
    title: "Test slide",
    description: "Course Structure slideshow fixture.",
    settingsSchema: z.object({ density: z.number().default(1) }).strict(),
    structurePolicy: { fixedChildren: [{ type: "paragraph" }] },
    createSurface: ({ surfaceId }) => surface(surfaceId, "test-slide", { density: 1 }),
  },
  {
    id: "test-fixed-attribute",
    modes: ["slideshow"],
    title: "Fixed attribute test slide",
    description: "Course Structure fixed-attribute fixture.",
    settingsSchema: z.object({}).strict(),
    structurePolicy: { fixedChildren: [{ type: "heading", attrs: { level: 2 } }] },
    createSurface: ({ surfaceId }) => ({
      ...surface(surfaceId, "test-fixed-attribute"),
      content: [{ type: "heading", attrs: { level: 2 } }],
    }),
  },
]);

const courseStructure = createCourseStructureModule({
  blockDefinitions: createBlockRegistry([]),
  surfaceVariants,
});

describe("CourseStructureModule.validate", () => {
  it("returns a frozen Page snapshot with exact lookup and membership data", () => {
    const content = document("page", [surface(PAGE_ID, "test-page")]);
    const before = structuredClone(content);

    const result = courseStructure.validate(content);

    expect(result).toMatchObject({
      ok: true,
      value: {
        mode: "page",
        sectioning: "none",
        surfaces: [{ id: PAGE_ID, variantId: "test-page", index: 0, courseSectionId: null }],
        surfaceIds: [PAGE_ID],
        courseSections: [],
      },
    });
    expect(content).toEqual(before);
    if (!result.ok) throw new Error("expected valid Page structure");
    expect(result.value.surfaceById.get(PAGE_ID)).toBe(result.value.surfaces[0]);
    expect(result.value.courseSectionById.size).toBe(0);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.surfaces)).toBe(true);
    expect(Object.isFrozen(result.value.surfaceIds)).toBe(true);
    expect(Object.isFrozen(result.value.courseSections)).toBe(true);
    expect(Object.isFrozen(result.value.surfaces[0])).toBe(true);
  });

  it("returns an ordered unsectioned Slideshow snapshot", () => {
    const result = courseStructure.validate(
      document("slideshow", [
        surface(SURFACE_2, "test-slide", { density: 2 }),
        surface(SURFACE_1, "test-slide", { density: 3 }),
      ]),
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        mode: "slideshow",
        sectioning: "none",
        surfaceIds: [SURFACE_2, SURFACE_1],
        surfaces: [
          { id: SURFACE_2, index: 0, courseSectionId: null },
          { id: SURFACE_1, index: 1, courseSectionId: null },
        ],
        courseSections: [],
      },
    });
  });

  it("returns a consistent ordered sectioned Slideshow snapshot", () => {
    const result = courseStructure.validate(
      document("slideshow", [
        section(SECTION_1, "Introduction"),
        surface(SURFACE_1),
        surface(SURFACE_2),
        section(SECTION_2, "Practice"),
        surface(SURFACE_3),
      ]),
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        mode: "slideshow",
        sectioning: "course-sections",
        surfaceIds: [SURFACE_1, SURFACE_2, SURFACE_3],
        surfaces: [
          { id: SURFACE_1, index: 0, courseSectionId: SECTION_1 },
          { id: SURFACE_2, index: 1, courseSectionId: SECTION_1 },
          { id: SURFACE_3, index: 2, courseSectionId: SECTION_2 },
        ],
        courseSections: [
          {
            id: SECTION_1,
            title: "Introduction",
            index: 0,
            surfaceIds: [SURFACE_1, SURFACE_2],
            firstSurfaceId: SURFACE_1,
          },
          {
            id: SECTION_2,
            title: "Practice",
            index: 1,
            surfaceIds: [SURFACE_3],
            firstSurfaceId: SURFACE_3,
          },
        ],
      },
    });
    if (!result.ok || result.value.sectioning !== "course-sections") {
      throw new Error("expected valid sectioned Slideshow structure");
    }
    expect(result.value.surfaceById.get(SURFACE_2)).toBe(result.value.surfaces[1]);
    expect(result.value.courseSectionById.get(SECTION_1)).toBe(result.value.courseSections[0]);
    expect(Object.isFrozen(result.value.courseSections[0])).toBe(true);
    expect(Object.isFrozen(result.value.courseSections[0].surfaceIds)).toBe(true);
  });

  it.each([
    [
      "invalid_course_section_attrs",
      document("slideshow", [section(SECTION_1, "  "), surface(SURFACE_1)]),
      ["content", 0, "content", 0, "attrs", "title"],
    ],
    [
      "duplicate_course_section_id",
      document("slideshow", [
        section(SECTION_1, "One"),
        surface(SURFACE_1),
        section(SECTION_1, "Two"),
        surface(SURFACE_2),
      ]),
      ["content", 0, "content", 2, "attrs", "id"],
    ],
    [
      "course_section_not_allowed_in_mode",
      document("page", [section(SECTION_1, "One"), surface(PAGE_ID, "test-page")]),
      ["content", 0, "content", 0],
    ],
    [
      "incomplete_course_section_partition",
      document("slideshow", [
        surface(SURFACE_1),
        section(SECTION_1, "One"),
        surface(SURFACE_2),
      ]),
      ["content", 0, "content", 0],
    ],
    [
      "empty_course_section",
      document("slideshow", [
        section(SECTION_1, "One"),
        section(SECTION_2, "Two"),
        surface(SURFACE_1),
      ]),
      ["content", 0, "content", 0],
    ],
    [
      "empty_course_section",
      document("slideshow", [section(SECTION_1, "One"), surface(SURFACE_1), section(SECTION_2, "Two")]),
      ["content", 0, "content", 2],
    ],
  ] as const)("reports %s at its stable JSON path", (code, content, path) => {
    const result = courseStructure.validate(content);

    expect(result).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code, path })]),
    });
  });

  it.each([
    ["Course Document", COURSE_ID, surface(SURFACE_1)],
    [
      "nested node",
      SECTION_1,
      {
        ...surface(SURFACE_1),
        content: [{ type: "paragraph", attrs: { id: SECTION_1 } }],
      },
    ],
  ] satisfies ReadonlyArray<readonly [string, string, JSONContent]>)(
    "rejects a Course Section ID colliding with a %s ID",
    (_owner, id, slide) => {
      expect(
        courseStructure.validate(document("slideshow", [section(id, "One"), slide])),
      ).toMatchObject({
        ok: false,
        issues: expect.arrayContaining([
          expect.objectContaining({
            code: "duplicate_course_section_id",
            path: ["content", 0, "content", 0, "attrs", "id"],
          }),
        ]),
      });
    },
  );

  it.each([
    ["Course Document", COURSE_ID, surface(COURSE_ID)],
    ["Course Section", SECTION_1, surface(SECTION_1)],
    [
      "nested node",
      SURFACE_1,
      {
        ...surface(SURFACE_1),
        content: [{ type: "paragraph", attrs: { id: SURFACE_1 } }],
      },
    ],
  ] satisfies ReadonlyArray<readonly [string, string, JSONContent]>)(
    "rejects a Surface ID colliding with a %s ID",
    (owner, id, slide) => {
      const children = owner === "Course Section" ? [section(id, "One"), slide] : [slide];

      expect(courseStructure.validate(document("slideshow", children))).toMatchObject({
        ok: false,
        issues: expect.arrayContaining([
          expect.objectContaining({
            code: "duplicate_surface_id",
            path: ["content", 0, "content", children.length - 1, "attrs", "id"],
          }),
        ]),
      });
    },
  );

  it("rejects duplicate nested canonical identities at the second stable path", () => {
    const slide = surface(SURFACE_1);
    slide.content = [
      {
        type: "paragraph",
        attrs: { id: "NestedNode01" },
        content: [{ type: "contributed_block", attrs: { id: "NestedNode01" } }],
      },
    ];

    expect(courseStructure.validate(document("slideshow", [slide]))).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: "duplicate_embedded_node_id",
          path: ["content", 0, "content", 0, "content", 0, "content", 0, "attrs", "id"],
        }),
      ]),
    });
  });

  it("accepts distinct Core and contributed node IDs without reading attrs payload IDs", () => {
    const slide = surface(SURFACE_1);
    slide.content = [
      {
        type: "paragraph",
        attrs: {
          id: "NestedNode01",
          data: {
            records: [{ id: "LocalData001" }, { id: "LocalData001" }],
            nestedNodeLikeRecord: {
              type: "heading",
              attrs: { id: SECTION_1 },
            },
          },
        },
        content: [{ type: "contributed_block", attrs: { id: "Contrib00001" } }],
      },
    ];

    expect(
      courseStructure.validate(document("slideshow", [section(SECTION_1, "One"), slide])),
    ).toMatchObject({ ok: true });
  });

  it.each([
    ["invalid_top_node", { type: "paragraph" }, ["type"]],
    ["missing_course_document", { type: "doc", content: [] }, ["content"]],
    [
      "invalid_course_document_child",
      document("slideshow", [section(SECTION_1, "One"), { type: "paragraph" }, surface(SURFACE_1)]),
      ["content", 0, "content", 1],
    ],
    [
      "unsupported_surface_mode",
      document("branching", [surface(SURFACE_1)]),
      ["content", 0, "attrs", "mode"],
    ],
  ] as const)("retains %s root and mode validation", (code, content, path) => {
    expect(courseStructure.validate(content as JSONContent)).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code, path })]),
    });
  });

  it("retains registered Surface identity, variant, settings, mode and fixed-structure guarantees", () => {
    const duplicate = courseStructure.validate(
      document("slideshow", [surface(SURFACE_1), surface(SURFACE_1)]),
    );
    const unknown = courseStructure.validate(
      document("slideshow", [surface(SURFACE_1, "missing")]),
    );
    const mismatch = courseStructure.validate(
      document("page", [surface(PAGE_ID, "test-slide")]),
    );
    const settings = courseStructure.validate(
      document("slideshow", [surface(SURFACE_1, "test-slide", { density: "dense" })]),
    );
    const fixed = courseStructure.validate(
      document("slideshow", [
        { ...surface(SURFACE_1), content: [{ type: "heading", attrs: { level: 1 } }] },
      ]),
    );

    expect(issueCodes(duplicate)).toContain("duplicate_surface_id");
    expect(issueCodes(unknown)).toContain("unknown_surface_variant");
    expect(issueCodes(mismatch)).toContain("surface_variant_mode_mismatch");
    expect(issueCodes(settings)).toContain("invalid_surface_settings");
    expect(issueCodes(fixed)).toContain("fixed_surface_child_type_mismatch");
  });

  it("retains path-addressed root, attribute, cardinality and fixed-structure failures", () => {
    const multipleCourseDocuments = document("slideshow", [surface(SURFACE_1)]);
    multipleCourseDocuments.content!.push(structuredClone(multipleCourseDocuments.content![0]!));

    const invalidCourseAttrs = document("slideshow", [surface(SURFACE_1)]);
    invalidCourseAttrs.content![0]!.attrs = {
      ...invalidCourseAttrs.content![0]!.attrs,
      mode: "invalid",
    };

    const invalidSurfaceAttrs = document("slideshow", [surface(SURFACE_1)]);
    invalidSurfaceAttrs.content![0]!.content![0]!.attrs = {
      ...invalidSurfaceAttrs.content![0]!.content![0]!.attrs,
      id: "",
    };

    const fixedCount = document("slideshow", [
      { ...surface(SURFACE_1), content: [{ type: "paragraph" }, { type: "paragraph" }] },
    ]);
    const fixedAttribute = document("slideshow", [
      {
        ...surface(SURFACE_1, "test-fixed-attribute"),
        content: [{ type: "heading", attrs: { level: 1 } }],
      },
    ]);

    expectIssue(multipleCourseDocuments, "multiple_course_documents", ["content"]);
    expectIssue(invalidCourseAttrs, "invalid_course_document_attrs", [
      "content",
      0,
      "attrs",
      "mode",
    ]);
    expectIssue(invalidSurfaceAttrs, "invalid_surface_attrs", [
      "content",
      0,
      "content",
      0,
      "attrs",
      "id",
    ]);
    expectIssue(document("page", []), "invalid_surface_cardinality", [
      "content",
      0,
      "content",
    ]);
    expectIssue(fixedCount, "fixed_surface_child_count_mismatch", [
      "content",
      0,
      "content",
      0,
      "content",
      1,
    ]);
    expectIssue(fixedAttribute, "fixed_surface_child_attribute_mismatch", [
      "content",
      0,
      "content",
      0,
      "content",
      0,
      "attrs",
      "level",
    ]);
  });

  it("retains header/footer uniqueness and slot validation", () => {
    const invalidBoundary = {
      type: "surface_header",
      content: [{ type: "surface_header_footer_slot", attrs: { position: "center" } }],
    } satisfies JSONContent;
    const content = surface(SURFACE_1);
    content.content = [invalidBoundary, structuredClone(invalidBoundary), { type: "paragraph" }];

    const result = courseStructure.validate(document("slideshow", [content]));

    expect(issueCodes(result)).toEqual(
      expect.arrayContaining(["duplicate_header_footer", "invalid_header_footer_slots"]),
    );
  });
});

function issueCodes(result: ReturnType<typeof courseStructure.validate>): string[] {
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}

function expectIssue(content: JSONContent, code: string, path: readonly (string | number)[]) {
  expect(courseStructure.validate(content)).toMatchObject({
    ok: false,
    issues: expect.arrayContaining([expect.objectContaining({ code, path })]),
  });
}

function document(
  mode: "page" | "slideshow" | "branching",
  content: JSONContent[],
): JSONContent {
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
  variant = "test-slide",
  settings: Record<string, unknown> = variant === "test-slide" ? { density: 1 } : {},
): JSONContent {
  return {
    type: "surface",
    attrs: { id, title: null, variant, settings, notes: null },
    content: [{ type: "paragraph" }],
  };
}
