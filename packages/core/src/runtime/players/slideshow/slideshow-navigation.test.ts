import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vite-plus/test";

import {
  projectCourseStructure,
  type ProjectedSlideshowCourseStructure,
} from "@/document/model/course-structure";
import { createScaffoldDocumentContent } from "@/format/artifact";

import { getSlideshowNavigationState, getSlideshowSurfaceStates } from "./slideshow-navigation";

const SURFACE_1 = EmbeddedNodeIdSchema.parse("surface00001");
const SURFACE_2 = EmbeddedNodeIdSchema.parse("surface00002");
const SURFACE_3 = EmbeddedNodeIdSchema.parse("surface00003");
const SURFACE_4 = EmbeddedNodeIdSchema.parse("surface00004");
const STALE_SURFACE = EmbeddedNodeIdSchema.parse("surfacegone1");
const SECTION_1 = EmbeddedNodeIdSchema.parse("section00001");
const SECTION_2 = EmbeddedNodeIdSchema.parse("section00002");
const SECTION_3 = EmbeddedNodeIdSchema.parse("section00003");

describe("getSlideshowNavigationState", () => {
  it("represents an empty-only Slideshow without fabricating an active Surface", () => {
    const structure = sectionedStructure([section(SECTION_1, "Empty")]);
    expect(getSlideshowNavigationState(structure)).toMatchObject({
      activeSurfaceId: null,
      currentIndex: null,
      currentNumber: null,
      count: 0,
      currentCourseSection: null,
      courseSectionItems: [{ id: SECTION_1, firstSurfaceId: null, current: false }],
    });
  });
  it("describes a one-slide Slideshow with its owning Course Section", () => {
    const structure = unsectionedStructure(SURFACE_1);

    expect(getSlideshowNavigationState(structure)).toEqual({
      activeSurfaceId: SURFACE_1,
      currentIndex: 0,
      currentNumber: 1,
      count: 1,
      previousSurfaceId: null,
      nextSurfaceId: null,
      canGoPrevious: false,
      canGoNext: false,
      currentCourseSection: {
        id: SECTION_1,
        title: "Introduction",
        index: 0,
        number: 1,
        count: 1,
        surfaceIndex: 0,
        surfaceNumber: 1,
        surfaceCount: 1,
      },
      courseSectionItems: [
        {
          id: SECTION_1,
          title: "Introduction",
          index: 0,
          number: 1,
          count: 1,
          firstSurfaceId: SURFACE_1,
          current: true,
        },
      ],
    });
  });

  it.each([
    {
      activeSurfaceId: SURFACE_1,
      currentIndex: 0,
      currentNumber: 1,
      previousSurfaceId: null,
      nextSurfaceId: SURFACE_2,
    },
    {
      activeSurfaceId: SURFACE_2,
      currentIndex: 1,
      currentNumber: 2,
      previousSurfaceId: SURFACE_1,
      nextSurfaceId: SURFACE_3,
    },
    {
      activeSurfaceId: SURFACE_3,
      currentIndex: 2,
      currentNumber: 3,
      previousSurfaceId: SURFACE_2,
      nextSurfaceId: null,
    },
  ])("preserves flat navigation at Surface $currentNumber", (expected) => {
    const structure = unsectionedStructure(SURFACE_1, SURFACE_2, SURFACE_3);

    expect(getSlideshowNavigationState(structure, expected.activeSurfaceId)).toMatchObject({
      ...expected,
      count: 3,
      canGoPrevious: expected.previousSurfaceId !== null,
      canGoNext: expected.nextSurfaceId !== null,
      currentCourseSection: expect.objectContaining({ id: SECTION_1 }),
      courseSectionItems: [expect.objectContaining({ id: SECTION_1 })],
    });
  });

  it("derives Course Section and local slide position for every member", () => {
    const structure = sectionedStructure([
      section(SECTION_1, "Introduction", SURFACE_1, SURFACE_2),
      section(SECTION_2, "Practice", SURFACE_3),
    ]);

    expect(getSlideshowNavigationState(structure, SURFACE_1).currentCourseSection).toEqual({
      id: SECTION_1,
      title: "Introduction",
      index: 0,
      number: 1,
      count: 2,
      surfaceIndex: 0,
      surfaceNumber: 1,
      surfaceCount: 2,
    });
    expect(getSlideshowNavigationState(structure, SURFACE_2).currentCourseSection).toEqual({
      id: SECTION_1,
      title: "Introduction",
      index: 0,
      number: 1,
      count: 2,
      surfaceIndex: 1,
      surfaceNumber: 2,
      surfaceCount: 2,
    });
    expect(getSlideshowNavigationState(structure, SURFACE_3).currentCourseSection).toEqual({
      id: SECTION_2,
      title: "Practice",
      index: 1,
      number: 2,
      count: 2,
      surfaceIndex: 0,
      surfaceNumber: 1,
      surfaceCount: 1,
    });
  });

  it("keeps previous and next flat across Course Section boundaries", () => {
    const structure = sectionedStructure([
      section(SECTION_1, "Introduction", SURFACE_1, SURFACE_2),
      section(SECTION_2, "Practice", SURFACE_3, SURFACE_4),
    ]);

    expect(getSlideshowNavigationState(structure, SURFACE_2)).toMatchObject({
      previousSurfaceId: SURFACE_1,
      nextSurfaceId: SURFACE_3,
    });
    expect(getSlideshowNavigationState(structure, SURFACE_3)).toMatchObject({
      previousSurfaceId: SURFACE_2,
      nextSurfaceId: SURFACE_4,
    });
  });

  it("provides ordered jump items with ordinal context for repeated titles", () => {
    const structure = sectionedStructure([
      section(SECTION_1, "Practice", SURFACE_1),
      section(SECTION_2, "Practice", SURFACE_2),
      section(SECTION_3, "Review", SURFACE_3),
    ]);

    expect(getSlideshowNavigationState(structure, SURFACE_2).courseSectionItems).toEqual([
      {
        id: SECTION_1,
        title: "Practice",
        index: 0,
        number: 1,
        count: 3,
        firstSurfaceId: SURFACE_1,
        current: false,
      },
      {
        id: SECTION_2,
        title: "Practice",
        index: 1,
        number: 2,
        count: 3,
        firstSurfaceId: SURFACE_2,
        current: true,
      },
      {
        id: SECTION_3,
        title: "Review",
        index: 2,
        number: 3,
        count: 3,
        firstSurfaceId: SURFACE_3,
        current: false,
      },
    ]);
  });

  it("normalizes a missing or stale active ID before deriving Course Section context", () => {
    const structure = sectionedStructure([
      section(SECTION_1, "Introduction", SURFACE_1),
      section(SECTION_2, "Practice", SURFACE_2),
    ]);

    expect(getSlideshowNavigationState(structure, STALE_SURFACE)).toMatchObject({
      activeSurfaceId: SURFACE_1,
      currentIndex: 0,
      currentNumber: 1,
      previousSurfaceId: null,
      nextSurfaceId: SURFACE_2,
      currentCourseSection: {
        id: SECTION_1,
        surfaceNumber: 1,
      },
    });
    expect(getSlideshowNavigationState(structure)).toMatchObject({
      activeSurfaceId: SURFACE_1,
      currentCourseSection: { id: SECTION_1 },
    });
  });

  it("derives visibility from the same flat navigation result", () => {
    const structure = sectionedStructure([
      section(SECTION_1, "Introduction", SURFACE_1, SURFACE_2),
      section(SECTION_2, "Practice", SURFACE_3, SURFACE_4),
    ]);
    const navigation = getSlideshowNavigationState(structure, SURFACE_2);

    expect(getSlideshowSurfaceStates(structure, navigation)).toEqual({
      [SURFACE_1]: "previous",
      [SURFACE_2]: "current",
      [SURFACE_3]: "next",
      [SURFACE_4]: "hidden",
    });
  });
});

