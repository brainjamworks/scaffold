import type {
  CourseSection,
  CourseSectionId,
  PageCourseStructure,
  CourseStructure,
  CourseStructureValidationResult,
  CourseSurface,
  NonEmptyReadonlyArray,
  UnsectionedSlideshowCourseStructure,
  SurfaceId,
} from "./types";

export interface PendingCourseSection {
  readonly id: CourseSectionId;
  readonly title: string;
  readonly childIndex: number;
  readonly surfaceIds: SurfaceId[];
}

export function createCourseStructureSnapshot(
  mode: "page" | "slideshow",
  surfaces: CourseSurface[],
  pendingSections: PendingCourseSection[],
): CourseStructureValidationResult {
  const frozenSurfaces = Object.freeze([...surfaces]) as NonEmptyReadonlyArray<CourseSurface>;
  const surfaceIds = Object.freeze(
    surfaces.map((surface) => surface.id),
  ) as NonEmptyReadonlyArray<SurfaceId>;
  const surfaceById = new Map<SurfaceId, CourseSurface>(
    surfaces.map((surface) => [surface.id, surface]),
  );
  const courseSections = Object.freeze(
    pendingSections.map((pending, index) => {
      const surfaceIds = Object.freeze([...pending.surfaceIds]) as NonEmptyReadonlyArray<SurfaceId>;
      return Object.freeze({
        id: pending.id,
        title: pending.title,
        index,
        surfaceIds,
        firstSurfaceId: surfaceIds[0],
      });
    }),
  ) as readonly CourseSection[];
  const emptyCourseSections = Object.freeze([]) as readonly [];

  let value: CourseStructure;
  if (mode === "page") {
    value = Object.freeze({
      mode,
      sectioning: "none",
      surfaces: frozenSurfaces as readonly [CourseSurface],
      surfaceIds: surfaceIds as readonly [SurfaceId],
      courseSections: emptyCourseSections,
      surfaceById,
      courseSectionById: new Map<CourseSectionId, never>(),
    }) satisfies PageCourseStructure;
  } else if (courseSections.length === 0) {
    value = Object.freeze({
      mode,
      sectioning: "none",
      surfaces: frozenSurfaces,
      surfaceIds,
      courseSections: emptyCourseSections,
      surfaceById,
      courseSectionById: new Map<CourseSectionId, never>(),
    }) satisfies UnsectionedSlideshowCourseStructure;
  } else {
    value = Object.freeze({
      mode,
      sectioning: "course-sections",
      surfaces: frozenSurfaces,
      surfaceIds,
      courseSections: courseSections as NonEmptyReadonlyArray<CourseSection>,
      surfaceById,
      courseSectionById: new Map<CourseSectionId, CourseSection>(
        courseSections.map((section) => [section.id, section]),
      ),
    });
  }

  return Object.freeze({ ok: true, value });
}
