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

  it("preserves the flat order of an unsectioned Slideshow", () => {
    const content = slideshowContent([surface(SURFACE_1), surface(SURFACE_2), surface(SURFACE_3)]);

    const projection = projectCourseStructure(content);

    expect(projection).toMatchObject({
      kind: "unsectioned-slideshow",
      mode: "slideshow",
      surfaceIds: [SURFACE_1, SURFACE_2, SURFACE_3],
      courseSections: [],
      courseSectionById: {},
    });
    expect(projection?.surfaceById[SURFACE_2]).toEqual({
      id: SURFACE_2,
      index: 1,
      courseSectionId: null,
      courseSectionSurfaceIndex: null,
    });
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
      kind: "sectioned-slideshow",
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
      name: "an empty Course Section",
      content: slideshowContent([
        courseSection(SECTION_1, "Introduction"),
        courseSection(SECTION_2, "Practice"),
        surface(SURFACE_1),
      ]),
    },
    {
      name: "a duplicate stable ID",
      content: slideshowContent([surface(SURFACE_1), surface(SURFACE_1)]),
    },
    {
      name: "an invalid Course Section title",
      content: slideshowContent([courseSection(SECTION_1, " "), surface(SURFACE_1)]),
    },
  ])("does not reinterpret $name", ({ content }) => {
    expect(projectCourseStructure(content)).toBeNull();
  });
});

function slideshowContent(children: JSONContent[]): JSONContent {
  const content = createScaffoldDocumentContent({ mode: "slideshow", surfaceId: SURFACE_1 });
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
