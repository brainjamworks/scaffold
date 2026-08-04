export {
  createCoreScaffoldRuntimeComposition,
  type ScaffoldRuntimeComposition,
} from "@/composition/runtime/scaffold-runtime-composition";
export { ContentRuntimeHost, type ContentRuntimeHostProps } from "@/runtime/app/ContentRuntimeHost";
export { ScaffoldLearnerApp, type ScaffoldLearnerAppProps } from "@/runtime/app/ScaffoldLearnerApp";
export type { SlideshowPlayerSizing } from "@/runtime/players/player-types";
export type { ScaffoldLearnerColorModeProps } from "@/theme/state/learner-color-mode";
export type { ScaffoldColorMode, ScaffoldThemeExtension } from "@/theme/model";
export {
  ScaffoldServicesProvider,
  useAssessmentPort,
  useLearnerActivityPort,
  useLearningEventPort,
  useMediaPort,
  type ScaffoldServicesProviderProps,
} from "@/host/providers/ScaffoldServicesProvider";
export {
  LearningEventRuntimeProvider,
  type LearningEventRuntimeProviderProps,
} from "@/runtime/learning-events/LearningEventRuntimeProvider";
export type { ScaffoldRuntimePorts } from "@/host/ports/runtime-ports";
export {
  migrateCourseDocumentJSON,
  readCourseDocumentFormatVersion,
  type CourseDocumentMigrationErrorCode,
  type CourseDocumentMigrationResult,
} from "@/document/model/validation";
