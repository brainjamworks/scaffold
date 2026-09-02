export {
  canInsertNodeAt,
  deleteNodeChecked,
  duplicateNodeChecked,
  insertNodeChecked,
  replaceRangeWithNodeChecked,
  type CheckedDuplicateNodeResult,
  type CheckedMutationIssue,
  type CheckedMutationResult,
} from "./commands/checked-transactions";
export * from "./content-model";
export type {
  CourseSectionId,
  CourseStructureCommand,
  SurfaceDestination,
  SurfaceId,
} from "./course-structure";
export { CourseDocumentNode, DocumentNode } from "./nodes";
export { toPortableCourseDocumentAttrs } from "./course-document-attrs";
export {
  cloneCourseDocumentJSON,
  findCourseDocument,
  readCourseDocumentFormatVersion,
} from "./validation";
export {
  getSurfaceViewSettings,
  readSurfaceViewSettings,
  readSurfaceViewSettingsFromProseMirrorDoc,
  type SurfaceViewSettings,
} from "./surface-view-settings";
export * from "./semantic-document";
