import { z } from "zod";

import {
  AssessmentProblemSnapshotSchema,
  EmbeddedNodeIdSchema,
  QuizAttemptStateSchema,
  type AnswerReveal,
  type AssessmentInteractionKind,
  type AssessmentResponseValue,
} from "@scaffold/contracts";

export type AuthoredAssessmentTargetId = string;
export type AssessmentProblemScopeId = string;
export type AssessmentGroupScopeId = string;
export type QuizAttemptId = string;

const AuthoredAssessmentTargetIdSchema: z.ZodType<string> = EmbeddedNodeIdSchema;

export const AssessmentProblemCommandOutcomeSchema = z.object({
  problem: AssessmentProblemSnapshotSchema,
});

export type AssessmentProblemCommandOutcome = z.infer<typeof AssessmentProblemCommandOutcomeSchema>;

export const AssessmentQuizCommandOutcomeSchema = z.object({
  quizAttempt: QuizAttemptStateSchema,
  problemsByTargetId: z.record(AuthoredAssessmentTargetIdSchema, AssessmentProblemSnapshotSchema),
});

export type AssessmentQuizCommandOutcome = z.infer<typeof AssessmentQuizCommandOutcomeSchema>;

export type AssessmentPortType = "runtime" | "preview";

export interface AssessmentCheckRequest {
  problemId: AssessmentProblemScopeId;
  targetId: AuthoredAssessmentTargetId;
  interactionKind: AssessmentInteractionKind;
  response: AssessmentResponseValue;
  expectedAttemptNumber: number;
}

export interface AssessmentSubmitRequest {
  problemId: AssessmentProblemScopeId;
  targetId: AuthoredAssessmentTargetId;
  interactionKind: AssessmentInteractionKind;
  response: AssessmentResponseValue;
  expectedAttemptNumber: number;
}

export interface AssessmentRevealRequest {
  problemId: AssessmentProblemScopeId;
  targetId: AuthoredAssessmentTargetId;
  interactionKind: AssessmentInteractionKind;
  response: AssessmentResponseValue;
}

export interface AssessmentRevealHintRequest {
  problemId: AssessmentProblemScopeId;
  targetId: AuthoredAssessmentTargetId;
  interactionKind: AssessmentInteractionKind;
  /** Immediate next reveal count requested by the learner runtime. */
  hintsShown: number;
}

export interface QuizStartAttemptRequest {
  groupId: AssessmentGroupScopeId;
}

export interface QuizSubmitQuestionRequest {
  attemptId: QuizAttemptId;
  groupId: AssessmentGroupScopeId;
  targetId: AuthoredAssessmentTargetId;
  response: AssessmentResponseValue;
  expectedAttemptNumber: number;
}

export interface QuizFinishAttemptRequest {
  attemptId: QuizAttemptId;
  groupId: AssessmentGroupScopeId;
  responsesByTargetId: Record<AuthoredAssessmentTargetId, AssessmentResponseValue>;
}

export interface QuizRevealAnswersRequest {
  attemptId: QuizAttemptId;
  groupId: AssessmentGroupScopeId;
}

export interface QuizAssessmentPort {
  startAttempt: (request: QuizStartAttemptRequest) => Promise<AssessmentQuizCommandOutcome>;
  submitQuestion: (request: QuizSubmitQuestionRequest) => Promise<AssessmentQuizCommandOutcome>;
  finishAttempt: (request: QuizFinishAttemptRequest) => Promise<AssessmentQuizCommandOutcome>;
  revealAnswers?: (request: QuizRevealAnswersRequest) => Promise<AssessmentQuizCommandOutcome>;
}

/**
 * Browser-facing assessment operations implemented by the host.
 *
 * Requests carry learner intent and stable identity only. Runtime hosts load
 * stored targets, groups, settings, and learner state before grading,
 * persisting attempts, authorizing reveals, or publishing platform grades.
 */
export interface AssessmentPort {
  type: AssessmentPortType;
  check?: (request: AssessmentCheckRequest) => Promise<AssessmentProblemCommandOutcome>;
  submit: (request: AssessmentSubmitRequest) => Promise<AssessmentProblemCommandOutcome>;
  /**
   * Persists a hint reveal and resolves with the authoritative stored count.
   * Omit this capability for previews or hosts that intentionally reveal hints locally.
   */
  revealHint?: (request: AssessmentRevealHintRequest) => Promise<AssessmentProblemCommandOutcome>;
  revealAnswer?: (request: AssessmentRevealRequest) => Promise<AnswerReveal>;
  quiz?: QuizAssessmentPort;
}
