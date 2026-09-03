import type { StoreApi } from "zustand/vanilla";

import type {
  AnswerReveal,
  AssessmentInteractionKind,
  AssessmentProblemSnapshot,
  AssessmentResult,
  AssessmentTargetSettings,
  QuizAssessmentSettings,
  QuizAttemptState,
} from "@scaffold/contracts";
import type {
  AssessmentCapabilityResponseDefinition,
  AssessmentExperienceDefinition,
} from "../../editor/blocks/block-definition";
import type { AssessmentPort } from "../../host/ports/assessment";
import type { AssessmentProblemId } from "../../document/model/identity/assessment-problem-id";
import type { AssessmentLearningEventDefinition } from "../learning-events/catalogue";
import type { LearningEventSessionAccessor } from "../learning-events/LearningEventRuntimeProvider";

export type { AssessmentProblemId } from "../../document/model/identity/assessment-problem-id";
export type AuthoredAssessmentBlockId = string;
export type AuthoredAssessmentTargetId = string;
export type AuthoredAssessmentGroupId = string;
export type AssessmentGroupId = `artifact:${string}/group:${string}`;
export type AssessmentScopedId = AssessmentProblemId | AssessmentGroupId;
export type AssessmentAnswerView = "submitted" | "correct";

export interface AssessmentDurableState {
  readonly problems: Readonly<Record<AssessmentProblemId, AssessmentProblemSnapshot>>;
  readonly quizzes: Readonly<Record<AssessmentGroupId, QuizAttemptState>>;
}

export interface AssessmentTransientState {
  readonly responseReady: Readonly<Record<AssessmentProblemId, boolean>>;
  readonly revealedAnswers: Readonly<Record<AssessmentProblemId, AnswerReveal>>;
  readonly answerViews: Readonly<Record<AssessmentProblemId, AssessmentAnswerView>>;
}

export type AssessmentRequestOperation =
  | "check"
  | "submit"
  | "reveal-hint"
  | "reveal-answer"
  | "quiz-start"
  | "quiz-submit-question"
  | "quiz-finish"
  | "quiz-expire"
  | "quiz-reveal-answers";

export type AssessmentCommittedOperation =
  | {
      readonly operation: "check" | "submit";
      readonly problemId: AssessmentProblemId;
    }
  | {
      readonly operation: "quiz-started" | "quiz-finished";
      readonly groupId: AssessmentGroupId;
    };

export type AssessmentCommittedOperationListener = (commit: AssessmentCommittedOperation) => void;

interface AssessmentRequestStateBase {
  readonly ownerId: AssessmentScopedId;
  readonly requestId: string;
  readonly operation: AssessmentRequestOperation;
}

export type AssessmentRequestState =
  | (AssessmentRequestStateBase & {
      readonly status: "pending";
      readonly error: null;
    })
  | (AssessmentRequestStateBase & {
      readonly status: "error";
      readonly error: string;
    });

export interface AssessmentRegistrationConfig {
  readonly experience: AssessmentExperienceDefinition;
  readonly settings: AssessmentTargetSettings;
  readonly hintsTotal: number;
  readonly learningEventDefinition: AssessmentLearningEventDefinition;
}

export interface AssessmentRegistrationIdentity {
  readonly authoredBlockId: AuthoredAssessmentBlockId;
  readonly targetId: AuthoredAssessmentTargetId;
  readonly interactionKind: AssessmentInteractionKind;
}

export interface AssessmentRegistrationInput extends AssessmentRegistrationIdentity {
  readonly response: AssessmentCapabilityResponseDefinition;
  readonly config: AssessmentRegistrationConfig;
}

export interface AssessmentRegistration {
  readonly problemId: AssessmentProblemId;
  readonly targetId: AuthoredAssessmentTargetId;
  readonly interactionKind: AssessmentInteractionKind;
  readonly response: AssessmentCapabilityResponseDefinition;
  readonly config: AssessmentRegistrationConfig;
}

export interface AssessmentQuizRegistrationIdentity {
  readonly groupId: AuthoredAssessmentGroupId;
}

export interface AssessmentQuizRegistrationInput extends AssessmentQuizRegistrationIdentity {
  readonly targetIds: readonly AuthoredAssessmentTargetId[];
  readonly settings: QuizAssessmentSettings;
}

export interface AssessmentQuizRegistration {
  readonly groupId: AssessmentGroupId;
  readonly authoredGroupId: AuthoredAssessmentGroupId;
  readonly targetIds: readonly AuthoredAssessmentTargetId[];
  readonly settings: QuizAssessmentSettings;
}

export interface CreateAssessmentStoreOptions {
  readonly artifactId: string;
  readonly assessmentPort: AssessmentPort | null;
  readonly getLearningEventSession?: LearningEventSessionAccessor;
}

export interface AssessmentStore {
  readonly artifactId: string;
  readonly durable: AssessmentDurableState;
  readonly targetBindings: Readonly<Record<AssessmentProblemId, AuthoredAssessmentTargetId>>;
  readonly registrations: Readonly<Record<AssessmentProblemId, AssessmentRegistration>>;
  readonly quizRegistrations: Readonly<Record<AssessmentGroupId, AssessmentQuizRegistration>>;
  readonly requests: Readonly<Record<AssessmentScopedId, AssessmentRequestState>>;
  readonly transient: AssessmentTransientState;
  readonly register: (registration: AssessmentRegistrationInput) => boolean;
  readonly update: (registration: AssessmentRegistrationInput) => boolean;
  readonly unregister: (identity: AssessmentRegistrationIdentity) => boolean;
  readonly registerQuiz: (registration: AssessmentQuizRegistrationInput) => boolean;
  readonly updateQuiz: (registration: AssessmentQuizRegistrationInput) => boolean;
  readonly unregisterQuiz: (identity: AssessmentQuizRegistrationIdentity) => boolean;
  readonly setLocalResponse: (
    identity: AssessmentRegistrationIdentity,
    response: unknown,
  ) => boolean;
  readonly check: (identity: AssessmentRegistrationIdentity) => Promise<AssessmentResult | null>;
  readonly submit: (identity: AssessmentRegistrationIdentity) => Promise<AssessmentResult | null>;
  readonly reset: (identity: AssessmentRegistrationIdentity) => boolean;
  readonly revealHint: (identity: AssessmentRegistrationIdentity) => Promise<boolean>;
  readonly revealAnswer: (identity: AssessmentRegistrationIdentity) => Promise<AnswerReveal | null>;
  readonly setAnswerView: (
    identity: AssessmentRegistrationIdentity,
    view: AssessmentAnswerView,
  ) => boolean;
  readonly startQuizAttempt: (
    identity: AssessmentQuizRegistrationIdentity,
  ) => Promise<QuizAttemptState | null>;
  readonly submitQuizQuestion: (
    quizIdentity: AssessmentQuizRegistrationIdentity,
    problemIdentity: AssessmentRegistrationIdentity,
  ) => Promise<QuizAttemptState | null>;
  readonly finishQuizAttempt: (
    identity: AssessmentQuizRegistrationIdentity,
  ) => Promise<QuizAttemptState | null>;
  readonly expireQuizAttempt: (
    identity: AssessmentQuizRegistrationIdentity,
  ) => Promise<QuizAttemptState | null>;
  readonly revealQuizAnswers: (
    identity: AssessmentQuizRegistrationIdentity,
  ) => Promise<QuizAttemptState | null>;
}

export interface AssessmentStoreApi extends StoreApi<AssessmentStore> {
  readonly subscribeToCommittedOperations: (
    listener: AssessmentCommittedOperationListener,
  ) => () => void;
}
