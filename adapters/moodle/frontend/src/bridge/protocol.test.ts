import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vite-plus/test";

import {
  SCAFFOLD_MOODLE_BRIDGE_CHANNEL,
  SCAFFOLD_MOODLE_BRIDGE_PROTOCOL_VERSION,
  MOODLE_AJAX_METHODS,
  createMoodleAjaxRequest,
  createMoodleBridgeFailureResponse,
  createMoodleBridgeLifecycleMessage,
  createMoodleBridgeSuccessResponse,
  validateMoodleBridgeEvent,
  validateMoodleBridgeMessage,
} from "./protocol";

const sessionId = "session-123";
const source = {};

const registeredBrowserMethods = [
  "mod_scaffold_get_payload",
  "mod_scaffold_save_content",
  "mod_scaffold_load_learner_activity",
  "mod_scaffold_save_learner_activity",
  "mod_scaffold_check_assessment",
  "mod_scaffold_submit_assessment",
  "mod_scaffold_reveal_answer",
  "mod_scaffold_reveal_hint",
  "mod_scaffold_start_quiz_attempt",
  "mod_scaffold_submit_quiz_question",
  "mod_scaffold_finish_quiz_attempt",
  "mod_scaffold_reveal_quiz_answers",
  "mod_scaffold_upload_media",
  "mod_scaffold_resolve_media",
  "mod_scaffold_list_media",
] as const;

const authoringConfig = {
  cmid: 42,
  scaffoldid: 7,
  surface: "authoring" as const,
  returnUrl: "https://moodle.example/mod/scaffold/view.php?id=42",
  wwwroot: "https://moodle.example",
  sesskey: "sesskey",
};

describe("Moodle bridge protocol", () => {
  it("matches Moodle's registered browser AJAX functions", () => {
    expect(() =>
      execFileSync("php", [`${process.cwd()}/tests/external_method_parity_test.php`], {
        stdio: "pipe",
      }),
    ).not.toThrow();
  });

  it("allows exactly the registered browser method surface", () => {
    expect(MOODLE_AJAX_METHODS).toEqual(registeredBrowserMethods);

    for (const methodName of registeredBrowserMethods) {
      const request = createMoodleAjaxRequest({
        sessionId,
        requestId: `request-${methodName}`,
        methodName,
        args: { cmid: 42 },
      });
      expect(validateMoodleBridgeMessage(request)).toEqual({ ok: true, message: request });
    }
  });

  it("accepts valid lifecycle, request, and response envelopes", () => {
    const messages = [
      createMoodleBridgeLifecycleMessage({
        sessionId,
        messageType: "inner.ready",
        payload: {},
      }),
      createMoodleBridgeLifecycleMessage({
        sessionId,
        messageType: "outer.init",
        payload: { config: authoringConfig },
      }),
      createMoodleAjaxRequest({
        sessionId,
        requestId: "request-1",
        methodName: "mod_scaffold_get_payload",
        args: { cmid: 42, purpose: "authoring" },
      }),
      createMoodleBridgeSuccessResponse({
        sessionId,
        requestId: "request-1",
        result: { success: true },
      }),
      createMoodleBridgeFailureResponse({
        sessionId,
        requestId: "request-2",
        message: "Moodle call failed",
      }),
    ];

    for (const message of messages) {
      expect(validateMoodleBridgeMessage(message, { expectedSessionId: sessionId })).toEqual({
        ok: true,
        message,
      });
    }
  });

  it.each([
    ["channel", { channel: "wrong.channel" }, "invalid_channel"],
    ["version", { protocolVersion: 99 }, "protocol_mismatch"],
    ["session", { sessionId: "wrong-session" }, "session_mismatch"],
    ["kind", { kind: "command" }, "invalid_kind"],
    ["type", { messageType: "inner.unknown" }, "invalid_type"],
  ])("rejects a message with the wrong %s", (_label, change, errorCode) => {
    const message = {
      ...createMoodleBridgeLifecycleMessage({
        sessionId,
        messageType: "inner.ready",
        payload: {},
      }),
      ...change,
    };

    expect(validateMoodleBridgeMessage(message, { expectedSessionId: sessionId })).toMatchObject({
      ok: false,
      error: { code: errorCode },
    });
  });

  it("rejects events from an unexpected origin or source", () => {
    const data = createMoodleBridgeLifecycleMessage({
      sessionId,
      messageType: "inner.ready",
      payload: {},
    });

    expect(
      validateMoodleBridgeEvent(
        { data, origin: "https://attacker.example", source },
        {
          expectedOrigin: "https://scaffold.example",
          expectedSource: source,
          expectedSessionId: sessionId,
        },
      ),
    ).toMatchObject({ ok: false, error: { code: "origin_mismatch" } });

    expect(
      validateMoodleBridgeEvent(
        { data, origin: "https://scaffold.example", source: {} },
        {
          expectedOrigin: "https://scaffold.example",
          expectedSource: source,
          expectedSessionId: sessionId,
        },
      ),
    ).toMatchObject({ ok: false, error: { code: "source_mismatch" } });
  });

  it.each([
    ["missing request id", { requestId: "" }, "invalid_request"],
    [
      "unknown method",
      { payload: { methodName: "core_user_delete", args: {} } },
      "invalid_request",
    ],
    [
      "list arguments",
      { payload: { methodName: "mod_scaffold_get_payload", args: [] } },
      "invalid_request",
    ],
    [
      "null arguments",
      { payload: { methodName: "mod_scaffold_get_payload", args: null } },
      "invalid_request",
    ],
    [
      "scalar arguments",
      { payload: { methodName: "mod_scaffold_get_payload", args: "cmid=42" } },
      "invalid_request",
    ],
  ])("rejects AJAX requests with %s", (_label, change, errorCode) => {
    const request = {
      ...createMoodleAjaxRequest({
        sessionId,
        requestId: "request-1",
        methodName: "mod_scaffold_get_payload",
        args: { cmid: 42 },
      }),
      ...change,
    };

    expect(validateMoodleBridgeMessage(request, { expectedSessionId: sessionId })).toMatchObject({
      ok: false,
      error: { code: errorCode },
    });
  });

  it.each([
    ["ready payload", "inner.ready", { unexpected: true }],
    ["init payload", "outer.init", { config: { ...authoringConfig, bundleUrl: "/outer.js" } }],
    ["fatal payload", "inner.fatalError", { message: "" }],
    ["negative height", "inner.heightChanged", { height: -1 }],
    ["non-finite height", "inner.heightChanged", { height: Number.POSITIVE_INFINITY }],
  ])("rejects malformed %s", (_label, messageType, payload) => {
    const message = {
      channel: SCAFFOLD_MOODLE_BRIDGE_CHANNEL,
      protocolVersion: SCAFFOLD_MOODLE_BRIDGE_PROTOCOL_VERSION,
      sessionId,
      kind: "lifecycle",
      messageType,
      payload,
    };

    expect(validateMoodleBridgeMessage(message, { expectedSessionId: sessionId })).toMatchObject({
      ok: false,
      error: { code: "invalid_message" },
    });
  });
});
