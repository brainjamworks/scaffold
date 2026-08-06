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
  validateEmbeddedNodeIdentities,
  type EmbeddedNodeIdentityIssue,
  type EmbeddedNodeIdentityIssueCode,
  type EmbeddedNodeIdentityValidationResult,
} from "./embedded-node-identity-validation";
export {
  validateCourseDocumentJSON,
  type CourseDocumentIssue,
  type CourseDocumentIssueCode,
  type CourseDocumentValidationResult,
} from "./validators";
