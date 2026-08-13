export type {
  CourseSectionId,
  CourseStructureCommand,
  SurfaceDestination,
  SurfaceId,
} from "./types";
export { createDefaultCourseSectionTitle } from "./course-section-title";
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
  type ProjectedSlideshowCourseStructure,
} from "./course-structure-projection";
