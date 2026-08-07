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
export {
  defineCourseDocumentMigration,
  migrateCourseDocumentJSON,
  readCourseDocumentFormatVersion,
  runCourseDocumentMigrationSteps,
  validateCourseDocumentMigrationPlan,
  type AppliedCourseDocumentMigration,
  type CourseDocumentMigrationErrorCode,
  type CourseDocumentMigrationResult,
  type CourseDocumentMigrationStep,
  type CourseDocumentMigrationStepResult,
} from "./validation";
export {
  getSurfaceViewSettings,
  readSurfaceViewSettings,
  readSurfaceViewSettingsFromProseMirrorDoc,
  type SurfaceViewSettings,
} from "./surface-view-settings";
export * from "./semantic-document";
