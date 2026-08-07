import { describe, expect, it } from "vite-plus/test";

import type { LearningEvent } from "@scaffold/core/ports";
import type { XBlockBridgeRequestType } from "../bridge/protocol";
import { createXBlockRuntimePorts } from "./ports";
import type { XBlockInnerBridge } from "./xblock-inner-bridge";

const result = {
  isCorrect: true,
  score: { scaled: 1, raw: 1, min: 0, max: 1 },
  feedback: null,
  items: {},
};

const problem = {
  response: { kind: "single-select" as const, optionId: "option_00001" },
  attemptNumber: 1,
  hintsShown: 0,
  checkResult: null,
  submitted: true as const,
  submissionResult: result,
};

const quizAttempt = {
  attemptId: "attempt-1",
  groupId: "artifact:usage-v1/group:quiz__000001",
  status: "in_progress" as const,
  currentTargetId: "target_00001",
  submittedTargetIds: [],
  startedAt: "2026-07-18T07:00:00Z",
  finishedAt: null,
  expiresAt: null,
  score: null,
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
        problemsByTargetId: { target_00001: problem },
      },
    });
    const assessment = createXBlockRuntimePorts(bridge).assessment;
    if (!assessment?.quiz) throw new Error("expected XBlock quiz port");

    const submission = {
      problemId: "artifact:usage-v1/block:block_000001",
      targetId: "target_00001",
      interactionKind: "single-select" as const,
      response: { kind: "single-select" as const, optionId: "option_00001" },
      expectedAttemptNumber: 0,
    };
    const question = {
      attemptId: "attempt-1",
      groupId: "artifact:usage-v1/group:quiz__000001",
      targetId: "target_00001",
      response: { kind: "single-select" as const, optionId: "option_00001" },
      expectedAttemptNumber: 0,
    };

    await expect(assessment.submit(submission)).resolves.toEqual({ problem });
    await expect(assessment.quiz.submitQuestion(question)).resolves.toEqual({
      quizAttempt,
      problemsByTargetId: { target_00001: problem },
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
        problemId: "artifact:usage-v1/block:block_000001",
        targetId: "target_00001",
        interactionKind: "single-select",
        response: { kind: "single-select", optionId: "option_00001" },
        expectedAttemptNumber: 0,
      }),
    ).rejects.toThrow();
  });
});

describe("XBlock runtime learning event port", () => {
  it("accepts the exact canonical event once when the host root Activity IRI is supplied", async () => {
    const bridge = new AssessmentBridge({
      "learningEvents.accept": { success: true },
    });
    const learningEvents = createXBlockRuntimePorts(bridge, {
      rootActivityId: "https://scaffold.ac/xapi/activities/openedx/usage-v1",
    }).learningEvents;
    const event: LearningEvent = {
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
    };

    expect(learningEvents?.rootActivityId).toBe(
      "https://scaffold.ac/xapi/activities/openedx/usage-v1",
    );
    await expect(learningEvents?.accept(event)).resolves.toBeUndefined();
    expect(bridge.requests).toEqual([
      {
        type: "learningEvents.accept",
        payload: { event },
      },
    ]);
  });

  it("propagates rejected host acceptance", async () => {
    const bridge = new AssessmentBridge({
      "learningEvents.accept": { success: false, error: "learning event rejected" },
    });
    const learningEvents = createXBlockRuntimePorts(bridge, {
      rootActivityId: "https://scaffold.ac/xapi/activities/openedx/usage-v1",
    }).learningEvents;

    await expect(
      learningEvents?.accept({
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
      }),
    ).rejects.toThrow("learning event rejected");
  });

  it("omits learning events when no host root Activity IRI is supplied", () => {
    const bridge = new AssessmentBridge({});

    expect(createXBlockRuntimePorts(bridge).learningEvents).toBeUndefined();
  });
});
