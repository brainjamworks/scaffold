// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createMoodleRuntimePorts } from "./ports";

afterEach(() => {
  delete window.ScaffoldMoodleAjax;
});

function problemSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    response: null,
    submitted: false,
    attemptNumber: 0,
    hintsShown: 0,
    checkResult: null,
    submissionResult: null,
    ...overrides,
  };
}

describe("createMoodleRuntimePorts assessment port", () => {
  it("submits the expected attempt and returns canonical problem state", async () => {
    const result = {
      isCorrect: true,
      score: 1,
      maxScore: 1,
      feedback: null,
      items: {},
    };
    const problem = problemSnapshot({
      response: { kind: "single-select", optionId: "b" },
      submitted: true,
      attemptNumber: 1,
      submissionResult: result,
    });
    const call = vi.fn(async (_methodName: string, _args: Record<string, unknown>) => ({
      success: true,
      outcomeJson: JSON.stringify({ problem }),
      gradePublicationJson: "null",
    }));
    window.ScaffoldMoodleAjax = {
      call: async <T>(methodName: string, args: Record<string, unknown>) =>
        (await call(methodName, args)) as T,
    };

    const ports = createMoodleRuntimePorts(42);
    expect(ports).not.toHaveProperty("persistence");
    const assessment = ports.assessment;
    await expect(
      assessment?.submit({
        problemId: "artifact:usage-v1/block:mcq-1",
        targetId: "mcq-1",
        interactionKind: "single-select",
        response: { kind: "single-select", optionId: "b" },
        expectedAttemptNumber: 0,
      }),
    ).resolves.toEqual({ problem });

    expect(call).toHaveBeenCalledWith("mod_scaffold_submit_assessment", {
      cmid: 42,
      problemid: "artifact:usage-v1/block:mcq-1",
      targetid: "mcq-1",
      interactionkind: "single-select",
      responsejson: JSON.stringify({ kind: "single-select", optionId: "b" }),
      expectedattemptnumber: 0,
    });
  });

  it("returns the strict canonical answer reveal", async () => {
    const answerKey = {
      kind: "single-select" as const,
      correctOptionId: "b",
      feedbackByOptionId: {},
    };
    window.ScaffoldMoodleAjax = {
      call: async <T>() =>
        ({
          success: true,
          answerJson: JSON.stringify({ answerKey }),
        }) as T,
    };

    const assessment = createMoodleRuntimePorts(42).assessment;
    await expect(
      assessment?.revealAnswer?.({
        problemId: "artifact:usage-v1/block:mcq-1",
        targetId: "mcq-1",
        interactionKind: "single-select",
        response: { kind: "single-select", optionId: "b" },
      }),
    ).resolves.toEqual({ answerKey });
  });

  it("persists the requested next hint count through the Moodle host", async () => {
    const problem = problemSnapshot({ hintsShown: 2 });
    const call = vi.fn(async (_methodName: string, _args: Record<string, unknown>) => ({
      success: true,
      outcomeJson: JSON.stringify({ problem }),
      gradePublicationJson: "null",
    }));
    window.ScaffoldMoodleAjax = {
      call: async <T>(methodName: string, args: Record<string, unknown>) =>
        (await call(methodName, args)) as T,
    };

    const revealHint = createMoodleRuntimePorts(42).assessment?.revealHint;
    expect(revealHint).toBeTypeOf("function");
    await expect(
      revealHint?.({
        problemId: "artifact:moodle-cm-42/block:mcq-1",
        targetId: "mcq-1",
        interactionKind: "single-select",
        hintsShown: 2,
      }),
    ).resolves.toEqual({ problem });
    expect(call).toHaveBeenCalledWith("mod_scaffold_reveal_hint", {
      cmid: 42,
      problemid: "artifact:moodle-cm-42/block:mcq-1",
      targetid: "mcq-1",
      interactionkind: "single-select",
      hintsshown: 2,
    });
  });

  it("forwards and validates the complete Quiz lifecycle", async () => {
    const scopedGroupId = "artifact:moodle-cm-42/group:quiz-1";
    const attempt = {
      attemptId: "attempt-1",
      groupId: "quiz-1",
      status: "in_progress" as const,
      currentTargetId: "mcq-1",
      submittedTargetIds: [],
      startedAt: "2026-07-17T10:00:00Z",
      finishedAt: null,
      expiresAt: null,
      score: null,
      maxScore: null,
      resultsByTargetId: {},
      answerReviewAuthorized: false,
    };
    const call = vi.fn(async (_methodName: string, _args: Record<string, unknown>) => ({
      success: true,
      outcomeJson: JSON.stringify({ quizAttempt: attempt, problemsByTargetId: {} }),
      gradePublicationJson: "null",
    }));
    window.ScaffoldMoodleAjax = {
      call: async <T>(methodName: string, args: Record<string, unknown>) =>
        (await call(methodName, args)) as T,
    };

    const quiz = createMoodleRuntimePorts(42).assessment?.quiz;
    const started = await quiz?.startAttempt({ groupId: scopedGroupId });
    const submitted = await quiz?.submitQuestion({
      attemptId: "attempt-1",
      groupId: scopedGroupId,
      targetId: "mcq-1",
      response: { kind: "single-select", optionId: "b" },
      expectedAttemptNumber: 0,
    });
    const finished = await quiz?.finishAttempt({
      attemptId: "attempt-1",
      groupId: scopedGroupId,
      responsesByTargetId: {
        "mcq-1": { kind: "single-select", optionId: "b" },
      },
    });
    const revealed = await quiz?.revealAnswers?.({
      attemptId: "attempt-1",
      groupId: scopedGroupId,
    });

    expect(
      [started, submitted, finished, revealed].map((outcome) => outcome?.quizAttempt.groupId),
    ).toEqual([scopedGroupId, scopedGroupId, scopedGroupId, scopedGroupId]);

    expect(call.mock.calls).toEqual([
      ["mod_scaffold_start_quiz_attempt", { cmid: 42, groupid: "quiz-1" }],
      [
        "mod_scaffold_submit_quiz_question",
        {
          cmid: 42,
          attemptid: "attempt-1",
          groupid: "quiz-1",
          targetid: "mcq-1",
          responsejson: JSON.stringify({ kind: "single-select", optionId: "b" }),
          expectedattemptnumber: 0,
        },
      ],
      [
        "mod_scaffold_finish_quiz_attempt",
        {
          cmid: 42,
          attemptid: "attempt-1",
          groupid: "quiz-1",
          responsesjson: JSON.stringify({
            "mcq-1": { kind: "single-select", optionId: "b" },
          }),
        },
      ],
      ["mod_scaffold_reveal_quiz_answers", { cmid: 42, attemptid: "attempt-1", groupid: "quiz-1" }],
    ]);
  });

  it("rejects mismatched Quiz response identity for every lifecycle operation", async () => {
    const scopedGroupId = "artifact:moodle-cm-42/group:quiz-1";
    const attempt = {
      attemptId: "attempt-1",
      groupId: "quiz-other",
      status: "in_progress" as const,
      currentTargetId: "mcq-1",
      submittedTargetIds: [],
      startedAt: "2026-07-17T10:00:00Z",
      finishedAt: null,
      expiresAt: null,
      score: null,
      maxScore: null,
      resultsByTargetId: {},
      answerReviewAuthorized: false,
    };
    window.ScaffoldMoodleAjax = {
      call: async <T>() =>
        ({
          success: true,
          outcomeJson: JSON.stringify({ quizAttempt: attempt, problemsByTargetId: {} }),
          gradePublicationJson: "null",
        }) as T,
    };

    const quiz = createMoodleRuntimePorts(42).assessment?.quiz;
    const operations = [
      () => quiz?.startAttempt({ groupId: scopedGroupId }),
      () =>
        quiz?.submitQuestion({
          attemptId: "attempt-1",
          groupId: scopedGroupId,
          targetId: "mcq-1",
          response: { kind: "single-select", optionId: "b" },
          expectedAttemptNumber: 0,
        }),
      () =>
        quiz?.finishAttempt({
          attemptId: "attempt-1",
          groupId: scopedGroupId,
          responsesByTargetId: {
            "mcq-1": { kind: "single-select", optionId: "b" },
          },
        }),
      () => quiz?.revealAnswers?.({ attemptId: "attempt-1", groupId: scopedGroupId }),
    ];

    for (const operation of operations) {
      await expect(operation()).rejects.toThrow(
        "Moodle Quiz response group id did not match request",
      );
    }
  });

  it("rejects Quiz group ids scoped to another Moodle activity before AJAX", async () => {
    const call = vi.fn();
    window.ScaffoldMoodleAjax = { call };

    const quiz = createMoodleRuntimePorts(42).assessment?.quiz;
    await expect(
      quiz?.startAttempt({ groupId: "artifact:moodle-cm-99/group:quiz-1" }),
    ).rejects.toThrow("Moodle Quiz group id is not scoped to this activity");
    expect(call).not.toHaveBeenCalled();
  });
});

