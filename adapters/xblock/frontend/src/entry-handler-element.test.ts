// @vitest-environment jsdom

import type { AssessmentLearnerSnapshot, LearnerActivitySnapshot } from "@scaffold/contracts";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createXBlockBridgeRequest } from "./bridge/protocol";
import { renderBlock as renderStudentBlock } from "./student-entry";
import { renderBlock as renderStudioBlock } from "./studio-entry";
import type { XBlockRuntime } from "./api";
import type { ScaffoldXBlockInnerInitPayload, ScaffoldXBlockOuterData } from "./types";

const frameHarness = vi.hoisted(() => {
  const state: {
    options: unknown;
    create: ReturnType<typeof vi.fn>;
  } = {
    options: null,
    create: vi.fn((options: unknown) => {
      state.options = options;
      return {
        iframe: document.createElement("iframe"),
        destroy: vi.fn(),
      };
    }),
  };
  return state;
});

vi.mock("./outer/create-isolated-scaffold-frame", () => ({
  createIsolatedScaffoldFrame: frameHarness.create,
}));

type CapturedFrameOptions = {
  container: HTMLElement;
  initPayload: ScaffoldXBlockInnerInitPayload;
  onRequest: (
    request: ReturnType<typeof createXBlockBridgeRequest>,
    frame: {
      sendSuccessResponse(response: { requestId: string; result: unknown }): void;
      sendFailureResponse(response: { requestId: string; error: unknown }): void;
    },
  ) => void;
};

const data: ScaffoldXBlockOuterData = {
  innerUrl: "http://local.openedx.io/static/scaffold/student-inner.html",
  artifact: {
    id: "block-v1:course+run+type@scaffold+block@abc",
    title: "Scaffold",
    mode: "page",
    content: { type: "doc", content: [] },
  },
};

const assessmentSnapshot: AssessmentLearnerSnapshot = {
  snapshotVersion: 1,
  artifactId: data.artifact.id,
  problems: {
    "hotspot-target": {
      response: {
        kind: "spatial-hotspot",
        selections: [{ hotspotId: "hotspot-a", x: 24, y: 36 }],
      },
      attemptNumber: 2,
      hintsShown: 1,
      checkResult: null,
      submitted: false,
      submissionResult: null,
    },
  },
  quizzes: {
    "quiz-1": {
      attemptId: "attempt-1",
      status: "in_progress",
      currentTargetId: "hotspot-target",
      submittedTargetIds: [],
      startedAt: "2026-06-27T10:00:00Z",
      finishedAt: null,
      expiresAt: "2026-06-27T10:05:00Z",
      score: null,
      maxScore: null,
      resultsByTargetId: {},
      answerReviewAuthorized: false,
    },
  },
};

const learnerData: ScaffoldXBlockOuterData = {
  ...data,
  protocolVersion: 1,
  mediaContext: "runtime",
  resolvedMedia: {
    "media-1": "http://local.openedx.io/media/media-1.png",
  },
  assessmentSnapshot,
  learnerActivitySnapshot: {
    snapshotVersion: 1,
    artifactId: data.artifact.id,
    activities: {
      "activity-1": {
        activityKind: "checklist",
        data: { checked: true },
        completed: true,
        updatedAt: "2026-07-17T12:30:45Z",
      },
    },
  } satisfies LearnerActivitySnapshot,
};

afterEach(() => {
  document.body.innerHTML = "";
  frameHarness.options = null;
  frameHarness.create.mockClear();
  vi.unstubAllGlobals();
});

