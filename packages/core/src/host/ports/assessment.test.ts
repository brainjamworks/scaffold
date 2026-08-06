import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import {
  AnswerRevealSchema,
  AssessmentProblemSnapshotSchema,
  QuizAttemptStateSchema,
  SingleSelectResponseSchema,
  type AssessmentResult,
} from "@scaffold/contracts";

import {
  AssessmentProblemCommandOutcomeSchema,
  AssessmentQuizCommandOutcomeSchema,
  type AssessmentProblemCommandOutcome,
  type AssessmentProblemScopeId,
  type AssessmentCheckRequest,
  type AssessmentGroupScopeId,
  type AssessmentPort,
  type AssessmentRevealHintRequest,
  type AssessmentSubmitRequest,
  type AuthoredAssessmentTargetId,
  type QuizAttemptId,
  type QuizFinishAttemptRequest,
  type QuizStartAttemptRequest,
  type QuizSubmitQuestionRequest,
} from "./assessment";

const result: AssessmentResult = {
  isCorrect: true,
  score: { scaled: 1 },
  feedback: null,
  items: {},
};

const reveal = AnswerRevealSchema.parse({
  answerKey: {
    kind: "single-select",
    correctOptionId: "option_00002",
    feedbackByOptionId: {},
  },
});

const attempt = QuizAttemptStateSchema.parse({
  attemptId: "attempt-1",
  groupId: "artifact:course-1/group:quiz__000001",
  status: "in_progress",
  currentTargetId: "questn_00001",
  submittedTargetIds: [],
  startedAt: null,
  finishedAt: null,
  expiresAt: null,
  score: null,
  successStatus: null,
  resultsByTargetId: {},
  answerReviewAuthorized: false,
});

const response = SingleSelectResponseSchema.parse({
  kind: "single-select",
  optionId: "option_00002",
});

const problem = AssessmentProblemSnapshotSchema.parse({
  response,
  attemptNumber: 1,
  hintsShown: 0,
  checkResult: result,
  submitted: false,
  submissionResult: null,
});

const problemOutcome: AssessmentProblemCommandOutcome = { problem };
const quizOutcome = {
  quizAttempt: attempt,
  problemsByTargetId: { questn_00001: problem },
};

describe("AssessmentPort", () => {
  it("keeps authored targets and opaque host attempts semantically named", () => {
    expectTypeOf<AssessmentCheckRequest["targetId"]>().toEqualTypeOf<AuthoredAssessmentTargetId>();
    expectTypeOf<QuizSubmitQuestionRequest["attemptId"]>().toEqualTypeOf<QuizAttemptId>();
    expectTypeOf<AuthoredAssessmentTargetId>().toEqualTypeOf<string>();
    expectTypeOf<AssessmentProblemScopeId>().toEqualTypeOf<string>();
    expectTypeOf<AssessmentGroupScopeId>().toEqualTypeOf<string>();
    expectTypeOf<QuizAttemptId>().toEqualTypeOf<string>();
  });

  it("supports runtime operations with minimal Contract-based requests", async () => {
    const checkRequest: AssessmentCheckRequest = {
      problemId: "artifact:course-1/block:questn_00001",
      targetId: "questn_00001",
      interactionKind: "single-select",
      response,
      expectedAttemptNumber: 0,
    };
    const submitRequest: AssessmentSubmitRequest = { ...checkRequest };
    const revealHintRequest: AssessmentRevealHintRequest = {
      problemId: checkRequest.problemId,
      targetId: checkRequest.targetId,
      interactionKind: checkRequest.interactionKind,
      hintsShown: 1,
    };
    const startRequest: QuizStartAttemptRequest = {
      groupId: "artifact:course-1/group:quiz__000001",
    };
    const questionRequest: QuizSubmitQuestionRequest = {
      attemptId: "attempt-1",
      groupId: "artifact:course-1/group:quiz__000001",
      targetId: "questn_00001",
      response,
      expectedAttemptNumber: 0,
    };
    const finishRequest: QuizFinishAttemptRequest = {
      attemptId: "attempt-1",
      groupId: "artifact:course-1/group:quiz__000001",
      responsesByTargetId: {
        questn_00001: response,
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
        problemsByTargetId: { questn_00001: { ...problem, attemptNumber: -1 } },
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
        problemId: "artifact:course-1/block:questn_00001",
        targetId: "questn_00001",
        interactionKind: "single-select",
        response,
        expectedAttemptNumber: 0,
      }),
    ).resolves.toBe(problemOutcome);
  });
});
