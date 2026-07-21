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

export type AssessmentProblemId = `artifact:${string}/block:${string}`;
export type AssessmentGroupId = `artifact:${string}/group:${string}`;
export type AssessmentScopedId = AssessmentProblemId | AssessmentGroupId;

export interface AssessmentDurableState {
  readonly problems: Readonly<Record<AssessmentProblemId, AssessmentProblemSnapshot>>;
  readonly quizzes: Readonly<Record<AssessmentGroupId, QuizAttemptState>>;
}

export interface AssessmentTransientState {
  readonly responseReady: Readonly<Record<AssessmentProblemId, boolean>>;
  readonly revealedAnswers: Readonly<Record<AssessmentProblemId, AnswerReveal>>;
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
}

export interface AssessmentRegistrationIdentity {
  readonly problemId: string;
  readonly targetId: string;
  readonly interactionKind: AssessmentInteractionKind;
}

export interface AssessmentRegistrationInput extends AssessmentRegistrationIdentity {
  readonly response: AssessmentCapabilityResponseDefinition;
  readonly config: AssessmentRegistrationConfig;
}

export interface AssessmentRegistration {
  readonly problemId: AssessmentProblemId;
  readonly targetId: string;
  readonly interactionKind: AssessmentInteractionKind;
  readonly response: AssessmentCapabilityResponseDefinition;
  readonly config: AssessmentRegistrationConfig;
}

export interface AssessmentQuizRegistrationIdentity {
  readonly groupId: string;
}

export interface AssessmentQuizRegistrationInput extends AssessmentQuizRegistrationIdentity {
  readonly targetIds: readonly string[];
  readonly settings: QuizAssessmentSettings;
}

export interface AssessmentQuizRegistration {
  readonly groupId: AssessmentGroupId;
  readonly targetIds: readonly string[];
  readonly settings: QuizAssessmentSettings;
}

export interface CreateAssessmentStoreOptions {
  readonly artifactId: string;
  readonly assessmentPort: AssessmentPort | null;
}

export interface AssessmentStore {
  readonly artifactId: string;
  readonly durable: AssessmentDurableState;
  readonly targetBindings: Readonly<Record<AssessmentProblemId, string>>;
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

export type AssessmentStoreApi = StoreApi<AssessmentStore>;