describe("XBlock entry handler element routing", () => {
  it("lets learner runtime height be driven by Scaffold content", () => {
    renderStudentEntry();

    expect(frameHarness.options).toMatchObject({
      minHeight: 0,
      title: "Scaffold content",
    });
  });

  it("keeps Studio iframe sizing on the modal wrapper", () => {
    renderStudioEntry();

    expect(frameHarness.options).not.toMatchObject({ minHeight: 0 });
    expect(frameHarness.options).toMatchObject({
      title: "Scaffold editor",
    });
  });

  it("passes the canonical learner snapshot unchanged into the student iframe", () => {
    renderStudentEntry(learnerData);

    const payload = capturedFrameOptions().initPayload;
    expect(payload).toMatchObject({
      view: "student",
      artifact: learnerData.artifact,
      protocolVersion: 1,
      mediaContext: "runtime",
      resolvedMedia: learnerData.resolvedMedia,
      initialLearnerState: {
        assessmentSnapshot,
        learnerActivitySnapshot: learnerData.learnerActivitySnapshot,
      },
    });
    expect(payload.initialLearnerState.assessmentSnapshot).toBe(assessmentSnapshot);
    expect(payload.initialLearnerState.learnerActivitySnapshot).toBe(
      learnerData.learnerActivitySnapshot,
    );
    expect("assessmentSnapshot" in payload).toBe(false);
    expect("learnerActivitySnapshot" in payload).toBe(false);
  });

  it("retries adapter grade delivery during learner bootstrap", async () => {
    const handlerUrl = vi.fn((_element: unknown, handlerName: string) => {
      return `http://local.openedx.io/handler/${handlerName}`;
    });
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: true, deliveryStatus: "delivered" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { handlerElement } = renderEntry(renderStudentBlock, learnerData, { handlerUrl });

    await vi.waitFor(() => {
      expect(handlerUrl).toHaveBeenCalledWith(handlerElement, "retry_assessment_grade_delivery");
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://local.openedx.io/handler/retry_assessment_grade_delivery",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ protocolVersion: 1 }),
      }),
    );
  });

  it("waits for bootstrap grade retry before handling iframe requests", async () => {
    let finishRetry: (() => void) | undefined;
    const retryPending = new Promise<void>((resolve) => {
      finishRetry = resolve;
    });
    const handlerUrl = vi.fn((_element: unknown, handlerName: string) => {
      return `http://local.openedx.io/handler/${handlerName}`;
    });
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith("/retry_assessment_grade_delivery")) {
        return retryPending.then(() => ({
          ok: true,
          json: async () => ({ success: true, deliveryStatus: "delivered" }),
        }));
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderEntry(renderStudentBlock, learnerData, { handlerUrl });
    const options = capturedFrameOptions();
    options.onRequest(
      createXBlockBridgeRequest({
        requestId: "request-1",
        sessionId: "session-1",
        type: "assessment.submit",
        payload: { response: { kind: "single-select", optionId: "a" } },
      }),
      { sendSuccessResponse: vi.fn(), sendFailureResponse: vi.fn() },
    );

    await Promise.resolve();
    expect(handlerUrl).not.toHaveBeenCalledWith(expect.anything(), "submit_assessment");

    finishRetry?.();
    await vi.waitFor(() => {
      expect(handlerUrl).toHaveBeenCalledWith(expect.anything(), "submit_assessment");
    });
  });

  it("keeps learner user-state out of the Studio iframe init payload", () => {
    renderStudioEntry(learnerData);

    const payload = capturedFrameOptions().initPayload;
    expect(payload).toMatchObject({
      view: "studio",
      artifact: learnerData.artifact,
      protocolVersion: 1,
      mediaContext: "runtime",
      resolvedMedia: learnerData.resolvedMedia,
      initialLearnerState: {},
    });
    expect(payload.initialLearnerState).toEqual({});
    expect("assessmentSnapshot" in payload.initialLearnerState).toBe(false);
  });

  it("uses the original Open edX element for student handler URLs", async () => {
    const { handlerUrl, handlerElement } = await renderAndRequest(renderStudentBlock, {
      type: "assessment.submit",
      payload: { response: { kind: "single-select", optionId: "a" } },
    });

    expect(handlerUrl).toHaveBeenCalledWith(handlerElement, "submit_assessment");
  });

  it("routes learner hint reveals to the persistent XBlock handler", async () => {
    const { handlerUrl, handlerElement } = await renderAndRequest(renderStudentBlock, {
      type: "assessment.revealHint",
      payload: {
        problemId: "artifact:usage-v1/block:mcq-1",
        targetId: "mcq-1",
        interactionKind: "single-select",
        hintsShown: 1,
      },
    });

    expect(handlerUrl).toHaveBeenCalledWith(handlerElement, "reveal_hint");
  });

  it("routes learner quiz lifecycle requests to XBlock handlers", async () => {
    const { handlerUrl, handlerElement } = await renderAndRequest(renderStudentBlock, {
      type: "assessment.quiz.startAttempt",
      payload: { groupId: "quiz-1" },
    });

    expect(handlerUrl).toHaveBeenCalledWith(handlerElement, "start_quiz_attempt");
  });

  it("routes strict learner activity loads to the snapshot handler", async () => {
    const { handlerUrl, handlerElement } = await renderAndRequest(renderStudentBlock, {
      type: "learnerActivity.load",
      payload: { artifactId: data.artifact.id },
    });

    expect(handlerUrl).toHaveBeenCalledWith(handlerElement, "load_learner_activity");
  });

  it("routes strict learner activity saves to the snapshot handler", async () => {
    const { handlerUrl, handlerElement } = await renderAndRequest(renderStudentBlock, {
      type: "learnerActivity.save",
      payload: {
        artifactId: data.artifact.id,
        blockId: "flashcard-1",
        record: {
          activityKind: "flashcard",
          data: { currentCardId: "card-2" },
          completed: true,
        },
      },
    });

    expect(handlerUrl).toHaveBeenCalledWith(handlerElement, "save_learner_activity");
  });

  it("uses the original Open edX element for Studio handler URLs", async () => {
    const { handlerUrl, handlerElement } = await renderAndRequest(renderStudioBlock, {
      type: "media.resolve",
      payload: { mediaId: "asset-1", context: "authoring" },
    });

    expect(handlerUrl).toHaveBeenCalledWith(handlerElement, "resolve_media");
  });

  it("routes Studio artifact creation to the XBlock creation handler", async () => {
    const { handlerUrl, handlerElement } = await renderAndRequest(renderStudioBlock, {
      type: "persistence.createArtifact",
      payload: { mode: "page" },
    });

    expect(handlerUrl).toHaveBeenCalledWith(handlerElement, "create_artifact");
  });
});

