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
export { CourseDocumentNode, DocumentNode } from "./nodes";
export {
  defineCourseDocumentMigration,
  migrateCourseDocumentJSON,
  readCourseDocumentFormatVersion,
  runCourseDocumentMigrationSteps,
  validateCourseDocumentJSON,
  validateCourseDocumentMigrationPlan,
  validateEmbeddedNodeIdentities,
  type AppliedCourseDocumentMigration,
  type CourseDocumentIssue,
  type CourseDocumentIssueCode,
  type CourseDocumentMigrationErrorCode,
  type CourseDocumentMigrationResult,
  type CourseDocumentMigrationStep,
  type CourseDocumentMigrationStepResult,
  type CourseDocumentValidationResult,
  type EmbeddedNodeIdentityIssue,
  type EmbeddedNodeIdentityIssueCode,
  type EmbeddedNodeIdentityValidationResult,
} from "./validation";
export {
  getSurfaceViewSettings,
  readSurfaceViewSettings,
  readSurfaceViewSettingsFromProseMirrorDoc,
  type SurfaceViewSettings,
} from "./surface-view-settings";
