import { describe, expect, it } from "vite-plus/test";

import type {
  AnswerReveal,
  AssessmentProblemSnapshot,
  AssessmentResult,
  QuizAttemptState,
} from "@scaffold/contracts";

import {
  AssessmentProblemCommandOutcomeSchema,
  AssessmentQuizCommandOutcomeSchema,
  type AssessmentProblemCommandOutcome,
  type AssessmentCheckRequest,
  type AssessmentPort,
  type AssessmentRevealHintRequest,
  type AssessmentSubmitRequest,
  type QuizFinishAttemptRequest,
  type QuizStartAttemptRequest,
  type QuizSubmitQuestionRequest,
} from "./assessment";

const result: AssessmentResult = {
  isCorrect: true,
  score: 1,
  maxScore: 1,
  feedback: null,
  items: {},
};

const reveal: AnswerReveal = {
  answerKey: {
    kind: "single-select",
    correctOptionId: "choice-b",
    feedbackByOptionId: {},
  },
};

const attempt: QuizAttemptState = {
  attemptId: "attempt-1",
  groupId: "quiz-1",
  status: "in_progress",
  currentTargetId: "question-1",
  submittedTargetIds: [],
  startedAt: null,
  finishedAt: null,
  expiresAt: null,
  score: null,
  maxScore: null,
  resultsByTargetId: {},
  answerReviewAuthorized: false,
};

const problem: AssessmentProblemSnapshot = {
  response: { kind: "single-select", optionId: "choice-b" },
  attemptNumber: 1,
  hintsShown: 0,
  checkResult: result,
  submitted: false,
  submissionResult: null,
};

const problemOutcome: AssessmentProblemCommandOutcome = { problem };
const quizOutcome = {
  quizAttempt: attempt,
  problemsByTargetId: { "question-1": problem },
};

describe("AssessmentPort", () => {
  it("supports runtime operations with minimal Contract-based requests", async () => {
    const checkRequest: AssessmentCheckRequest = {
      problemId: "artifact:course-1/block:question-1",
      targetId: "question-1",
      interactionKind: "single-select",
      response: { kind: "single-select", optionId: "choice-b" },
      expectedAttemptNumber: 0,
    };
    const submitRequest: AssessmentSubmitRequest = { ...checkRequest };
    const revealHintRequest: AssessmentRevealHintRequest = {
      problemId: checkRequest.problemId,
      targetId: checkRequest.targetId,
      interactionKind: checkRequest.interactionKind,
      hintsShown: 1,
    };
    const startRequest: QuizStartAttemptRequest = { groupId: "quiz-1" };
    const questionRequest: QuizSubmitQuestionRequest = {
      attemptId: "attempt-1",
      groupId: "quiz-1",
      targetId: "question-1",
      response: { kind: "single-select", optionId: "choice-b" },
      expectedAttemptNumber: 0,
    };
    const finishRequest: QuizFinishAttemptRequest = {
      attemptId: "attempt-1",
      groupId: "quiz-1",
      responsesByTargetId: {
        "question-1": { kind: "single-select", optionId: "choice-b" },
      },
    };
    const runtimePort: AssessmentPort = {
      type: "runtime",
      check: async () => problemOutcome,
      submit: async () => problemOutcome,
      revealHint: async () => problemOutcome,
      revealAnswer: async () => reveal,
      quiz: {
        startAttempt: async () => quizOutcome,
        submitQuestion: async () => quizOutcome,
        finishAttempt: async () => quizOutcome,
        revealAnswers: async () => quizOutcome,
      },
    };

    await expect(runtimePort.check?.(checkRequest)).resolves.toBe(problemOutcome);
    await expect(runtimePort.submit(submitRequest)).resolves.toBe(problemOutcome);
    await expect(runtimePort.revealHint?.(revealHintRequest)).resolves.toBe(problemOutcome);
    await expect(runtimePort.quiz?.startAttempt(startRequest)).resolves.toBe(quizOutcome);
    await expect(runtimePort.quiz?.submitQuestion(questionRequest)).resolves.toBe(quizOutcome);
    await expect(runtimePort.quiz?.finishAttempt(finishRequest)).resolves.toBe(quizOutcome);

    expect(AssessmentProblemCommandOutcomeSchema.parse(problemOutcome)).toEqual(problemOutcome);
    expect(AssessmentQuizCommandOutcomeSchema.parse(quizOutcome)).toEqual(quizOutcome);
    expect(() =>
      AssessmentQuizCommandOutcomeSchema.parse({
        quizAttempt: attempt,
        problemsByTargetId: { "question-1": { ...problem, attemptNumber: -1 } },
      }),
    ).toThrow();
  });

  it("keeps check, reveal, and Quiz capabilities optional for preview ports", async () => {
    const previewPort: AssessmentPort = {
      type: "preview",
      submit: async () => problemOutcome,
    };

    expect(previewPort.type).toBe("preview");
    expect(previewPort.revealHint).toBeUndefined();
    await expect(
      previewPort.submit({
        problemId: "artifact:course-1/block:question-1",
        targetId: "question-1",
        interactionKind: "single-select",
        response: { kind: "single-select", optionId: "choice-b" },
        expectedAttemptNumber: 0,
      }),
    ).resolves.toBe(problemOutcome);
  });
});
