import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import * as ports from "@scaffold/core/ports";
import type {
  ArtifactPersistencePort,
  ArtifactPersistenceFailure,
  ArtifactPersistenceResult,
  ArtifactRevision,
  ArtifactSavePayload,
  ArtifactSaveResult,
  AssessmentCheckRequest,
  AssessmentPort,
  AssessmentPortType,
  AssessmentProblemCommandOutcome,
  AssessmentQuizCommandOutcome,
  AssessmentRevealHintRequest,
  AssessmentRevealRequest,
  AssessmentSubmitRequest,
  ScaffoldArtifactCreationInput,
  ScaffoldArtifactCreationMetadata,
  ScaffoldArtifactCreationMode,
  ScaffoldArtifactCreationPort,
  ScaffoldAuthoringArtifact,
  ScaffoldAuthoringEntryHostServices,
  ScaffoldAuthoringHostServices,
  ScaffoldLearnerBootstrap,
  ScaffoldLearnerHostServices,
  ScaffoldLearnerInitialState,
  ScaffoldMediaContext,
  ScaffoldResolvedMediaMap,
  ScaffoldRuntimePorts,
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
  LearnerPublicationPayload,
  LearnerPublicationPort,
  LearnerPublicationStatus,
  Score,
  MediaPort,
  MediaUploadMeta,
  MediaUploadResult,
  MediaUploadType,
  QuizAssessmentPort,
  QuizFinishAttemptRequest,
  QuizRevealAnswersRequest,
  QuizStartAttemptRequest,
  QuizSubmitQuestionRequest,
  SaveableScaffoldArtifact,
} from "@scaffold/core/ports";
// @ts-expect-error Drafts are private to the Core learning-event runtime.
import type { LearningEventDraft } from "@scaffold/core/ports";
// @ts-expect-error Core-only catalogue inputs are not host port contracts.
import type { CoreLearningEventInput } from "@scaffold/core/ports";
// @ts-expect-error Session access is not part of the host port contract.
import type { LearningEventSession } from "@scaffold/core/ports";

type PortsTypeSurface = {
  coreInputViolation: CoreLearningEventInput;
  draftViolation: LearningEventDraft;
  artifactCreationInput: ScaffoldArtifactCreationInput;
  artifactCreationMetadata: ScaffoldArtifactCreationMetadata;
  artifactCreationMode: ScaffoldArtifactCreationMode;
  artifactCreationPort: ScaffoldArtifactCreationPort;
  artifactPersistencePort: ArtifactPersistencePort;
  artifactPersistenceFailure: ArtifactPersistenceFailure;
  artifactPersistenceResult: ArtifactPersistenceResult;
  artifactRevision: ArtifactRevision;
  artifactSavePayload: ArtifactSavePayload;
  artifactSaveResult: ArtifactSaveResult;
  assessmentCheckRequest: AssessmentCheckRequest;
  assessmentPort: AssessmentPort;
  assessmentPortType: AssessmentPortType;
  assessmentProblemCommandOutcome: AssessmentProblemCommandOutcome;
  assessmentQuizCommandOutcome: AssessmentQuizCommandOutcome;
  assessmentRevealHintRequest: AssessmentRevealHintRequest;
  assessmentRevealRequest: AssessmentRevealRequest;
  assessmentSubmitRequest: AssessmentSubmitRequest;
  authoringArtifact: ScaffoldAuthoringArtifact;
  authoringEntryHostServices: ScaffoldAuthoringEntryHostServices;
  authoringHostServices: ScaffoldAuthoringHostServices;
  learnerActivityLoadRequest: LearnerActivityLoadRequest;
  learnerActivityPort: LearnerActivityPort;
  learnerActivitySaveRecord: LearnerActivitySaveRecord;
  learnerActivitySaveRequest: LearnerActivitySaveRequest;
  learnerBootstrap: ScaffoldLearnerBootstrap;
  learnerHostServices: ScaffoldLearnerHostServices;
  learnerInitialState: ScaffoldLearnerInitialState;
  learningEvent: LearningEvent;
  learningEventActivity: LearningEventActivity;
  learningEventActivityDefinition: LearningEventActivityDefinition;
  learningEventContext: LearningEventContext;
  learningEventDuration: LearningEventDuration;
  learningEventInteractionComponent: LearningEventInteractionComponent;
  learningEventInteractionType: LearningEventInteractionType;
  learningEventIri: LearningEventIri;
  learningEventJsonValue: LearningEventJsonValue;
  learningEventLanguageMap: LearningEventLanguageMap;
  learningEventPort: LearningEventPort;
  learningEventResult: LearningEventResult;
  score: Score;
  learningEventTimestamp: LearningEventTimestamp;
  learningEventUuid: LearningEventUuid;
  learningEventVerb: LearningEventVerb;
  learnerPublicationPayload: LearnerPublicationPayload;
  learnerPublicationPort: LearnerPublicationPort;
  learnerPublicationStatus: LearnerPublicationStatus;
  mediaContext: ScaffoldMediaContext;
  mediaPort: MediaPort;
  mediaUploadMeta: MediaUploadMeta;
  mediaUploadResult: MediaUploadResult;
  mediaUploadType: MediaUploadType;
  quizAssessmentPort: QuizAssessmentPort;
  quizFinishAttemptRequest: QuizFinishAttemptRequest;
  quizRevealAnswersRequest: QuizRevealAnswersRequest;
  quizStartAttemptRequest: QuizStartAttemptRequest;
  quizSubmitQuestionRequest: QuizSubmitQuestionRequest;
  resolvedMediaMap: ScaffoldResolvedMediaMap;
  runtimePorts: ScaffoldRuntimePorts;
  sessionViolation: LearningEventSession;
  saveableArtifact: SaveableScaffoldArtifact;
};

describe("@scaffold/core/ports", () => {
  it("publishes the exact port value surface", () => {
    expect(Object.keys(ports).sort()).toEqual([
      "AssessmentProblemCommandOutcomeSchema",
      "AssessmentQuizCommandOutcomeSchema",
      "LearningEventIriSchema",
      "LearningEventSchema",
      "MEDIA_UPLOAD_TYPES",
      "SCAFFOLD_MEDIA_CONTEXTS",
      "artifactSaveFailed",
      "artifactSaveSucceeded",
      "learnerPublicationStatusFailed",
      "learnerPublicationStatusSucceeded",
      "learnerPublishFailed",
      "learnerPublishSucceeded",
    ]);
    expect(Object.values(ports).every((value) => value !== undefined)).toBe(true);
    expect(ports.SCAFFOLD_MEDIA_CONTEXTS).toEqual(["authoring", "preview", "runtime"]);
    expect(ports.MEDIA_UPLOAD_TYPES).toEqual([
      "image",
      "audio",
      "video",
      "pdf",
      "document",
      "spreadsheet",
      "presentation",
      "archive",
      "text",
      "other",
    ]);
    expect(ports).not.toHaveProperty("LearningEventDraftSchema");
  });

  it("publishes every port, request, result, and host contract type", () => {
    expectTypeOf<PortsTypeSurface>().toBeObject();
  });
});
