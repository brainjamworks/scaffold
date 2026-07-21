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
export { COURSE_DOCUMENT_FRAGMENT } from "./constants";
export { initializeCourseDocumentFragment } from "./initialize-document";
export { CourseDocumentNode, DocumentNode } from "./nodes";
export {
  defineCourseDocumentMigration,
  migrateCourseDocumentJSON,
  readCourseDocumentFormatVersion,
  runCourseDocumentMigrationSteps,
  validateCourseDocumentJSON,
  validateCourseDocumentMigrationPlan,
  type AppliedCourseDocumentMigration,
  type CourseDocumentIssue,
  type CourseDocumentIssueCode,
  type CourseDocumentMigrationErrorCode,
  type CourseDocumentMigrationResult,
  type CourseDocumentMigrationStep,
  type CourseDocumentMigrationStepResult,
  type CourseDocumentValidationResult,
} from "./validation";
export {
  getSurfaceViewSettings,
  readSurfaceViewSettings,
  readSurfaceViewSettingsFromProseMirrorDoc,
  type SurfaceViewSettings,
} from "./surface-view-settings";
