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
