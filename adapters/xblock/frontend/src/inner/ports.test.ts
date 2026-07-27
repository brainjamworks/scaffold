import { describe, expect, it } from "vite-plus/test";

import type { XapiStatementTemplate } from "@scaffold/core/ports";
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
  successStatus: null,
  resultsByTargetId: {},
  answerReviewAuthorized: false,
};

class AssessmentBridge implements XBlockInnerBridge {
  constructor(private readonly responses: Record<string, unknown>) {}

  readonly requests: Array<{ type: XBlockBridgeRequestType; payload: unknown }> = [];

  destroy(): void {}
  requestHostScroll(): void {}
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

describe("XBlock runtime xAPI port", () => {
  it("accepts Core statements through the bridge when the host activity IRI is supplied", async () => {
    const bridge = new AssessmentBridge({
      "xapi.accept": { success: true },
    });
    const xapi = createXBlockRuntimePorts(bridge, {
      xapiActivityId: "https://scaffold.ac/xapi/activities/openedx/usage-v1",
    }).xapi;
    const statement = {
      id: "00000000-0000-4000-8000-000000000001",
      timestamp: "2026-07-27T12:00:00.000Z",
      verb: {
        id: "http://adlnet.gov/expapi/verbs/initialized",
        display: { en: "initialized" },
      },
      object: {
        objectType: "Activity",
        id: "https://scaffold.ac/xapi/activities/openedx/usage-v1",
      },
    } as XapiStatementTemplate;

    expect(xapi?.activityId).toBe(
      "https://scaffold.ac/xapi/activities/openedx/usage-v1",
    );
    await expect(xapi?.send(statement)).resolves.toBeUndefined();
    expect(bridge.requests).toContainEqual({
      type: "xapi.accept",
      payload: { statement },
    });
  });

  it("omits xAPI when no host activity IRI is supplied", () => {
    const bridge = new AssessmentBridge({});

    expect(createXBlockRuntimePorts(bridge).xapi).toBeUndefined();
  });
});
