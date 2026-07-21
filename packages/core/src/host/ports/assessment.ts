import { z } from "zod";

import {
  AssessmentProblemSnapshotSchema,
  QuizAttemptStateSchema,
  type AnswerReveal,
  type AssessmentInteractionKind,
  type AssessmentResponseValue,
} from "@scaffold/contracts";

export const AssessmentProblemCommandOutcomeSchema = z.object({
  problem: AssessmentProblemSnapshotSchema,
});

export type AssessmentProblemCommandOutcome = z.infer<typeof AssessmentProblemCommandOutcomeSchema>;

export const AssessmentQuizCommandOutcomeSchema = z.object({
  quizAttempt: QuizAttemptStateSchema,
  problemsByTargetId: z.record(z.string(), AssessmentProblemSnapshotSchema),
});

export type AssessmentQuizCommandOutcome = z.infer<typeof AssessmentQuizCommandOutcomeSchema>;

export type AssessmentPortType = "runtime" | "preview";

export interface AssessmentCheckRequest {
  problemId: string;
  targetId: string;
  interactionKind: AssessmentInteractionKind;
  response: AssessmentResponseValue;
  expectedAttemptNumber: number;
}

export interface AssessmentSubmitRequest {
  problemId: string;
  targetId: string;
  interactionKind: AssessmentInteractionKind;
  response: AssessmentResponseValue;
  expectedAttemptNumber: number;
}

export interface AssessmentRevealRequest {
  problemId: string;
  targetId: string;
  interactionKind: AssessmentInteractionKind;
  response: AssessmentResponseValue;
}

export interface AssessmentRevealHintRequest {
  problemId: string;
  targetId: string;
  interactionKind: AssessmentInteractionKind;
  /** Immediate next reveal count requested by the learner runtime. */
  hintsShown: number;
}

export interface QuizStartAttemptRequest {
  groupId: string;
}

export interface QuizSubmitQuestionRequest {
  attemptId: string;
  groupId: string;
  targetId: string;
  response: AssessmentResponseValue;
  expectedAttemptNumber: number;
}

export interface QuizFinishAttemptRequest {
  attemptId: string;
  groupId: string;
  responsesByTargetId: Record<string, AssessmentResponseValue>;
}

export interface QuizRevealAnswersRequest {
  attemptId: string;
  groupId: string;
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
