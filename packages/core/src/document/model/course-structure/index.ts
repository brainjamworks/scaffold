export type {
  CourseSectionId,
  CourseStructureCommand,
  SurfaceDestination,
  SurfaceId,
} from "./types";
export {
  readCourseSectionOrdinalContext,
  type CourseSectionOrdinalContext,
} from "./course-section-ordinal-context";
export {
  projectCourseStructure,
  type ProjectedCourseSection,
  type ProjectedCourseStructure,
  type ProjectedCourseSurface,
  type ProjectedPageCourseStructure,
  type ProjectedSectionedSlideshowCourseStructure,
  type ProjectedSlideshowCourseStructure,
  type ProjectedUnsectionedSlideshowCourseStructure,
} from "./course-structure-projection";
