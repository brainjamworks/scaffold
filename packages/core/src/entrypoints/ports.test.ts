import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import * as ports from "@scaffold/core/ports";
import type {
  ArtifactPersistencePort,
  ArtifactSaveBundle,
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

type PortsTypeSurface = {
  artifactCreationInput: ScaffoldArtifactCreationInput;
  artifactCreationMetadata: ScaffoldArtifactCreationMetadata;
  artifactCreationMode: ScaffoldArtifactCreationMode;
  artifactCreationPort: ScaffoldArtifactCreationPort;
  artifactPersistencePort: ArtifactPersistencePort;
  artifactSaveBundle: ArtifactSaveBundle;
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
  saveableArtifact: SaveableScaffoldArtifact;
};

describe("@scaffold/core/ports", () => {
  it("publishes the exact port value surface", () => {
    expect(Object.keys(ports).sort()).toEqual([
      "AssessmentProblemCommandOutcomeSchema",
      "AssessmentQuizCommandOutcomeSchema",
      "MEDIA_UPLOAD_TYPES",
      "SCAFFOLD_MEDIA_CONTEXTS",
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
  });

  it("publishes every port, request, result, and host contract type", () => {
    expectTypeOf<PortsTypeSurface>().toBeObject();
  });
});
