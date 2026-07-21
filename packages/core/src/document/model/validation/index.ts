export {
  defineCourseDocumentMigration,
  runCourseDocumentMigrationSteps,
  validateCourseDocumentMigrationPlan,
  type AppliedCourseDocumentMigration,
  type CourseDocumentMigrationStep,
  type CourseDocumentMigrationStepResult,
} from "./migration-registry";
export {
  migrateCourseDocumentJSON,
  readCourseDocumentFormatVersion,
  type CourseDocumentMigrationErrorCode,
  type CourseDocumentMigrationResult,
} from "./migrations";
export {
  validateCourseDocumentJSON,
  type CourseDocumentIssue,
  type CourseDocumentIssueCode,
  type CourseDocumentValidationResult,
} from "./validators";
export {
  validateCourseSurfaceLifecycle,
  type CourseSurfaceValidationResult,
  type SurfaceInstanceId,
  type SurfaceVariantId,
  type ValidatedCourseSurfaceProjection,
  type ValidatedSurfaceRef,
} from "./surface-lifecycle-validation";