function renderStudentEntry(entryData: ScaffoldXBlockOuterData = data) {
  return renderEntry(renderStudentBlock, entryData);
}

function renderStudioEntry(entryData: ScaffoldXBlockOuterData = data) {
  return renderEntry(renderStudioBlock, entryData);
}

function renderEntry(
  renderBlock: (
    mountElement: Element,
    data: ScaffoldXBlockOuterData,
    runtime: XBlockRuntime,
    handlerElement: unknown,
  ) => void,
  entryData: ScaffoldXBlockOuterData = data,
  runtime: XBlockRuntime = {
    handlerUrl: vi.fn((_element: unknown, handlerName: string) => {
      return `http://local.openedx.io/handler/${handlerName}`;
    }),
  },
) {
  const mountElement = document.createElement("div");
  const handlerElement = { openedxElement: true };
  document.body.append(mountElement);

  renderBlock(mountElement, entryData, runtime, handlerElement);

  return { mountElement, handlerElement, runtime };
}

async function renderAndRequest(
  renderBlock: (
    mountElement: Element,
    data: ScaffoldXBlockOuterData,
    runtime: XBlockRuntime,
    handlerElement: unknown,
  ) => void,
  request: {
    type: Parameters<typeof createXBlockBridgeRequest>[0]["type"];
    payload: unknown;
  },
) {
  const handlerUrl = vi.fn((_element: unknown, handlerName: string) => {
    return `http://local.openedx.io/handler/${handlerName}`;
  });
  const runtime: XBlockRuntime = { handlerUrl };
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ success: true }),
  }));
  vi.stubGlobal("fetch", fetchMock);

  const { mountElement, handlerElement } = renderEntry(renderBlock, data, runtime);

  expect(runtime.element).toBe(handlerElement);
  const options = capturedFrameOptions();
  expect(options.container).toBe(mountElement);

  const frame = {
    sendSuccessResponse: vi.fn(),
    sendFailureResponse: vi.fn(),
  };
  options.onRequest(
    createXBlockBridgeRequest({
      requestId: "request-1",
      sessionId: "session-1",
      type: request.type,
      payload: request.payload,
    }),
    frame,
  );

  await vi.waitFor(() => {
    expect(frame.sendSuccessResponse).toHaveBeenCalledOnce();
  });
  expect(frame.sendFailureResponse).not.toHaveBeenCalled();

  return { handlerUrl, handlerElement, fetchMock };
}

function capturedFrameOptions(): CapturedFrameOptions {
  return frameHarness.options as CapturedFrameOptions;
}
