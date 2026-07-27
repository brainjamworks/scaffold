import { readFileSync } from "node:fs";

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

const readAdapterFile = (path: string): string =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
const sortStrings = (left: string, right: string): number => left.localeCompare(right);

const servicesSource = readAdapterFile("scaffold/db/services.php");
const registeredAjaxMethods = [
  ...servicesSource.matchAll(
    /'(mod_scaffold_[a-z_]+)'\s*=>\s*\[(.*?)(?=\n\s*'mod_scaffold_|\n\];)/gs,
  ),
]
  .flatMap(([, methodName, definition]) =>
    methodName && definition && /'ajax'\s*=>\s*true/.test(definition) ? [methodName] : [],
  )
  .sort(sortStrings);

const browserUsedMethods = [
  ...new Set(
    [
      "frontend/src/MoodleApp.tsx",
      "frontend/src/authoring-ports.ts",
      "frontend/src/ports.ts",
      "frontend/src/learner-activity-port.ts",
      "frontend/src/xapi-port.ts",
    ].flatMap((path) =>
      [...readAdapterFile(path).matchAll(/mod_scaffold_[a-z_]+/g)].map(
        ([methodName]) => methodName,
      ),
    ),
  ),
].sort(sortStrings);

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
    expect([...MOODLE_AJAX_METHODS].sort(sortStrings)).toEqual(registeredAjaxMethods);
    expect(browserUsedMethods).toEqual(registeredAjaxMethods);
  });

  it("keeps grade-item publication status in the content-save contract", () => {
    const saveContentSource = readAdapterFile("scaffold/classes/external/save_content.php");
    expect(saveContentSource.match(/'gradeItemPublication'/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("allows exactly the registered browser method surface", () => {
    for (const methodName of MOODLE_AJAX_METHODS) {
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
