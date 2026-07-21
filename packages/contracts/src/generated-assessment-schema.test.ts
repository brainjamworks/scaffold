import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vite-plus/test";
import type { ZodTypeAny } from "zod";

import assessmentJsonSchema from "../generated/assessment.schema.json";
import {
  AssessmentGradeProjectionSchema,
  AssessmentGroupContractSchema,
  AssessmentLearnerSnapshotSchema,
  AssessmentProblemSnapshotSchema,
  AssessmentResponseValueSchema,
  AssessmentResultSchema,
  AssessmentTargetContractSchema,
  QuizAttemptSnapshotSchema,
  QuizAttemptStateSchema,
} from "./index";

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addSchema(assessmentJsonSchema);

function validatorFor(definitionName: string): ValidateFunction {
  const validator = ajv.getSchema(`${assessmentJsonSchema.$id}#/definitions/${definitionName}`);
  if (!validator) throw new Error(`Missing generated definition: ${definitionName}`);
  return validator;
}

function expectAccepted(zodSchema: ZodTypeAny, definitionName: string, value: unknown): void {
  expect(zodSchema.safeParse(value).success).toBe(true);
  const validator = validatorFor(definitionName);
  expect(validator(value), JSON.stringify(validator.errors)).toBe(true);
}

function expectRejected(zodSchema: ZodTypeAny, definitionName: string, value: unknown): void {
  expect(zodSchema.safeParse(value).success).toBe(false);
  expect(validatorFor(definitionName)(value)).toBe(false);
}

const target = {
  schemaVersion: 1,
  targetId: "question-1",
  blockId: "block-1",
  blockType: "mcq",
  interaction: {
    kind: "single-select",
    options: [
      { id: "option-a", label: "A" },
      { id: "option-b", label: "B" },
    ],
  },
  assessment: {
    kind: "single-select",
    correctOptionId: "option-b",
    feedbackByOptionId: {},
  },
  settings: {
    feedbackMode: "on_submit",
    isGraded: true,
    showAnswer: true,
    points: 1,
    maxAttempts: null,
  },
};

const group = {
  schemaVersion: 1,
  kind: "quiz",
  groupId: "quiz-1",
  targetIds: ["question-1", "question-2"],
  settings: {
    allowBacktracking: true,
    reviewTiming: "after_quiz",
    reviewDetail: "result_only",
    attemptsPerQuestion: 1,
    isGraded: true,
    timer: { enabled: false, durationSeconds: 0 },
  },
};

const result = {
  isCorrect: true,
  score: 1,
  maxScore: 1,
  feedback: null,
  items: {},
};

const quizAttempt = {
  attemptId: "attempt-1",
  groupId: "quiz-1",
  status: "in_progress",
  currentTargetId: "question-1",
  submittedTargetIds: [],
  startedAt: "2026-07-15T12:00:00Z",
  finishedAt: null,
  expiresAt: null,
  score: null,
  maxScore: null,
  resultsByTargetId: {},
  answerReviewAuthorized: false,
};

const quizAttemptSnapshot = {
  attemptId: "attempt-1",
  status: "in_progress",
  currentTargetId: "question-1",
  submittedTargetIds: [],
  startedAt: "2026-07-15T12:00:00Z",
  finishedAt: null,
  expiresAt: null,
  score: null,
  maxScore: null,
  resultsByTargetId: {},
  answerReviewAuthorized: false,
};

const emptyProblem = {
  response: null,
  submitted: false,
  attemptNumber: 0,
  hintsShown: 0,
  checkResult: null,
  submissionResult: null,
};

const snapshot = {
  snapshotVersion: 1,
  artifactId: "artifact-1",
  problems: { "question-1": emptyProblem },
  quizzes: { "quiz-1": quizAttemptSnapshot },
};

