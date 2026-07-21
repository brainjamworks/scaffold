import { describe, expect, it } from "vite-plus/test";

import {
  createXBlockAuthoringHostServices,
  createXBlockPreviewLearnerServices,
} from "./authoring-ports";
import { createXBlockLearnerHostServices, createXBlockRuntimePorts } from "./ports";
import type { XBlockInnerBridge } from "./xblock-inner-bridge";
import type { XBlockBridgeRequestType } from "../bridge/protocol";

class RecordingBridge implements XBlockInnerBridge {
  constructor(
    private readonly revealHintResponse: unknown = {
      success: true,
      problem: {
        response: null,
        attemptNumber: 0,
        hintsShown: 1,
        checkResult: null,
        submitted: false,
        submissionResult: null,
      },
    },
  ) {}

  readonly requests: Array<{
    type: XBlockBridgeRequestType;
    payload: unknown;
  }> = [];

  destroy(): void {}

  request<TResult = unknown, TPayload = unknown>(
    type: XBlockBridgeRequestType,
    payload: TPayload,
  ): Promise<TResult> {
    this.requests.push({ type, payload });
    if (type === "assessment.revealHint") {
      return Promise.resolve(this.revealHintResponse as TResult);
    }
    if (type === "assessment.revealAnswer") {
      return Promise.resolve({
        success: true,
        answerKey: {
          kind: "single-select",
          correctOptionId: "b",
          feedbackByOptionId: {},
        },
      } as TResult);
    }
    if (type === "persistence.createArtifact") {
      return Promise.resolve({
        success: true,
        artifact: {
          id: "usage-v1",
          title: "Scaffold",
        },
      } as TResult);
    }
    if (type === "media.resolve") {
      return Promise.resolve({
        success: true,
        mediaId: "media-from-handler",
        url: "https://cdn.example/media-from-handler.png",
      } as TResult);
    }
    if (type === "media.list") {
      return Promise.resolve({
        success: true,
        items: [],
      } as TResult);
    }
    if (type === "media.upload") {
      return Promise.resolve({
        success: true,
        mediaId: "media-uploaded",
        url: "https://cdn.example/media-uploaded.png",
      } as TResult);
    }
    if (type.startsWith("assessment.quiz.")) {
      return Promise.resolve({
        success: true,
        quizAttempt: {
          attemptId: "attempt-1",
          groupId: "quiz-1",
          status: "in_progress",
          currentTargetId: "mcq-1",
          submittedTargetIds: [],
          startedAt: "2026-06-27T10:00:00Z",
          finishedAt: null,
          expiresAt: null,
          score: null,
          maxScore: null,
          resultsByTargetId: {},
          answerReviewAuthorized: false,
        },
        problemsByTargetId: {},
      } as TResult);
    }
    if (type.startsWith("assessment.")) {
      return Promise.resolve({
        success: true,
        problem: {
          response: { kind: "single-select", optionId: "b" },
          attemptNumber: 1,
          hintsShown: 0,
          checkResult: null,
          submitted: true,
          submissionResult: {
            isCorrect: true,
            score: 1,
            maxScore: 1,
            feedback: null,
            items: {},
          },
        },
      } as TResult);
    }
    if (type === "learnerActivity.load") {
      return Promise.resolve({
        snapshotVersion: 1,
        artifactId: "artifact-1",
        activities: {
          "flashcard-1": {
            activityKind: "flashcard",
            data: { currentSectionId: "card-1" },
            completed: false,
            updatedAt: "2026-06-25T18:00:00Z",
          },
        },
      } as TResult);
    }
    if (type === "learnerActivity.save") {
      return Promise.resolve({
        activityKind: "flashcard",
        data: { currentSectionId: "card-2" },
        completed: true,
        updatedAt: "2026-06-25T18:10:00Z",
      } as TResult);
    }
    return Promise.resolve({} as TResult);
  }

  sendReady(): void {}
  reportHeight(): void {}
  reportDirty(): void {}
  reportFatalError(): void {}
}

const assessmentArgs = {
  problemId: "artifact:usage-v1/block:mcq-1",
  targetId: "mcq-1",
  interactionKind: "single-select" as const,
  response: { kind: "single-select" as const, optionId: "b" },
  expectedAttemptNumber: 0,
};

