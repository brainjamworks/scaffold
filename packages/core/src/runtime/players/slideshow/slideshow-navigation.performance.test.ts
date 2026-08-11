import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vite-plus/test";

import {
  projectCourseStructure,
  type ProjectedSlideshowCourseStructure,
} from "@/document/model/course-structure";

import { getSlideshowNavigationState } from "./slideshow-navigation";

const COURSE_SECTION_COUNT = 25;
const SURFACES_PER_SECTION = 4;
const DESCENDANT_BLOCKS_PER_SURFACE = 20;
const SURFACE_COUNT = COURSE_SECTION_COUNT * SURFACES_PER_SECTION;
const DESCENDANT_BLOCK_COUNT = SURFACE_COUNT * DESCENDANT_BLOCKS_PER_SURFACE;

describe("Slideshow navigation projection scale", () => {
  it("reuses one immutable projection without returning to representative source content", () => {
    const fixture = createInstrumentedSlideshowFixture();

    const projection = requireSectionedProjection(projectCourseStructure(fixture.content));

    expect(projection.surfaceIds).toHaveLength(SURFACE_COUNT);
    expect(projection.surfaces).toHaveLength(SURFACE_COUNT);
    expect(projection.courseSections).toHaveLength(COURSE_SECTION_COUNT);
    expect(fixture.descendantBlockCount).toBe(DESCENDANT_BLOCK_COUNT);
    expect(fixture.access).toEqual({
      directChildIterations: 1,
      directChildrenVisited: COURSE_SECTION_COUNT + SURFACE_COUNT,
      descendantContentReads: 0,
    });

    expect(Object.isFrozen(projection)).toBe(true);
    expect(Object.isFrozen(projection.surfaceIds)).toBe(true);
    expect(Object.isFrozen(projection.surfaces)).toBe(true);
    expect(Object.isFrozen(projection.surfaceById)).toBe(true);
    expect(Object.isFrozen(projection.courseSections)).toBe(true);
    expect(Object.isFrozen(projection.courseSectionById)).toBe(true);

    projection.surfaces.forEach((surface, index) => {
      const courseSectionIndex = Math.floor(index / SURFACES_PER_SECTION);
      const courseSectionSurfaceIndex = index % SURFACES_PER_SECTION;
      const expectedSurfaceId = surfaceId(index);
      const expectedCourseSectionId = courseSectionId(courseSectionIndex);

      expect(surface).toEqual({
        id: expectedSurfaceId,
        index,
        courseSectionId: expectedCourseSectionId,
        courseSectionSurfaceIndex,
      });
      expect(projection.surfaceIds[index]).toBe(expectedSurfaceId);
      expect(projection.surfaceById[expectedSurfaceId]).toBe(surface);
      expect(Object.isFrozen(surface)).toBe(true);
    });

    projection.courseSections.forEach((courseSection, index) => {
      const firstSurfaceIndex = index * SURFACES_PER_SECTION;
      const expectedSurfaceIds = Array.from({ length: SURFACES_PER_SECTION }, (_, offset) =>
        surfaceId(firstSurfaceIndex + offset),
      );

      expect(courseSection).toEqual({
        id: courseSectionId(index),
        title: `Course Section ${index + 1}`,
        index,
        surfaceIds: expectedSurfaceIds,
        firstSurfaceId: expectedSurfaceIds[0],
      });
      expect(projection.courseSectionById[courseSection.id]).toBe(courseSection);
      expect(Object.isFrozen(courseSection)).toBe(true);
      expect(Object.isFrozen(courseSection.surfaceIds)).toBe(true);
    });

    fixture.lockSource();

    for (const [index, activeSurfaceId] of projection.surfaceIds.entries()) {
      const navigation = getSlideshowNavigationState(projection, activeSurfaceId);
      const courseSectionIndex = Math.floor(index / SURFACES_PER_SECTION);
      const courseSectionSurfaceIndex = index % SURFACES_PER_SECTION;

      expect(navigation).toMatchObject({
        activeSurfaceId,
        currentIndex: index,
        currentNumber: index + 1,
        count: SURFACE_COUNT,
        previousSurfaceId: index === 0 ? null : projection.surfaceIds[index - 1],
        nextSurfaceId: index === SURFACE_COUNT - 1 ? null : projection.surfaceIds[index + 1],
        currentCourseSection: {
          id: courseSectionId(courseSectionIndex),
          index: courseSectionIndex,
          number: courseSectionIndex + 1,
          count: COURSE_SECTION_COUNT,
          surfaceIndex: courseSectionSurfaceIndex,
          surfaceNumber: courseSectionSurfaceIndex + 1,
          surfaceCount: SURFACES_PER_SECTION,
        },
      });
      expect(navigation.courseSectionItems).toHaveLength(COURSE_SECTION_COUNT);
      expect(navigation.courseSectionItems[courseSectionIndex]).toMatchObject({
        id: courseSectionId(courseSectionIndex),
        firstSurfaceId: projection.surfaceIds[courseSectionIndex * SURFACES_PER_SECTION],
        current: true,
      });
    }

    for (
      let boundaryIndex = SURFACES_PER_SECTION;
      boundaryIndex < SURFACE_COUNT;
      boundaryIndex += SURFACES_PER_SECTION
    ) {
      const firstInSection = getSlideshowNavigationState(
        projection,
        projection.surfaceIds[boundaryIndex],
      );
      expect(firstInSection.previousSurfaceId).toBe(projection.surfaceIds[boundaryIndex - 1]);

      const lastInPreviousSection = getSlideshowNavigationState(
        projection,
        projection.surfaceIds[boundaryIndex - 1],
      );
      expect(lastInPreviousSection.nextSurfaceId).toBe(projection.surfaceIds[boundaryIndex]);
    }

    expect(fixture.access).toEqual({
      directChildIterations: 1,
      directChildrenVisited: COURSE_SECTION_COUNT + SURFACE_COUNT,
      descendantContentReads: 0,
    });
  });
});

