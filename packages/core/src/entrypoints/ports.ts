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
  ArtifactSavePayload,
  ArtifactSaveResult,
  SaveableScaffoldArtifact,
} from "@/host/ports/artifact-persistence";
export type {
  ArtifactRevision,
  LearnerPublicationPayload,
  LearnerPublicationPort,
  LearnerPublicationPortError,
  LearnerPublicationPortErrorCode,
  LearnerPublicationStatus,
} from "@/host/ports/learner-publication";
export type {
  ScaffoldArtifactCreationInput,
  ScaffoldArtifactCreationMetadata,
  ScaffoldArtifactCreationMode,
  ScaffoldArtifactCreationPort,
} from "@/host/ports/artifact-creation";

export {
  AssessmentProblemCommandOutcomeSchema,
  AssessmentQuizCommandOutcomeSchema,
  LearningEventIriSchema,
  LearningEventSchema,
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
  LearningEvent,
  LearningEventActivity,
  LearningEventActivityDefinition,
  LearningEventContext,
  LearningEventDuration,
  LearningEventInteractionComponent,
  LearningEventInteractionType,
  LearningEventIri,
  LearningEventJsonValue,
  LearningEventLanguageMap,
  LearningEventPort,
  LearningEventResult,
  LearningEventTimestamp,
  LearningEventUuid,
  LearningEventVerb,
  Score,
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
  ScaffoldLearnerPublication,
  ScaffoldLearnerPublicationIssue,
  ScaffoldUnavailableContentRef,
} from "@/host/contracts";

export type { ScaffoldRuntimePorts } from "@/host/ports/runtime-ports";