describe("XBlock assessment ports", () => {
  it("marks student assessment port as runtime and routes to learner handlers", async () => {
    const bridge = new RecordingBridge();
    const ports = createXBlockRuntimePorts(bridge);
    expect(ports).not.toHaveProperty("persistence");

    await expect(ports.assessment?.submit(assessmentArgs)).resolves.toEqual({
      problem: {
        response: { kind: "single-select", optionId: "b" },
        attemptNumber: 1,
        hintsShown: 0,
        checkResult: null,
        submitted: true,
        submissionResult: {
          isCorrect: true,
          score: 1,
          maxScore: 1,
          feedback: null,
          items: {},
        },
      },
    });

    expect(ports.assessment?.type).toBe("runtime");
    expect(bridge.requests).toEqual([
      {
        type: "assessment.submit",
        payload: assessmentArgs,
      },
    ]);
  });

  it("unwraps and validates the authoritative learner hint count", async () => {
    const bridge = new RecordingBridge();
    const assessment = createXBlockRuntimePorts(bridge).assessment;
    const revealArgs = {
      problemId: "artifact:usage-v1/block:mcq-1",
      targetId: "mcq-1",
      interactionKind: "single-select" as const,
      hintsShown: 1,
    };

    await expect(assessment?.revealHint?.(revealArgs)).resolves.toMatchObject({
      problem: { hintsShown: 1 },
    });
    expect(bridge.requests).toEqual([
      {
        type: "assessment.revealHint",
        payload: revealArgs,
      },
    ]);
  });

  it("rejects failed and invalid learner hint handler responses", async () => {
    const revealArgs = {
      problemId: "artifact:usage-v1/block:mcq-1",
      targetId: "mcq-1",
      interactionKind: "single-select" as const,
      hintsShown: 1,
    };
    const failed = createXBlockRuntimePorts(
      new RecordingBridge({ success: false, error: "hint reveal denied" }),
    ).assessment;

    await expect(failed?.revealHint?.(revealArgs)).rejects.toThrow("hint reveal denied");

    for (const invalid of [-1, 1.5, "1", null]) {
      const assessment = createXBlockRuntimePorts(
        new RecordingBridge({
          success: true,
          problem: {
            response: null,
            attemptNumber: 0,
            hintsShown: invalid,
            checkResult: null,
            submitted: false,
            submissionResult: null,
          },
        }),
      ).assessment;
      await expect(assessment?.revealHint?.(revealArgs)).rejects.toThrow();
    }
  });

  it("wires quiz attempt lifecycle through XBlock learner handlers", async () => {
    const bridge = new RecordingBridge();
    const assessment = createXBlockRuntimePorts(bridge).assessment;

    if (!assessment?.quiz) {
      throw new Error("expected XBlock runtime quiz port");
    }

    const startArgs = {
      groupId: "quiz-1",
    };
    const submitArgs = {
      attemptId: "attempt-1",
      groupId: "quiz-1",
      targetId: "mcq-1",
      response: { kind: "single-select" as const, optionId: "b" },
      expectedAttemptNumber: 0,
    };
    const finishArgs = {
      attemptId: "attempt-1",
      groupId: "quiz-1",
      responsesByTargetId: {
        "mcq-1": { kind: "single-select" as const, optionId: "b" },
        "mcq-2": { kind: "single-select" as const, optionId: "b" },
      },
    };
    const revealArgs = {
      attemptId: "attempt-1",
      groupId: "quiz-1",
    };

    await assessment.quiz.startAttempt(startArgs);
    await assessment.quiz.submitQuestion(submitArgs);
    await assessment.quiz.finishAttempt(finishArgs);
    await assessment.quiz.revealAnswers?.(revealArgs);

    expect(bridge.requests).toEqual([
      {
        type: "assessment.quiz.startAttempt",
        payload: startArgs,
      },
      {
        type: "assessment.quiz.submitQuestion",
        payload: submitArgs,
      },
      {
        type: "assessment.quiz.finishAttempt",
        payload: finishArgs,
      },
      {
        type: "assessment.quiz.revealAnswers",
        payload: revealArgs,
      },
    ]);
  });

  it("wires the strict learner activity port through XBlock learner services", async () => {
    const bridge = new RecordingBridge();
    const services = createXBlockLearnerHostServices(bridge);

    await expect(services.learnerActivity?.load({ artifactId: "artifact-1" })).resolves.toEqual({
      snapshotVersion: 1,
      artifactId: "artifact-1",
      activities: {
        "flashcard-1": {
          activityKind: "flashcard",
          data: { currentSectionId: "card-1" },
          completed: false,
          updatedAt: "2026-06-25T18:00:00Z",
        },
      },
    });
    await expect(
      services.learnerActivity?.save({
        artifactId: "artifact-1",
        blockId: "flashcard-1",
        record: {
          activityKind: "flashcard",
          data: { currentSectionId: "card-2" },
          completed: true,
        },
      }),
    ).resolves.toEqual({
      activityKind: "flashcard",
      data: { currentSectionId: "card-2" },
      completed: true,
      updatedAt: "2026-06-25T18:10:00Z",
    });

    expect(bridge.requests).toEqual([
      {
        type: "learnerActivity.load",
        payload: { artifactId: "artifact-1" },
      },
      {
        type: "learnerActivity.save",
        payload: {
          artifactId: "artifact-1",
          blockId: "flashcard-1",
          record: {
            activityKind: "flashcard",
            data: { currentSectionId: "card-2" },
            completed: true,
          },
        },
      },
    ]);
  });

  it("resolves preloaded runtime media before falling back to context-aware handler calls", async () => {
    const bridge = new RecordingBridge();
    const ports = createXBlockRuntimePorts(bridge, {
      mediaContext: "runtime",
      resolvedMedia: {
        "media-preloaded": "https://cdn.example/preloaded.png",
      },
    });

    await expect(ports.media?.resolve("media-preloaded")).resolves.toBe(
      "https://cdn.example/preloaded.png",
    );
    expect(bridge.requests).toEqual([]);

    await expect(ports.media?.resolve("media-missing")).resolves.toBe(
      "https://cdn.example/media-from-handler.png",
    );
    expect(ports.media?.context).toBe("runtime");
    expect(bridge.requests).toEqual([
      {
        type: "media.resolve",
        payload: {
          mediaId: "media-missing",
          context: "runtime",
        },
      },
    ]);
  });

  it("routes Studio media calls with authoring and preview contexts", async () => {
    const authoringBridge = new RecordingBridge();
    const authoringServices = createXBlockAuthoringHostServices(authoringBridge);

    await expect(authoringServices.media?.resolve("media-authoring")).resolves.toBe(
      "https://cdn.example/media-from-handler.png",
    );
    expect(authoringServices.media?.context).toBe("authoring");
    expect(authoringBridge.requests).toEqual([
      {
        type: "media.resolve",
        payload: {
          mediaId: "media-authoring",
          context: "authoring",
        },
      },
    ]);

    const previewBridge = new RecordingBridge();
    const previewServices = createXBlockPreviewLearnerServices(previewBridge);

    await expect(previewServices.media?.resolve("media-preview")).resolves.toBe(
      "https://cdn.example/media-from-handler.png",
    );
    expect(previewServices.media?.context).toBe("preview");
    expect(previewBridge.requests).toEqual([
      {
        type: "media.resolve",
        payload: {
          mediaId: "media-preview",
          context: "preview",
        },
      },
    ]);
  });

  it("marks Studio assessment port as preview and routes to preview handlers", async () => {
    const bridge = new RecordingBridge();
    const services = createXBlockPreviewLearnerServices(bridge);
    const assessment = services.assessment;

    if (!assessment?.check || !assessment.revealAnswer) {
      throw new Error("expected Studio assessment preview port");
    }

    await assessment.check(assessmentArgs);
    await assessment.submit(assessmentArgs);
    await expect(assessment.revealAnswer(assessmentArgs)).resolves.toEqual({
      answerKey: {
        kind: "single-select",
        correctOptionId: "b",
        feedbackByOptionId: {},
      },
    });

    expect(assessment.type).toBe("preview");
    expect(assessment.revealHint).toBeUndefined();
    expect(bridge.requests).toEqual([
      {
        type: "assessment.previewCheck",
        payload: assessmentArgs,
      },
      {
        type: "assessment.previewSubmit",
        payload: assessmentArgs,
      },
      {
        type: "assessment.revealAnswer",
        payload: assessmentArgs,
      },
    ]);
  });

  it("keeps artifact persistence on authoring host services", async () => {
    const bridge = new RecordingBridge();
    const services = createXBlockAuthoringHostServices(bridge);
    const bundle = {
      artifact: {
        id: "artifact-1",
        title: "Scaffold",
        mode: "page" as const,
        content: { type: "doc", content: [] },
      },
      learnerContent: { type: "doc", content: [] },
      assessmentTargets: [],
      assessmentGroups: [],
    };

    await services.artifactPersistence.saveArtifact(bundle);

    expect(bridge.requests).toEqual([
      {
        type: "persistence.saveArtifact",
        payload: {
          artifact: bundle.artifact,
          learnerContent: bundle.learnerContent,
          assessmentTargets: [],
          assessmentGroups: [],
        },
      },
    ]);
  });

  it("gets authoring artifact metadata through the XBlock creation handler", async () => {
    const bridge = new RecordingBridge();
    const services = createXBlockAuthoringHostServices(bridge);

    await expect(
      services.artifactCreation.createArtifactMetadata({ mode: "slideshow" }),
    ).resolves.toMatchObject({
      id: "usage-v1",
      title: "Scaffold",
    });

    expect(bridge.requests).toEqual([
      {
        type: "persistence.createArtifact",
        payload: { mode: "slideshow" },
      },
    ]);
  });
});