interface FixtureAccess {
  directChildIterations: number;
  directChildrenVisited: number;
  descendantContentReads: number;
}

function createInstrumentedSlideshowFixture(): {
  content: JSONContent;
  access: FixtureAccess;
  descendantBlockCount: number;
  lockSource: () => void;
} {
  const access: FixtureAccess = {
    directChildIterations: 0,
    directChildrenVisited: 0,
    descendantContentReads: 0,
  };
  let sourceReadable = true;
  const assertSourceReadable = () => {
    if (!sourceReadable) throw new Error("Navigation returned to the source Course Document.");
  };

  const directChildren: JSONContent[] = [];
  for (let sectionIndex = 0; sectionIndex < COURSE_SECTION_COUNT; sectionIndex += 1) {
    directChildren.push(
      guardSource(
        {
          type: "courseSection",
          attrs: {
            id: courseSectionId(sectionIndex),
            title: `Course Section ${sectionIndex + 1}`,
          },
        },
        assertSourceReadable,
      ),
    );

    for (let offset = 0; offset < SURFACES_PER_SECTION; offset += 1) {
      const surfaceIndex = sectionIndex * SURFACES_PER_SECTION + offset;
      const descendantBlocks = Array.from(
        { length: DESCENDANT_BLOCKS_PER_SURFACE },
        (_, blockIndex): JSONContent => ({
          type: "paragraph",
          content: [{ type: "text", text: `Block ${surfaceIndex + 1}.${blockIndex + 1}` }],
        }),
      );
      directChildren.push(
        guardSource(
          {
            type: "surface",
            attrs: { id: surfaceId(surfaceIndex), variant: "slide-cover" },
            content: descendantBlocks,
          },
          assertSourceReadable,
          (property) => {
            if (property === "content") access.descendantContentReads += 1;
          },
        ),
      );
    }
  }

  const instrumentedChildren = new Proxy(directChildren, {
    get(target, property, receiver) {
      assertSourceReadable();
      if (property === Symbol.iterator) {
        return function* iterateDirectChildren() {
          access.directChildIterations += 1;
          for (const child of target) {
            assertSourceReadable();
            access.directChildrenVisited += 1;
            yield child;
          }
        };
      }
      return Reflect.get(target, property, receiver);
    },
  });
  const courseDocument = guardSource(
    {
      type: "courseDocument",
      attrs: { mode: "slideshow" },
      content: instrumentedChildren,
    },
    assertSourceReadable,
  );
  const rootContent = guardSource([courseDocument], assertSourceReadable);
  const content = guardSource(
    { type: "doc", content: rootContent },
    assertSourceReadable,
  ) as JSONContent;

  return {
    content,
    access,
    descendantBlockCount: SURFACE_COUNT * DESCENDANT_BLOCKS_PER_SURFACE,
    lockSource: () => {
      sourceReadable = false;
    },
  };
}

function guardSource<T extends object>(
  source: T,
  assertSourceReadable: () => void,
  onGet?: (property: PropertyKey) => void,
): T {
  return new Proxy(source, {
    get(target, property, receiver) {
      assertSourceReadable();
      onGet?.(property);
      return Reflect.get(target, property, receiver);
    },
  });
}

function requireSectionedProjection(
  projection: ReturnType<typeof projectCourseStructure>,
): ProjectedSlideshowCourseStructure {
  if (projection?.kind !== "slideshow") {
    throw new Error("Expected representative content to project as a Slideshow.");
  }
  return projection;
}

function surfaceId(index: number) {
  return `surface${String(index + 1).padStart(5, "0")}`;
}

function courseSectionId(index: number) {
  return `section${String(index + 1).padStart(5, "0")}`;
}
