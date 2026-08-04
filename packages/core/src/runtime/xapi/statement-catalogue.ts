/**
 * @deprecated Migration-only forwarding façade for not-yet-migrated Core producers.
 *
 * Learning Event meaning is owned by `runtime/learning-events/catalogue`.
 * Remove this module in Generalised Learning Events Phase 6.
 */
import { LEARNING_EVENT_ACTIVITY_TYPES } from "../learning-events/catalogue";

export const XAPI_ACTIVITY_TYPES = Object.freeze({
  ...LEARNING_EVENT_ACTIVITY_TYPES,
  course: LEARNING_EVENT_ACTIVITY_TYPES.artefact,
});

export {
  LEARNING_EVENT_EXTENSIONS as XAPI_EXTENSIONS,
  LEARNING_EVENT_VERBS as XAPI_VERBS,
  buildAnsweredLearningEventDraft as buildAnsweredStatementDraft,
  buildAssessmentActivityDefinition,
  buildHintInteractedLearningEventDraft as buildHintInteractedStatementDraft,
  buildInitializedLearningEventDraft as buildInitializedStatementDraft,
  buildLearnerActivityCompletedLearningEventDraft as buildLearnerActivityCompletedStatementDraft,
  buildLearnerActivityInteractedLearningEventDraft as buildLearnerActivityInteractedStatementDraft,
  buildLayoutSectionExperiencedLearningEventDraft as buildLayoutSectionExperiencedStatementDraft,
  buildQuizAttemptedLearningEventDraft as buildQuizAttemptedStatementDraft,
  buildQuizCompletedLearningEventDraft as buildQuizCompletedStatementDraft,
  buildQuizSuccessLearningEventDraft as buildQuizSuccessStatementDraft,
  buildResourceAttemptedLearningEventDraft as buildResourceAttemptedStatementDraft,
  buildResourceCompletedLearningEventDraft as buildResourceCompletedStatementDraft,
  buildResourceLaunchedLearningEventDraft as buildResourceLaunchedStatementDraft,
  buildResourcePageExperiencedLearningEventDraft as buildResourcePageExperiencedStatementDraft,
  buildSurfaceExperiencedLearningEventDraft as buildSurfaceExperiencedStatementDraft,
  buildTerminatedLearningEventDraft as buildTerminatedStatementDraft,
  buildVisualItemExperiencedLearningEventDraft as buildVisualItemExperiencedStatementDraft,
  createAssessmentActivityId,
  createHintActivityId,
  createLearnerActivityId,
  createLayoutSectionActivityId,
  createQuizActivityId,
  createResourceActivityId,
  createResourcePageActivityId,
  createSurfaceActivityId,
  createVisualCompositionActivityId,
  createVisualItemActivityId,
  encodeAssessmentResponse,
  isLearningEventLearnerActivityKind as isXapiLearnerActivityKind,
} from "../learning-events/catalogue";

export type {
  ChecklistItemToggledLearningEvent as ChecklistItemToggledXapiEvent,
  EncodedLearningEventAssessmentResponse as EncodedXapiAssessmentResponse,
  FlashcardFlippedLearningEvent as FlashcardFlippedXapiEvent,
  FlashcardRatedLearningEvent as FlashcardRatedXapiEvent,
  LearnerActivityLearningEvent as LearnerActivityXapiEvent,
  LearningEventLayoutKind as XapiLayoutKind,
  LearningEventLearnerActivityKind as XapiLearnerActivityKind,
  LearningEventResourceKind as XapiResourceKind,
  LearningEventSurfaceKind as XapiSurfaceKind,
  LearningEventVisualItemKind as XapiVisualItemKind,
} from "../learning-events/catalogue";
