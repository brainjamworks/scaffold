import { describe, expect, it } from "vite-plus/test";

import type { XBlockBridgeRequestType } from "../bridge/protocol";
import { createXBlockRuntimePorts } from "./ports";
import type { XBlockInnerBridge } from "./xblock-inner-bridge";

const result = {
  isCorrect: true,
  score: 1,
  maxScore: 1 as const,
  feedback: null,
  items: {},
};

const problem = {
  response: { kind: "single-select" as const, optionId: "b" },
  attemptNumber: 1,
  hintsShown: 0,
  checkResult: null,
  submitted: true as const,
  submissionResult: result,
};

const quizAttempt = {
  attemptId: "attempt-1",
  groupId: "quiz-1",
  status: "in_progress" as const,
  currentTargetId: "mcq-1",
  submittedTargetIds: [],
  startedAt: "2026-07-18T07:00:00Z",
  finishedAt: null,
  expiresAt: null,
  score: null,
  maxScore: null,
  resultsByTargetId: {},
  answerReviewAuthorized: false,
};

class AssessmentBridge implements XBlockInnerBridge {
  constructor(private readonly responses: Record<string, unknown>) {}

  readonly requests: Array<{ type: XBlockBridgeRequestType; payload: unknown }> = [];

  destroy(): void {}
  sendReady(): void {}
  reportHeight(): void {}
  reportDirty(): void {}
  reportFatalError(): void {}

  request<TResult = unknown, TPayload = unknown>(
    type: XBlockBridgeRequestType,
    payload: TPayload,
  ): Promise<TResult> {
    this.requests.push({ type, payload });
    return Promise.resolve(this.responses[type] as TResult);
  }
}

describe("XBlock runtime assessment port", () => {
  it("passes expected sequence values and parses canonical problem and quiz outcomes", async () => {
    const bridge = new AssessmentBridge({
      "assessment.submit": { success: true, problem },
      "assessment.quiz.submitQuestion": {
        success: true,
        quizAttempt,
        problemsByTargetId: { "mcq-1": problem },
      },
    });
    const assessment = createXBlockRuntimePorts(bridge).assessment;
    if (!assessment?.quiz) throw new Error("expected XBlock quiz port");

    const submission = {
      problemId: "artifact:usage-v1/block:mcq-1",
      targetId: "mcq-1",
      interactionKind: "single-select" as const,
      response: { kind: "single-select" as const, optionId: "b" },
      expectedAttemptNumber: 0,
    };
    const question = {
      attemptId: "attempt-1",
      groupId: "quiz-1",
      targetId: "mcq-1",
      response: { kind: "single-select" as const, optionId: "b" },
      expectedAttemptNumber: 0,
    };

    await expect(assessment.submit(submission)).resolves.toEqual({ problem });
    await expect(assessment.quiz.submitQuestion(question)).resolves.toEqual({
      quizAttempt,
      problemsByTargetId: { "mcq-1": problem },
    });
    expect(bridge.requests).toEqual([
      { type: "assessment.submit", payload: submission },
      { type: "assessment.quiz.submitQuestion", payload: question },
    ]);
  });

  it("rejects a successful handler response that omits canonical state", async () => {
    const bridge = new AssessmentBridge({
      "assessment.submit": { success: true, ...result },
    });
    const assessment = createXBlockRuntimePorts(bridge).assessment;

    await expect(
      assessment?.submit({
        problemId: "artifact:usage-v1/block:mcq-1",
        targetId: "mcq-1",
        interactionKind: "single-select",
        response: { kind: "single-select", optionId: "b" },
        expectedAttemptNumber: 0,
      }),
    ).rejects.toThrow();
  });
});