describe("generated assessment JSON Schema", () => {
  it("publishes a version-neutral Draft-07 bundle with stable public definitions", () => {
    expect(assessmentJsonSchema.$schema).toBe("http://json-schema.org/draft-07/schema#");
    expect(assessmentJsonSchema.$id).toBe("https://scaffold.ac/schemas/assessment.schema.json");
    expect(Object.keys(assessmentJsonSchema.definitions)).toEqual([
      "AnswerReveal",
      "AssessmentFeedbackContent",
      "AssessmentGradeProjection",
      "AssessmentGroupContract",
      "AssessmentItemDetail",
      "AssessmentItemValue",
      "AssessmentLearnerSnapshot",
      "AssessmentProblemSnapshot",
      "AssessmentResponseValue",
      "AssessmentResult",
      "AssessmentTargetContract",
      "QuizAttemptSnapshot",
      "QuizAttemptState",
    ]);
    expect(assessmentJsonSchema.$comment).toBe(
      "This bundle is generated from the strict v1 Zod contracts and carries their portable assessment invariants.",
    );
  });

  it("matches representable target and group structure", () => {
    expectAccepted(AssessmentTargetContractSchema, "AssessmentTargetContract", target);
    expectRejected(AssessmentTargetContractSchema, "AssessmentTargetContract", {
      ...target,
      schemaVersion: 2,
    });
    expectRejected(AssessmentTargetContractSchema, "AssessmentTargetContract", {
      ...target,
      settings: { ...target.settings, points: -1 },
    });
    expectRejected(AssessmentTargetContractSchema, "AssessmentTargetContract", {
      ...target,
      hostMaximum: 100,
    });
    expectRejected(AssessmentTargetContractSchema, "AssessmentTargetContract", {
      ...target,
      interaction: { ...target.interaction, provider: "host" },
    });
    expectRejected(AssessmentTargetContractSchema, "AssessmentTargetContract", {
      ...target,
      interaction: {
        ...target.interaction,
        options: [{ ...target.interaction.options[0], providerPayload: {} }],
      },
    });
    expectRejected(AssessmentTargetContractSchema, "AssessmentTargetContract", {
      ...target,
      assessment: { ...target.assessment, hostItemId: "item-1" },
    });

    expectAccepted(AssessmentGroupContractSchema, "AssessmentGroupContract", group);
    expectRejected(AssessmentGroupContractSchema, "AssessmentGroupContract", {
      ...group,
      targetIds: [],
    });
    expectRejected(AssessmentGroupContractSchema, "AssessmentGroupContract", {
      ...group,
      settings: { ...group.settings, attemptsPerQuestion: 4 },
    });
    expectRejected(AssessmentGroupContractSchema, "AssessmentGroupContract", {
      ...group,
      provider: "xblock",
    });
  });

  it("accepts every canonical response family and rejects malformed discriminants", () => {
    const responses = [
      { kind: "single-select", optionId: null },
      { kind: "multi-select", optionIds: ["option-a"] },
      { kind: "sequence", orderedItemIds: ["item-1"] },
      { kind: "match", pairs: [{ itemId: "item-1", targetId: "target-1" }] },
      {
        kind: "classify",
        placements: [{ itemId: "item-1", categoryId: "category-1" }],
      },
      { kind: "fill-blanks", blanks: [{ blankId: "blank-1", value: "answer" }] },
      { kind: "spatial-hotspot", selections: [{ hotspotId: null, x: 0.25, y: 0.75 }] },
    ];

    for (const response of responses) {
      expectAccepted(AssessmentResponseValueSchema, "AssessmentResponseValue", response);
    }
    expectRejected(AssessmentResponseValueSchema, "AssessmentResponseValue", {
      kind: "choice",
      optionId: "option-a",
    });
    expectRejected(AssessmentResponseValueSchema, "AssessmentResponseValue", {
      kind: "spatial-hotspot",
      selections: [{ hotspotId: null, x: "0.25", y: 0.75 }],
    });
  });

  it("matches representable result and Quiz attempt constraints", () => {
    expectAccepted(AssessmentResultSchema, "AssessmentResult", result);
    expectRejected(AssessmentResultSchema, "AssessmentResult", { ...result, score: 1.01 });
    expectRejected(AssessmentResultSchema, "AssessmentResult", { ...result, maxScore: 2 });
    expectRejected(AssessmentResultSchema, "AssessmentResult", {
      ...result,
      provider: "moodle",
    });

    expectAccepted(QuizAttemptStateSchema, "QuizAttemptState", quizAttempt);
    expectRejected(QuizAttemptStateSchema, "QuizAttemptState", {
      ...quizAttempt,
      status: "not_started",
    });
    expectRejected(QuizAttemptStateSchema, "QuizAttemptState", {
      ...quizAttempt,
      score: -1,
      maxScore: 1,
    });
    const incompleteQuizAttempt = structuredClone(quizAttempt);
    Reflect.deleteProperty(incompleteQuizAttempt, "answerReviewAuthorized");
    expectRejected(QuizAttemptStateSchema, "QuizAttemptState", incompleteQuizAttempt);
  });

  it("matches representable grade projection constraints including timestamp checks", () => {
    const ungraded = {
      normalizedScore: null,
      activityStatus: "not_started",
      gradingStatus: "not_ready",
      changedAt: "2026-07-15T10:00:00.123Z",
    };
    const graded = {
      normalizedScore: 0.75,
      activityStatus: "completed",
      gradingStatus: "graded",
      changedAt: "2026-07-15T11:00:00.456+01:00",
    };

    expectAccepted(AssessmentGradeProjectionSchema, "AssessmentGradeProjection", ungraded);
    expectAccepted(AssessmentGradeProjectionSchema, "AssessmentGradeProjection", graded);
    expectRejected(AssessmentGradeProjectionSchema, "AssessmentGradeProjection", {
      ...graded,
      normalizedScore: 1.01,
    });
    expectRejected(AssessmentGradeProjectionSchema, "AssessmentGradeProjection", {
      ...graded,
      changedAt: "2026-07-15T10:00:00Z",
    });
    expectRejected(AssessmentGradeProjectionSchema, "AssessmentGradeProjection", {
      ...graded,
      gradingStatus: "pending",
    });
  });

  it("matches representable problem and learner snapshot constraints", () => {
    expectAccepted(AssessmentProblemSnapshotSchema, "AssessmentProblemSnapshot", emptyProblem);
    expectAccepted(AssessmentProblemSnapshotSchema, "AssessmentProblemSnapshot", {
      ...emptyProblem,
      response: { kind: "single-select", optionId: "option-a" },
      submitted: true,
      attemptNumber: 1,
      submissionResult: result,
    });
    expectRejected(AssessmentProblemSnapshotSchema, "AssessmentProblemSnapshot", {
      ...emptyProblem,
      attemptNumber: 0.5,
    });
    expectRejected(AssessmentProblemSnapshotSchema, "AssessmentProblemSnapshot", {
      ...emptyProblem,
      revealedAnswer: null,
    });

    expectAccepted(AssessmentLearnerSnapshotSchema, "AssessmentLearnerSnapshot", snapshot);
    expectAccepted(QuizAttemptSnapshotSchema, "QuizAttemptSnapshot", quizAttemptSnapshot);
    expectRejected(AssessmentLearnerSnapshotSchema, "AssessmentLearnerSnapshot", {
      ...snapshot,
      snapshotVersion: 2,
    });
    expectRejected(AssessmentLearnerSnapshotSchema, "AssessmentLearnerSnapshot", {
      ...snapshot,
      problems: [],
    });
    expectRejected(AssessmentLearnerSnapshotSchema, "AssessmentLearnerSnapshot", {
      ...snapshot,
      gradeProjection: {},
    });
  });

  it("rejects the complete portable invariant corpus in both Zod and JSON Schema", () => {
    const invariantCases: Array<{
      definitionName: string;
      schema: ZodTypeAny;
      value: unknown;
    }> = [
      {
        definitionName: "AssessmentTargetContract",
        schema: AssessmentTargetContractSchema,
        value: {
          ...target,
          assessment: {
            kind: "multi-select",
            correctOptionIds: ["option-a"],
            feedbackByOptionId: {},
          },
        },
      },
      {
        definitionName: "AssessmentTargetContract",
        schema: AssessmentTargetContractSchema,
        value: { ...target, targetId: "   " },
      },
      {
        definitionName: "AssessmentGroupContract",
        schema: AssessmentGroupContractSchema,
        value: { ...group, targetIds: ["question-1", "question-1"] },
      },
      {
        definitionName: "AssessmentGradeProjection",
        schema: AssessmentGradeProjectionSchema,
        value: {
          normalizedScore: null,
          activityStatus: "completed",
          gradingStatus: "graded",
          changedAt: "2026-07-15T10:00:00.123Z",
        },
      },
      {
        definitionName: "QuizAttemptState",
        schema: QuizAttemptStateSchema,
        value: { ...quizAttempt, score: null, maxScore: 1 },
      },
      {
        definitionName: "QuizAttemptState",
        schema: QuizAttemptStateSchema,
        value: {
          ...quizAttempt,
          submittedTargetIds: ["question-1", "question-1"],
        },
      },
      {
        definitionName: "AssessmentProblemSnapshot",
        schema: AssessmentProblemSnapshotSchema,
        value: { ...emptyProblem, submitted: true },
      },
      {
        definitionName: "AssessmentLearnerSnapshot",
        schema: AssessmentLearnerSnapshotSchema,
        value: { ...snapshot, problems: { "   ": emptyProblem } },
      },
      {
        definitionName: "AssessmentLearnerSnapshot",
        schema: AssessmentLearnerSnapshotSchema,
        value: {
          ...snapshot,
          problems: { "artifact:artifact-1/block:question-1": emptyProblem },
        },
      },
      {
        definitionName: "AssessmentLearnerSnapshot",
        schema: AssessmentLearnerSnapshotSchema,
        value: {
          ...snapshot,
          quizzes: { "quiz-1": { ...quizAttemptSnapshot, groupId: "quiz-1" } },
        },
      },
    ];

    for (const testCase of invariantCases) {
      expectRejected(testCase.schema, testCase.definitionName, testCase.value);
    }
  });
});