function unsectionedStructure(
  firstSurfaceId: string,
  ...remainingSurfaceIds: string[]
): ProjectedSlideshowCourseStructure {
  return requireSlideshowProjection([
    { type: "courseSection", attrs: { id: SECTION_1, title: "Introduction" } },
    surface(firstSurfaceId),
    ...remainingSurfaceIds.map(surface),
  ]);
}

function sectionedStructure(
  sections: Array<{ id: string; title: string; surfaceIds: string[] }>,
): ProjectedSlideshowCourseStructure {
  return requireSlideshowProjection(
    sections.flatMap(({ id, title, surfaceIds }) => [
      { type: "courseSection", attrs: { id, title } },
      ...surfaceIds.map(surface),
    ]),
  );
}

function section(id: string, title: string, ...surfaceIds: string[]) {
  return { id, title, surfaceIds };
}

function requireSlideshowProjection(children: JSONContent[]): ProjectedSlideshowCourseStructure {
  const content = createScaffoldDocumentContent({
    mode: "slideshow",
    initialCourseSectionTitle: "Introduction",
    surfaceId: SURFACE_1,
  });
  const courseDocument = content.content?.[0];
  if (!courseDocument) throw new Error("Expected a Slideshow fixture.");
  courseDocument.content = children;
  const projection = projectCourseStructure(content);
  if (!projection || projection.mode !== "slideshow") {
    throw new Error("Expected a projected Slideshow fixture.");
  }
  return projection;
}

function surface(id: string): JSONContent {
  return {
    type: "surface",
    attrs: { id, variant: "slide-cover" },
    content: [{ type: "paragraph" }],
  };
}