describe("createMoodleRuntimePorts learner activity port", () => {
  it("keeps one stable learner activity capability beside assessment", () => {
    const ports = createMoodleRuntimePorts(42);

    expect(ports.learnerActivity).toEqual({
      load: expect.any(Function),
      save: expect.any(Function),
    });
    expect(ports.learnerActivity).not.toBe(ports.assessment);
  });

  it("keeps learner save rejection independent from assessment success", async () => {
    const result = {
      isCorrect: true,
      score: 1,
      maxScore: 1,
      feedback: null,
      items: {},
    };
    const call = vi.fn(async (methodName: string, _args: Record<string, unknown>) => {
      if (methodName === "mod_scaffold_save_learner_activity") {
        return { success: true, recordJson: JSON.stringify({ assessmentResult: result }) };
      }
      if (methodName === "mod_scaffold_submit_assessment") {
        return {
          success: true,
          outcomeJson: JSON.stringify({
            problem: problemSnapshot({
              response: { kind: "single-select", optionId: "a" },
              submitted: true,
              attemptNumber: 1,
              submissionResult: result,
            }),
          }),
          gradePublicationJson: "null",
        };
      }
      throw new Error(`Unexpected Moodle call: ${methodName}`);
    });
    window.ScaffoldMoodleAjax = {
      call: async <T>(methodName: string, args: Record<string, unknown>) =>
        (await call(methodName, args)) as T,
    };
    const ports = createMoodleRuntimePorts(42);
    if (!ports.learnerActivity || !ports.assessment) {
      throw new Error("Moodle runtime ports are incomplete");
    }

    await expect(
      ports.learnerActivity.save({
        artifactId: "moodle-artifact",
        blockId: "checklist-1",
        record: { activityKind: "checklist", data: {}, completed: false },
      }),
    ).rejects.toThrow();
    await expect(
      ports.assessment.submit({
        problemId: "problem-1",
        targetId: "target-1",
        interactionKind: "single-select",
        response: { kind: "single-select", optionId: "a" },
        expectedAttemptNumber: 0,
      }),
    ).resolves.toEqual({
      problem: problemSnapshot({
        response: { kind: "single-select", optionId: "a" },
        submitted: true,
        attemptNumber: 1,
        submissionResult: result,
      }),
    });
    expect(call.mock.calls.map(([methodName]) => methodName)).toEqual([
      "mod_scaffold_save_learner_activity",
      "mod_scaffold_submit_assessment",
    ]);
  });

  it("keeps assessment rejection independent from learner load success", async () => {
    const snapshot = {
      snapshotVersion: 1 as const,
      artifactId: "moodle-artifact",
      activities: {},
    };
    const call = vi.fn(async (methodName: string, _args: Record<string, unknown>) => {
      if (methodName === "mod_scaffold_submit_assessment") {
        return { success: false, error: "assessment denied" };
      }
      if (methodName === "mod_scaffold_load_learner_activity") {
        return { success: true, snapshotJson: JSON.stringify(snapshot) };
      }
      throw new Error(`Unexpected Moodle call: ${methodName}`);
    });
    window.ScaffoldMoodleAjax = {
      call: async <T>(methodName: string, args: Record<string, unknown>) =>
        (await call(methodName, args)) as T,
    };
    const ports = createMoodleRuntimePorts(42);
    if (!ports.learnerActivity || !ports.assessment) {
      throw new Error("Moodle runtime ports are incomplete");
    }

    await expect(
      ports.assessment.submit({
        problemId: "problem-1",
        targetId: "target-1",
        interactionKind: "single-select",
        response: { kind: "single-select", optionId: "a" },
        expectedAttemptNumber: 0,
      }),
    ).rejects.toThrow("assessment denied");
    await expect(ports.learnerActivity.load({ artifactId: "moodle-artifact" })).resolves.toEqual(
      snapshot,
    );
    expect(call.mock.calls.map(([methodName]) => methodName)).toEqual([
      "mod_scaffold_submit_assessment",
      "mod_scaffold_load_learner_activity",
    ]);
  });
});
