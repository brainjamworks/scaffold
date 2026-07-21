export {
  SCAFFOLD_MEDIA_CONTEXTS,
  MEDIA_UPLOAD_TYPES,
  type ScaffoldMediaContext,
  type ScaffoldResolvedMediaMap,
  type MediaPort,
  type MediaUploadMeta,
  type MediaUploadResult,
  type MediaUploadType,
} from "@/host/ports/media";
export type {
  ArtifactPersistencePort,
  ArtifactSaveBundle,
  ArtifactSaveResult,
  SaveableScaffoldArtifact,
} from "@/host/ports/artifact-persistence";
export type {
  ScaffoldArtifactCreationInput,
  ScaffoldArtifactCreationMetadata,
  ScaffoldArtifactCreationMode,
  ScaffoldArtifactCreationPort,
} from "@/host/ports/artifact-creation";

export {
  AssessmentProblemCommandOutcomeSchema,
  AssessmentQuizCommandOutcomeSchema,
} from "@/host/ports";
export type {
  AssessmentProblemCommandOutcome,
  AssessmentQuizCommandOutcome,
  AssessmentCheckRequest,
  AssessmentPort,
  AssessmentPortType,
  AssessmentRevealHintRequest,
  AssessmentRevealRequest,
  AssessmentSubmitRequest,
  LearnerActivityLoadRequest,
  LearnerActivityPort,
  LearnerActivitySaveRecord,
  LearnerActivitySaveRequest,
  QuizAssessmentPort,
  QuizFinishAttemptRequest,
  QuizRevealAnswersRequest,
  QuizStartAttemptRequest,
  QuizSubmitQuestionRequest,
} from "@/host/ports";

export type {
  ScaffoldAuthoringArtifact,
  ScaffoldAuthoringEntryHostServices,
  ScaffoldAuthoringHostServices,
  ScaffoldLearnerBootstrap,
  ScaffoldLearnerHostServices,
  ScaffoldLearnerInitialState,
} from "@/host/contracts";

export type { ScaffoldRuntimePorts } from "@/host/ports/runtime-ports";
