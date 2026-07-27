import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import * as grading from "@scaffold/grading";

import { createLocalAssessmentPortFromProjection } from "./createLocalAssessmentPort";
import { LOCAL_ARTIFACT_ID } from "./local-artifact-id";
import { quizAssessmentProjection } from "./localAssessmentProjection.test-fixture";

const RUNTIME_QUIZ_GROUP_ID = `artifact:${LOCAL_ARTIFACT_ID}/group:quiz-1`;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("createLocalAssessmentPort quiz runtime", () => {
  it("grades checks from a projected assessment fixture", async () => {
    const port = createLocalAssessmentPortFromProjection(() => quizAssessmentProjection());

    const result = await port.check!({
      problemId: `artifact:${LOCAL_ARTIFACT_ID}/block:mcq-1`,
      targetId: "mcq-1",
      interactionKind: "single-select",
      response: { kind: "single-select", optionId: "a" },
      expectedAttemptNumber: 0,
    });

    expect(result.problem.checkResult).toMatchObject({ isCorrect: true, score: 1 });
  });

  it("rejects a non-canonical local grading result", async () => {
    vi.spyOn(grading, "gradeAssessment").mockReturnValue({
      isCorrect: false,
      score: 2,
      maxScore: 1,
      feedback: null,
      items: {},
    });
    const port = createLocalAssessmentPortFromProjection(() => quizAssessmentProjection());

    await expect(
      port.check!({
        problemId: `artifact:${LOCAL_ARTIFACT_ID}/block:mcq-1`,
        targetId: "mcq-1",
        interactionKind: "single-select",
        response: { kind: "single-select", optionId: "a" },
        expectedAttemptNumber: 0,
      }),
    ).rejects.toThrow();
  });

  it("returns exact canonical zero, partial, and full standalone results", async () => {
    const port = createLocalAssessmentPortFromProjection(() => ({
      assessmentGroups: [],
      assessmentTargets: [
        {
          schemaVersion: 2,
          targetId: "multi-1",
          blockId: "multi-1",
          blockType: "multiselect",
          interaction: {
            kind: "multi-select",
            options: [{ id: "a" }, { id: "b" }, { id: "c" }],
            maxSelections: null,
          },
          assessment: {
            kind: "multi-select",
            correctOptionIds: ["a", "b"],
            feedbackByOptionId: {},
            summaryFeedback: null,
          },
          settings: {
            feedbackMode: "on_submit",
            isGraded: true,
            showAnswer: true,
            points: 4,
            maxAttempts: null,
          },
        },
      ],
    }));
    const submit = (optionIds: string[]) =>
      port.submit({
        problemId: `artifact:${LOCAL_ARTIFACT_ID}/block:multi-1`,
        targetId: "multi-1",
        interactionKind: "multi-select",
        response: { kind: "multi-select", optionIds },
        expectedAttemptNumber: 0,
      });

    await expect(submit([])).resolves.toMatchObject({
      problem: {
        submissionResult: {
          isCorrect: false,
          score: 0,
          maxScore: 1,
          feedback: null,
          items: {
            a: { correct: false, expected: true, given: false },
            b: { correct: false, expected: true, given: false },
            c: { correct: true, expected: false, given: false },
          },
        },
      },
    });
    await expect(submit(["a"])).resolves.toMatchObject({
      problem: {
        submissionResult: {
          isCorrect: false,
          score: 0.5,
          maxScore: 1,
          feedback: null,
          items: {
            a: { correct: true, expected: true, given: true },
            b: { correct: false, expected: true, given: false },
            c: { correct: true, expected: false, given: false },
          },
        },
      },
    });
    await expect(submit(["a", "b"])).resolves.toMatchObject({
      problem: {
        submissionResult: {
          isCorrect: true,
          score: 1,
          maxScore: 1,
          feedback: null,
          items: {
            a: { correct: true, expected: true, given: true },
            b: { correct: true, expected: true, given: true },
            c: { correct: true, expected: false, given: false },
          },
        },
      },
    });
  });

  it("exposes only the local assessment host operations", () => {
    const port = createLocalAssessmentPortFromProjection(() => quizAssessmentProjection());

    expect(Object.keys(port).sort()).toEqual(["check", "quiz", "revealAnswer", "submit", "type"]);
    expect(port).not.toHaveProperty("gradeProjection");
    expect(port).not.toHaveProperty("hostMaximum");
    expect(port).not.toHaveProperty("providerPayload");
  });

  it("rejects answer reveal when the target is missing", async () => {
    const port = createLocalAssessmentPortFromProjection(() => quizAssessmentProjection());

    await expect(
      port.revealAnswer?.({
        problemId: `artifact:${LOCAL_ARTIFACT_ID}/block:missing-target`,
        targetId: "missing-target",
        interactionKind: "single-select",
        response: { kind: "single-select", optionId: null },
      }),
    ).rejects.toThrow("local assessment target not found: missing-target");
  });

  it("starts and finishes a projected quiz with local aggregate grading", async () => {
    const port = createLocalAssessmentPortFromProjection(
      projectionSource(quizAssessmentProjection()),
    );

    const started = await port.quiz?.startAttempt({
      groupId: RUNTIME_QUIZ_GROUP_ID,
    });
    const finished = await port.quiz?.finishAttempt({
      attemptId: started?.quizAttempt.attemptId ?? "attempt-1",
      groupId: RUNTIME_QUIZ_GROUP_ID,
      responsesByTargetId: {
        "mcq-1": { kind: "single-select", optionId: "a" },
        "mcq-2": { kind: "single-select", optionId: "a" },
      },
    });

    expect(started?.quizAttempt).toMatchObject({
      groupId: RUNTIME_QUIZ_GROUP_ID,
      status: "in_progress",
      currentTargetId: "mcq-1",
      submittedTargetIds: [],
      score: null,
      maxScore: null,
      successStatus: null,
    });
    expect(finished?.quizAttempt).toMatchObject({
      groupId: RUNTIME_QUIZ_GROUP_ID,
      status: "completed",
      currentTargetId: null,
      submittedTargetIds: ["mcq-1", "mcq-2"],
      answerReviewAuthorized: true,
      score: 1,
      maxScore: 2,
      successStatus: null,
      resultsByTargetId: {
        "mcq-1": { isCorrect: true, score: 1 },
        "mcq-2": { isCorrect: false, score: 0 },
      },
    });
  });

  it("passes an after-quiz attempt at the exact passing score", async () => {
    const port = createLocalAssessmentPortFromProjection(
      projectionSource(quizAssessmentProjection({ passingScore: 0.5 })),
    );
    const started = await port.quiz?.startAttempt({ groupId: RUNTIME_QUIZ_GROUP_ID });

    const finished = await port.quiz?.finishAttempt({
      attemptId: started?.quizAttempt.attemptId ?? "attempt-1",
      groupId: RUNTIME_QUIZ_GROUP_ID,
      responsesByTargetId: {
        "mcq-1": { kind: "single-select", optionId: "a" },
        "mcq-2": { kind: "single-select", optionId: "a" },
      },
    });

    expect(finished?.quizAttempt).toMatchObject({
      status: "completed",
      score: 1,
      maxScore: 2,
      successStatus: "passed",
    });
  });

  it("fails an after-quiz attempt below the passing score", async () => {
    const port = createLocalAssessmentPortFromProjection(
      projectionSource(quizAssessmentProjection({ passingScore: 0.75 })),
    );
    const started = await port.quiz?.startAttempt({ groupId: RUNTIME_QUIZ_GROUP_ID });

    const finished = await port.quiz?.finishAttempt({
      attemptId: started?.quizAttempt.attemptId ?? "attempt-1",
      groupId: RUNTIME_QUIZ_GROUP_ID,
      responsesByTargetId: {
        "mcq-1": { kind: "single-select", optionId: "a" },
        "mcq-2": { kind: "single-select", optionId: "a" },
      },
    });

    expect(finished?.quizAttempt).toMatchObject({
      status: "completed",
      score: 1,
      maxScore: 2,
      successStatus: "failed",
    });
  });

  it("rejects an authored Quiz id at the scoped runtime port boundary", async () => {
    const port = createLocalAssessmentPortFromProjection(
      projectionSource(quizAssessmentProjection()),
    );

    await expect(port.quiz?.startAttempt({ groupId: "quiz-1" })).rejects.toThrow(
      `local quiz group id is not scoped to ${LOCAL_ARTIFACT_ID}`,
    );
  });

  it("rejects finish when the local attempt is missing", async () => {
    const port = createLocalAssessmentPortFromProjection(
      projectionSource(quizAssessmentProjection()),
    );

    await expect(
      port.quiz?.finishAttempt({
        attemptId: "missing-attempt",
        groupId: RUNTIME_QUIZ_GROUP_ID,
        responsesByTargetId: {},
      }),
    ).rejects.toThrow("local quiz attempt not found: missing-attempt");
  });

  it("rejects finish when the local attempt belongs to another group", async () => {
    const projection = quizAssessmentProjection();
    projection.assessmentGroups.push({
      ...projection.assessmentGroups[0]!,
      groupId: "quiz-2",
    });
    const port = createLocalAssessmentPortFromProjection(projectionSource(projection));
    const started = await port.quiz?.startAttempt({ groupId: RUNTIME_QUIZ_GROUP_ID });

    await expect(
      port.quiz?.finishAttempt({
        attemptId: started?.quizAttempt.attemptId ?? "attempt-1",
        groupId: `artifact:${LOCAL_ARTIFACT_ID}/group:quiz-2`,
        responsesByTargetId: {},
      }),
    ).rejects.toThrow(/does not belong to group/);
  });

  it("preserves attempt expiry and accumulated results across per-question submits", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-06-18T08:00:00.000Z"));
    const port = createLocalAssessmentPortFromProjection(
      projectionSource(
        quizAssessmentProjection({
          reviewTiming: "after_each_answer",
          allowBacktracking: false,
          passingScore: 0.5,
          timer: { enabled: true, durationSeconds: 90 },
        }),
      ),
    );

    const started = await port.quiz?.startAttempt({
      groupId: RUNTIME_QUIZ_GROUP_ID,
    });
    const first = await port.quiz?.submitQuestion({
      attemptId: started?.quizAttempt.attemptId ?? "attempt-1",
      groupId: RUNTIME_QUIZ_GROUP_ID,
      targetId: "mcq-1",
      response: { kind: "single-select", optionId: "a" },
      expectedAttemptNumber: 0,
    });
    const second = await port.quiz?.submitQuestion({
      attemptId: started?.quizAttempt.attemptId ?? "attempt-1",
      groupId: RUNTIME_QUIZ_GROUP_ID,
      targetId: "mcq-2",
      response: { kind: "single-select", optionId: "a" },
      expectedAttemptNumber: 0,
    });

    expect(first?.quizAttempt.expiresAt).toBe("2026-06-18T08:01:30.000Z");
    expect(second?.quizAttempt).toMatchObject({
      status: "completed",
      currentTargetId: null,
      expiresAt: "2026-06-18T08:01:30.000Z",
      finishedAt: "2026-06-18T08:00:00.000Z",
      submittedTargetIds: ["mcq-1", "mcq-2"],
      answerReviewAuthorized: true,
      score: 1,
      maxScore: 2,
      successStatus: "passed",
      resultsByTargetId: {
        "mcq-1": { isCorrect: true, score: 1 },
        "mcq-2": { isCorrect: false, score: 0 },
      },
    });
  });

  it("rejects per-question submission that skips the current unanswered question", async () => {
    const port = createLocalAssessmentPortFromProjection(
      projectionSource(
        quizAssessmentProjection({
          reviewTiming: "after_each_answer",
          allowBacktracking: false,
        }),
      ),
    );
    const started = await port.quiz?.startAttempt({
      groupId: RUNTIME_QUIZ_GROUP_ID,
    });

    await expect(
      port.quiz?.submitQuestion({
        attemptId: started?.quizAttempt.attemptId ?? "attempt-1",
        groupId: RUNTIME_QUIZ_GROUP_ID,
        targetId: "mcq-2",
        response: { kind: "single-select", optionId: "a" },
        expectedAttemptNumber: 0,
      }),
    ).rejects.toThrow(/current question/);
  });

  it("enforces attempts per question for per-question submission only", async () => {
    const port = createLocalAssessmentPortFromProjection(
      projectionSource(
        quizAssessmentProjection({
          reviewTiming: "after_each_answer",
          attemptsPerQuestion: 1,
          allowBacktracking: true,
        }),
      ),
    );
    const started = await port.quiz?.startAttempt({
      groupId: RUNTIME_QUIZ_GROUP_ID,
    });

    await port.quiz?.submitQuestion({
      attemptId: started?.quizAttempt.attemptId ?? "attempt-1",
      groupId: RUNTIME_QUIZ_GROUP_ID,
      targetId: "mcq-1",
      response: { kind: "single-select", optionId: "b" },
      expectedAttemptNumber: 0,
    });

    await expect(
      port.quiz?.submitQuestion({
        attemptId: started?.quizAttempt.attemptId ?? "attempt-1",
        groupId: RUNTIME_QUIZ_GROUP_ID,
        targetId: "mcq-1",
        response: { kind: "single-select", optionId: "a" },
        expectedAttemptNumber: 1,
      }),
    ).rejects.toThrow(/attempts exhausted/);
  });

  it("keeps an incorrect per-question answer retryable while attempts remain", async () => {
    const port = createLocalAssessmentPortFromProjection(
      projectionSource(
        quizAssessmentProjection({
          reviewTiming: "after_each_answer",
          attemptsPerQuestion: 2,
          allowBacktracking: false,
        }),
      ),
    );
    const started = await port.quiz?.startAttempt({
      groupId: RUNTIME_QUIZ_GROUP_ID,
    });

    const first = await port.quiz?.submitQuestion({
      attemptId: started?.quizAttempt.attemptId ?? "attempt-1",
      groupId: RUNTIME_QUIZ_GROUP_ID,
      targetId: "mcq-1",
      response: { kind: "single-select", optionId: "b" },
      expectedAttemptNumber: 0,
    });
    const second = await port.quiz?.submitQuestion({
      attemptId: started?.quizAttempt.attemptId ?? "attempt-1",
      groupId: RUNTIME_QUIZ_GROUP_ID,
      targetId: "mcq-1",
      response: { kind: "single-select", optionId: "a" },
      expectedAttemptNumber: 1,
    });

    expect(first?.quizAttempt).toMatchObject({
      status: "in_progress",
      currentTargetId: "mcq-1",
      submittedTargetIds: ["mcq-1"],
      resultsByTargetId: {
        "mcq-1": { isCorrect: false, score: 0 },
      },
    });
    expect(second?.quizAttempt).toMatchObject({
      status: "in_progress",
      currentTargetId: "mcq-2",
      submittedTargetIds: ["mcq-1"],
      resultsByTargetId: {
        "mcq-1": { isCorrect: true, score: 1 },
      },
    });
  });

  it("keeps a question retryable across two incorrect attempts when three attempts are allowed", async () => {
    const port = createLocalAssessmentPortFromProjection(
      projectionSource(
        quizAssessmentProjection({
          reviewTiming: "after_each_answer",
          attemptsPerQuestion: 3,
          allowBacktracking: false,
        }),
      ),
    );
    const started = await port.quiz?.startAttempt({
      groupId: RUNTIME_QUIZ_GROUP_ID,
    });
    const attemptId = started?.quizAttempt.attemptId ?? "attempt-1";

    const first = await port.quiz?.submitQuestion({
      attemptId,
      groupId: RUNTIME_QUIZ_GROUP_ID,
      targetId: "mcq-1",
      response: { kind: "single-select", optionId: "b" },
      expectedAttemptNumber: 0,
    });
    const second = await port.quiz?.submitQuestion({
      attemptId,
      groupId: RUNTIME_QUIZ_GROUP_ID,
      targetId: "mcq-1",
      response: { kind: "single-select", optionId: "b" },
      expectedAttemptNumber: 1,
    });
    const third = await port.quiz?.submitQuestion({
      attemptId,
      groupId: RUNTIME_QUIZ_GROUP_ID,
      targetId: "mcq-1",
      response: { kind: "single-select", optionId: "a" },
      expectedAttemptNumber: 2,
    });

    expect(first?.quizAttempt).toMatchObject({
      status: "in_progress",
      currentTargetId: "mcq-1",
      resultsByTargetId: {
        "mcq-1": { isCorrect: false, score: 0 },
      },
    });
    expect(second?.quizAttempt).toMatchObject({
      status: "in_progress",
      currentTargetId: "mcq-1",
      resultsByTargetId: {
        "mcq-1": { isCorrect: false, score: 0 },
      },
    });
    expect(third?.quizAttempt).toMatchObject({
      status: "in_progress",
      currentTargetId: "mcq-2",
      submittedTargetIds: ["mcq-1"],
      resultsByTargetId: {
        "mcq-1": { isCorrect: true, score: 1 },
      },
    });
  });

  it("does not apply attempts per question to after-quiz finish", async () => {
    const port = createLocalAssessmentPortFromProjection(
      projectionSource(
        quizAssessmentProjection({
          reviewTiming: "after_quiz",
          attemptsPerQuestion: 1,
        }),
      ),
    );
    const started = await port.quiz?.startAttempt({
      groupId: RUNTIME_QUIZ_GROUP_ID,
    });

    const finished = await port.quiz?.finishAttempt({
      attemptId: started?.quizAttempt.attemptId ?? "attempt-1",
      groupId: RUNTIME_QUIZ_GROUP_ID,
      responsesByTargetId: {
        "mcq-1": { kind: "single-select", optionId: "a" },
        "mcq-2": { kind: "single-select", optionId: "a" },
      },
    });

    expect(finished?.quizAttempt).toMatchObject({
      status: "completed",
      submittedTargetIds: ["mcq-1", "mcq-2"],
      answerReviewAuthorized: true,
    });
  });

  it("marks after-quiz finish expired when the attempt deadline has passed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-06-18T08:00:00.000Z"));
    const port = createLocalAssessmentPortFromProjection(
      projectionSource(
        quizAssessmentProjection({
          reviewTiming: "after_quiz",
          passingScore: 0.5,
          timer: { enabled: true, durationSeconds: 1 },
        }),
      ),
    );
    const started = await port.quiz?.startAttempt({
      groupId: RUNTIME_QUIZ_GROUP_ID,
    });

    vi.setSystemTime(new Date("2026-06-18T08:00:02.000Z"));

    const finished = await port.quiz?.finishAttempt({
      attemptId: started?.quizAttempt.attemptId ?? "attempt-1",
      groupId: RUNTIME_QUIZ_GROUP_ID,
      responsesByTargetId: {
        "mcq-1": { kind: "single-select", optionId: "a" },
      },
    });

    expect(finished?.quizAttempt).toMatchObject({
      status: "expired",
      currentTargetId: null,
      submittedTargetIds: ["mcq-1"],
      answerReviewAuthorized: true,
      score: 1,
      maxScore: 2,
      successStatus: "passed",
    });
  });

  it("marks per-question submission expired when the attempt deadline has passed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-06-18T08:00:00.000Z"));
    const port = createLocalAssessmentPortFromProjection(
      projectionSource(
        quizAssessmentProjection({
          reviewTiming: "after_each_answer",
          passingScore: 0.5,
          timer: { enabled: true, durationSeconds: 1 },
        }),
      ),
    );
    const started = await port.quiz?.startAttempt({
      groupId: RUNTIME_QUIZ_GROUP_ID,
    });

    vi.setSystemTime(new Date("2026-06-18T08:00:02.000Z"));

    const submitted = await port.quiz?.submitQuestion({
      attemptId: started?.quizAttempt.attemptId ?? "attempt-1",
      groupId: RUNTIME_QUIZ_GROUP_ID,
      targetId: "mcq-1",
      response: { kind: "single-select", optionId: "a" },
      expectedAttemptNumber: 0,
    });

    expect(submitted?.quizAttempt).toMatchObject({
      status: "expired",
      currentTargetId: null,
      submittedTargetIds: ["mcq-1"],
      finishedAt: "2026-06-18T08:00:02.000Z",
      score: 1,
      maxScore: 2,
      successStatus: "passed",
    });
  });

  it("reveals a stored terminal attempt without rewriting its authority", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-06-18T08:00:00.000Z"));
    const port = createLocalAssessmentPortFromProjection(
      projectionSource(quizAssessmentProjection({ passingScore: 0.5 })),
    );
    const started = await port.quiz?.startAttempt({ groupId: RUNTIME_QUIZ_GROUP_ID });
    vi.setSystemTime(new Date("2026-06-18T08:01:00.000Z"));
    const finished = await port.quiz?.finishAttempt({
      attemptId: started?.quizAttempt.attemptId ?? "attempt-1",
      groupId: RUNTIME_QUIZ_GROUP_ID,
      responsesByTargetId: {
        "mcq-1": { kind: "single-select", optionId: "a" },
        "mcq-2": { kind: "single-select", optionId: "a" },
      },
    });

    vi.setSystemTime(new Date("2026-06-18T08:02:00.000Z"));
    const revealed = await port.quiz?.revealAnswers?.({
      attemptId: started?.quizAttempt.attemptId ?? "attempt-1",
      groupId: RUNTIME_QUIZ_GROUP_ID,
    });

    expect(revealed?.quizAttempt).toEqual({
      ...finished?.quizAttempt,
      answerReviewAuthorized: true,
    });
  });

  it("rejects reveal when the local attempt is missing", async () => {
    const port = createLocalAssessmentPortFromProjection(
      projectionSource(quizAssessmentProjection()),
    );

    await expect(
      port.quiz?.revealAnswers?.({
        attemptId: "missing-attempt",
        groupId: RUNTIME_QUIZ_GROUP_ID,
      }),
    ).rejects.toThrow("local quiz attempt not found: missing-attempt");
  });

  it("rejects reveal while the local attempt is in progress", async () => {
    const port = createLocalAssessmentPortFromProjection(
      projectionSource(quizAssessmentProjection()),
    );
    const started = await port.quiz?.startAttempt({ groupId: RUNTIME_QUIZ_GROUP_ID });

    await expect(
      port.quiz?.revealAnswers?.({
        attemptId: started?.quizAttempt.attemptId ?? "attempt-1",
        groupId: RUNTIME_QUIZ_GROUP_ID,
      }),
    ).rejects.toThrow(/is not terminal/);
  });
});

function projectionSource(projection: ReturnType<typeof quizAssessmentProjection>) {
  return () => projection;
}
