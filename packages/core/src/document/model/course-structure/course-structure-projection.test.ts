import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vite-plus/test";

import { createScaffoldDocumentContent } from "../../../format/artifact";

import { projectCourseStructure } from "./course-structure-projection";

const PAGE_SURFACE_ID = EmbeddedNodeIdSchema.parse("surface-page");
const SURFACE_1 = EmbeddedNodeIdSchema.parse("surface00001");
const SURFACE_2 = EmbeddedNodeIdSchema.parse("surface00002");
const SURFACE_3 = EmbeddedNodeIdSchema.parse("surface00003");
const SECTION_1 = EmbeddedNodeIdSchema.parse("section00001");
const SECTION_2 = EmbeddedNodeIdSchema.parse("section00002");

describe("projectCourseStructure", () => {
  it("projects a canonical Page as one unsectioned Surface", () => {
    const content = createScaffoldDocumentContent({ mode: "page", surfaceId: PAGE_SURFACE_ID });

    expect(projectCourseStructure(content)).toEqual({
      kind: "page",
      mode: "page",
      surfaceIds: [PAGE_SURFACE_ID],
      surfaces: [
        {
          id: PAGE_SURFACE_ID,
          index: 0,
          courseSectionId: null,
          courseSectionSurfaceIndex: null,
        },
      ],
      surfaceById: {
        [PAGE_SURFACE_ID]: {
          id: PAGE_SURFACE_ID,
          index: 0,
          courseSectionId: null,
          courseSectionSurfaceIndex: null,
        },
      },
      courseSections: [],
      courseSectionById: {},
    });
  });

  it("rejects an unsectioned Slideshow", () => {
    const content = slideshowContent([surface(SURFACE_1), surface(SURFACE_2), surface(SURFACE_3)]);

    expect(projectCourseStructure(content)).toBeNull();
  });

  it("projects ordered Course Sections and member lookup data in one semantic structure", () => {
    const content = slideshowContent([
      courseSection(SECTION_1, "Practice"),
      surface(SURFACE_1),
      surface(SURFACE_2),
      courseSection(SECTION_2, "Practice"),
      surface(SURFACE_3),
    ]);

    const projection = projectCourseStructure(content);

    expect(projection).toMatchObject({
      kind: "slideshow",
      mode: "slideshow",
      surfaceIds: [SURFACE_1, SURFACE_2, SURFACE_3],
      courseSections: [
        {
          id: SECTION_1,
          title: "Practice",
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
    });
    expect(projection?.surfaceById[SURFACE_2]).toEqual({
      id: SURFACE_2,
      index: 1,
      courseSectionId: SECTION_1,
      courseSectionSurfaceIndex: 1,
    });
    expect(projection?.courseSectionById[SECTION_2]).toMatchObject({
      id: SECTION_2,
      firstSurfaceId: SURFACE_3,
    });
  });

  it("projects adjacent, trailing, and empty-only Course Sections", () => {
    const projection = projectCourseStructure(
      slideshowContent([
        courseSection(SECTION_1, "Empty"),
        courseSection(SECTION_2, "Populated"),
        surface(SURFACE_1),
        courseSection(EmbeddedNodeIdSchema.parse("section00003"), "Trailing"),
      ]),
    );

    expect(projection).toMatchObject({
      kind: "slideshow",
      surfaceIds: [SURFACE_1],
      courseSections: [
        { id: SECTION_1, surfaceIds: [], firstSurfaceId: null },
        { id: SECTION_2, surfaceIds: [SURFACE_1], firstSurfaceId: SURFACE_1 },
        { surfaceIds: [], firstSurfaceId: null },
      ],
    });
    expect(
      projectCourseStructure(slideshowContent([courseSection(SECTION_1, "Only")]))
        ?.courseSections[0],
    ).toMatchObject({ surfaceIds: [], firstSurfaceId: null });
  });

  it("reads only canonical structural fields from established Course Section attrs", () => {
    const boundary = courseSection(SECTION_1, "Practice");
    boundary.attrs = { ...boundary.attrs, semanticLabel: "Workshop outline label" };

    expect(
      projectCourseStructure(slideshowContent([boundary, surface(SURFACE_1)]))?.courseSections,
    ).toEqual([
      {
        id: SECTION_1,
        title: "Practice",
        index: 0,
        surfaceIds: [SURFACE_1],
        firstSurfaceId: SURFACE_1,
      },
    ]);
  });

  it("keeps authoring-only unavailable Surfaces outside canonical projection", () => {
    const content = createScaffoldDocumentContent({ mode: "page", surfaceId: PAGE_SURFACE_ID });
    content.content![0]!.content = [
      {
        type: "unavailable_surface",
        attrs: {
          id: PAGE_SURFACE_ID,
          capabilityId: "plus.private-surface",
          original: { type: "surface", attrs: { id: PAGE_SURFACE_ID } },
        },
      },
    ];

    expect(projectCourseStructure(content)).toBeNull();
  });

  it.each([
    {
      name: "a partially sectioned Slideshow",
      content: slideshowContent([
        surface(SURFACE_1),
        courseSection(SECTION_1, "Practice"),
        surface(SURFACE_2),
      ]),
    },
    {
      name: "a duplicate stable ID",
      content: slideshowContent([
        courseSection(SECTION_1, "Introduction"),
        surface(SURFACE_1),
        surface(SURFACE_1),
      ]),
    },
    {
      name: "an invalid Course Section title",
      content: slideshowContent([courseSection(SECTION_1, " "), surface(SURFACE_1)]),
    },
    {
      name: "a Course Section containing child content",
      content: slideshowContent([
        {
          ...courseSection(SECTION_1, "Practice"),
          content: [{ type: "paragraph" }],
        },
        surface(SURFACE_1),
      ]),
    },
  ])("does not reinterpret $name", ({ content }) => {
    expect(projectCourseStructure(content)).toBeNull();
  });
});

function slideshowContent(children: JSONContent[]): JSONContent {
  const content = createScaffoldDocumentContent({
    mode: "slideshow",
    initialCourseSectionTitle: "Introduction",
    surfaceId: SURFACE_1,
  });
  const courseDocument = content.content?.[0];
  if (!courseDocument) throw new Error("Expected a Course Document fixture.");
  courseDocument.content = children;
  return content;
}

function courseSection(id: string, title: string): JSONContent {
  return { type: "courseSection", attrs: { id, title } };
}

function surface(id: string): JSONContent {
  return {
    type: "surface",
    attrs: { id, variant: "slide-cover" },
    content: [{ type: "paragraph" }],
  };
}
