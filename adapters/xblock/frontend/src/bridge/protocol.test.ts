import { describe, expect, it } from "vite-plus/test";

import {
  SCAFFOLD_XBLOCK_BRIDGE_CHANNEL,
  SCAFFOLD_XBLOCK_BRIDGE_PROTOCOL_VERSION,
  SCAFFOLD_XBLOCK_BRIDGE_REQUEST_TYPES,
  createXBlockBridgeError,
  createXBlockBridgeFailureResponse,
  createXBlockBridgeLifecycleMessage,
  createXBlockBridgeRequest,
  createXBlockBridgeSuccessResponse,
  validateXBlockBridgeEvent,
  validateXBlockBridgeMessage,
} from "./protocol";

describe("XBlock iframe bridge protocol", () => {
  it("publishes the exact current request-type allowlist", () => {
    expect(SCAFFOLD_XBLOCK_BRIDGE_REQUEST_TYPES).toEqual([
      "persistence.createArtifact",
      "persistence.saveArtifact",
      "publication.publish",
      "media.resolve",
      "media.list",
      "media.upload",
      "assessment.check",
      "assessment.submit",
      "assessment.previewCheck",
      "assessment.previewSubmit",
      "assessment.revealHint",
      "assessment.revealAnswer",
      "assessment.quiz.startAttempt",
      "assessment.quiz.submitQuestion",
      "assessment.quiz.finishAttempt",
      "assessment.quiz.revealAnswers",
      "learnerActivity.load",
      "learnerActivity.save",
      "learningEvents.accept",
      "host.notifySaveStart",
      "host.notifySaveEnd",
      "host.done",
    ]);
  });

  it("accepts a valid request envelope", () => {
    const message = createXBlockBridgeRequest({
      requestId: "request-1",
      sessionId: "session-1",
      type: "persistence.saveArtifact",
      payload: { artifact: { id: "artifact-1" } },
    });

    const result = validateXBlockBridgeMessage(message, {
      expectedSessionId: "session-1",
    });

    expect(message.messageType).toBe("persistence.saveArtifact");
    expect("type" in message).toBe(false);
    expect(result).toEqual({ ok: true, message });
  });

  it("accepts artifact creation request envelopes", () => {
    const message = createXBlockBridgeRequest({
      requestId: "request-1",
      sessionId: "session-1",
      type: "persistence.createArtifact",
      payload: { mode: "page" },
    });

    const result = validateXBlockBridgeMessage(message);

    expect(result).toEqual({ ok: true, message });
  });

  it("accepts explicit publication request envelopes", () => {
    const message = createXBlockBridgeRequest({
      requestId: "request-publish",
      sessionId: "session-1",
      type: "publication.publish",
      payload: { sourceArtifactRevision: "revision-1" },
    });

    expect(validateXBlockBridgeMessage(message)).toEqual({ ok: true, message });
  });

  it("accepts learner hint reveal request envelopes", () => {
    const message = createXBlockBridgeRequest({
      requestId: "request-1",
      sessionId: "session-1",
      type: "assessment.revealHint",
      payload: {
        problemId: "artifact:usage-v1/block:mcq-1",
        targetId: "mcq-1",
        interactionKind: "single-select",
        hintsShown: 1,
      },
    });

    expect(validateXBlockBridgeMessage(message)).toEqual({ ok: true, message });
  });

  it("accepts strict learner activity load request envelopes", () => {
    const message = createXBlockBridgeRequest({
      requestId: "request-1",
      sessionId: "session-1",
      type: "learnerActivity.load",
      payload: { artifactId: "artifact-1" },
    });

    expect(validateXBlockBridgeMessage(message)).toEqual({ ok: true, message });
  });

  it("accepts strict learner activity save request envelopes", () => {
    const message = createXBlockBridgeRequest({
      requestId: "request-1",
      sessionId: "session-1",
      type: "learnerActivity.save",
      payload: {
        artifactId: "artifact-1",
        blockId: "flashcard-1",
        record: {
          activityKind: "flashcard",
          data: { currentCardId: "card-2" },
          completed: true,
        },
      },
    });

    expect(validateXBlockBridgeMessage(message)).toEqual({ ok: true, message });
  });

  it("accepts version-2 learning event request envelopes", () => {
    const message = createXBlockBridgeRequest({
      requestId: "request-1",
      sessionId: "session-1",
      type: "learningEvents.accept",
      payload: {
        event: {
          id: "00000000-0000-4000-8000-000000000001",
          timestamp: "2026-07-27T12:00:00.000Z",
        },
      },
    });

    expect(message.protocolVersion).toBe(2);
    expect(validateXBlockBridgeMessage(message)).toEqual({ ok: true, message });
  });

  it("accepts a valid lifecycle envelope", () => {
    const message = createXBlockBridgeLifecycleMessage({
      sessionId: "session-1",
      type: "inner.ready",
      payload: { height: 640 },
    });

    const result = validateXBlockBridgeMessage(message, {
      expectedSessionId: "session-1",
    });

    expect(message.messageType).toBe("inner.ready");
    expect("type" in message).toBe(false);
    expect(result).toEqual({ ok: true, message });
  });

  it("accepts valid success and failure responses", () => {
    const success = createXBlockBridgeSuccessResponse({
      requestId: "request-1",
      sessionId: "session-1",
      result: { ok: true },
    });
    const failure = createXBlockBridgeFailureResponse({
      requestId: "request-2",
      sessionId: "session-1",
      error: createXBlockBridgeError("invalid_request", "Bad request"),
    });

    expect(validateXBlockBridgeMessage(success)).toEqual({
      ok: true,
      message: success,
    });
    expect(validateXBlockBridgeMessage(failure)).toEqual({
      ok: true,
      message: failure,
    });
  });

  it("rejects messages with the wrong channel", () => {
    const result = validateXBlockBridgeMessage({
      channel: "scaffold.other",
      protocolVersion: SCAFFOLD_XBLOCK_BRIDGE_PROTOCOL_VERSION,
      sessionId: "session-1",
      kind: "request",
      requestId: "request-1",
      messageType: "persistence.saveArtifact",
      payload: {},
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "invalid_channel",
        message: "XBlock bridge message has an invalid channel.",
      },
    });
  });

  it("rejects version-1 messages", () => {
    const result = validateXBlockBridgeMessage({
      channel: SCAFFOLD_XBLOCK_BRIDGE_CHANNEL,
      protocolVersion: 1,
      sessionId: "session-1",
      kind: "request",
      requestId: "request-1",
      messageType: "persistence.saveArtifact",
      payload: {},
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "protocol_mismatch",
        message: "XBlock bridge message protocol version is not supported.",
      },
    });
  });

  it("rejects session mismatches", () => {
    const message = createXBlockBridgeRequest({
      requestId: "request-1",
      sessionId: "actual-session",
      type: "persistence.saveArtifact",
      payload: {},
    });

    const result = validateXBlockBridgeMessage(message, {
      expectedSessionId: "expected-session",
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "session_mismatch",
        message: "XBlock bridge message belongs to another session.",
      },
    });
  });

  it("rejects unknown request and lifecycle types", () => {
    const request = validateXBlockBridgeMessage({
      channel: SCAFFOLD_XBLOCK_BRIDGE_CHANNEL,
      protocolVersion: SCAFFOLD_XBLOCK_BRIDGE_PROTOCOL_VERSION,
      sessionId: "session-1",
      kind: "request",
      requestId: "request-1",
      messageType: "unknown.request",
      payload: {},
    });
    const lifecycle = validateXBlockBridgeMessage({
      channel: SCAFFOLD_XBLOCK_BRIDGE_CHANNEL,
      protocolVersion: SCAFFOLD_XBLOCK_BRIDGE_PROTOCOL_VERSION,
      sessionId: "session-1",
      kind: "lifecycle",
      messageType: "unknown.lifecycle",
      payload: {},
    });

    expect(request).toMatchObject({
      ok: false,
      error: { code: "invalid_type" },
    });
    expect(lifecycle).toMatchObject({
      ok: false,
      error: { code: "invalid_type" },
    });
  });

  it("rejects messages from the wrong origin or source before parsing data", () => {
    const source = {};
    const message = createXBlockBridgeLifecycleMessage({
      sessionId: "session-1",
      type: "inner.ready",
      payload: {},
    });

    expect(
      validateXBlockBridgeEvent(
        { data: message, origin: "https://evil.example", source },
        {
          expectedOrigin: "https://studio.example",
          expectedSource: source,
          expectedSessionId: "session-1",
        },
      ),
    ).toEqual({
      ok: false,
      error: {
        code: "origin_mismatch",
        message: "Ignored XBlock bridge message from unexpected origin: https://evil.example",
      },
    });

    expect(
      validateXBlockBridgeEvent(
        { data: message, origin: "https://studio.example", source: {} },
        {
          expectedOrigin: "https://studio.example",
          expectedSource: source,
          expectedSessionId: "session-1",
        },
      ),
    ).toEqual({
      ok: false,
      error: {
        code: "source_mismatch",
        message: "Ignored XBlock bridge message from unexpected source.",
      },
    });
  });
});
