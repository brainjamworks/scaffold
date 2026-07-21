import type { MoodleApplicationConfig } from "../types";

export const SCAFFOLD_MOODLE_BRIDGE_CHANNEL = "scaffold.moodle.bridge";
export const SCAFFOLD_MOODLE_BRIDGE_PROTOCOL_VERSION = 1;

export const MOODLE_AJAX_METHODS = [
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

export type MoodleAjaxMethod = (typeof MOODLE_AJAX_METHODS)[number];
export type MoodleBridgeLifecycleType =
  | "inner.ready"
  | "outer.init"
  | "inner.heightChanged"
  | "inner.fatalError";

interface MoodleBridgeBaseEnvelope<TKind extends string> {
  channel: typeof SCAFFOLD_MOODLE_BRIDGE_CHANNEL;
  protocolVersion: typeof SCAFFOLD_MOODLE_BRIDGE_PROTOCOL_VERSION;
  sessionId: string;
  kind: TKind;
}

export interface MoodleAjaxRequest extends MoodleBridgeBaseEnvelope<"request"> {
  requestId: string;
  messageType: "moodle.ajax";
  payload: {
    methodName: MoodleAjaxMethod;
    args: Record<string, unknown>;
  };
}

export type MoodleBridgeLifecycleMessage =
  | (MoodleBridgeBaseEnvelope<"lifecycle"> & {
      messageType: "inner.ready";
      payload: Record<string, never>;
    })
  | (MoodleBridgeBaseEnvelope<"lifecycle"> & {
      messageType: "outer.init";
      payload: { config: MoodleApplicationConfig };
    })
  | (MoodleBridgeBaseEnvelope<"lifecycle"> & {
      messageType: "inner.heightChanged";
      payload: { height: number };
    })
  | (MoodleBridgeBaseEnvelope<"lifecycle"> & {
      messageType: "inner.fatalError";
      payload: { message: string };
    });

export type MoodleBridgeResponse =
  | (MoodleBridgeBaseEnvelope<"response"> & {
      requestId: string;
      ok: true;
      result: unknown;
    })
  | (MoodleBridgeBaseEnvelope<"response"> & {
      requestId: string;
      ok: false;
      error: { message: string };
    });

export type MoodleBridgeMessage =
  | MoodleAjaxRequest
  | MoodleBridgeLifecycleMessage
  | MoodleBridgeResponse;

export type MoodleBridgeErrorCode =
  | "invalid_message"
  | "invalid_channel"
  | "protocol_mismatch"
  | "session_mismatch"
  | "origin_mismatch"
  | "source_mismatch"
  | "invalid_kind"
  | "invalid_type"
  | "invalid_request"
  | "invalid_response";

export type MoodleBridgeValidationResult =
  | { ok: true; message: MoodleBridgeMessage }
  | { ok: false; error: { code: MoodleBridgeErrorCode; message: string } };

export interface MoodleBridgeEventLike {
  data: unknown;
  origin: string;
  source: unknown;
}

export interface MoodleBridgeValidationOptions {
  expectedOrigin?: string;
  expectedSource?: unknown;
  expectedSessionId?: string;
}

const moodleAjaxMethodSet = new Set<string>(MOODLE_AJAX_METHODS);
const lifecycleTypeSet = new Set<string>([
  "inner.ready",
  "outer.init",
  "inner.heightChanged",
  "inner.fatalError",
]);

export function createMoodleAjaxRequest({
  sessionId,
  requestId,
  methodName,
  args,
}: {
  sessionId: string;
  requestId: string;
  methodName: MoodleAjaxMethod;
  args: Record<string, unknown>;
}): MoodleAjaxRequest {
  return envelope(sessionId, {
    kind: "request",
    requestId,
    messageType: "moodle.ajax",
    payload: { methodName, args },
  });
}

export function createMoodleBridgeLifecycleMessage(
  message: Omit<MoodleBridgeLifecycleMessage, "channel" | "protocolVersion" | "kind">,
): MoodleBridgeLifecycleMessage {
  return envelope(message.sessionId, {
    kind: "lifecycle",
    messageType: message.messageType,
    payload: message.payload,
  }) as MoodleBridgeLifecycleMessage;
}

export function createMoodleBridgeSuccessResponse({
  sessionId,
  requestId,
  result,
}: {
  sessionId: string;
  requestId: string;
  result: unknown;
}): MoodleBridgeResponse {
  return envelope(sessionId, { kind: "response", requestId, ok: true, result });
}

export function createMoodleBridgeFailureResponse({
  sessionId,
  requestId,
  message,
}: {
  sessionId: string;
  requestId: string;
  message: string;
}): MoodleBridgeResponse {
  return envelope(sessionId, {
    kind: "response",
    requestId,
    ok: false,
    error: { message },
  });
}

export function validateMoodleBridgeEvent(
  event: MoodleBridgeEventLike,
  options: MoodleBridgeValidationOptions = {},
): MoodleBridgeValidationResult {
  if (options.expectedOrigin !== undefined && event.origin !== options.expectedOrigin) {
    return failure("origin_mismatch", "Ignored Moodle bridge message from unexpected origin.");
  }

  if (
    Object.prototype.hasOwnProperty.call(options, "expectedSource") &&
    event.source !== options.expectedSource
  ) {
    return failure("source_mismatch", "Ignored Moodle bridge message from unexpected source.");
  }

  return validateMoodleBridgeMessage(event.data, options);
}

export function validateMoodleBridgeMessage(
  value: unknown,
  options: Pick<MoodleBridgeValidationOptions, "expectedSessionId"> = {},
): MoodleBridgeValidationResult {
  if (!isRecord(value)) {
    return failure("invalid_message", "Moodle bridge message must be an object.");
  }
  if (value.channel !== SCAFFOLD_MOODLE_BRIDGE_CHANNEL) {
    return failure("invalid_channel", "Moodle bridge message has an invalid channel.");
  }
  if (value.protocolVersion !== SCAFFOLD_MOODLE_BRIDGE_PROTOCOL_VERSION) {
    return failure("protocol_mismatch", "Moodle bridge protocol version is not supported.");
  }
  if (!isNonEmptyString(value.sessionId)) {
    return failure("invalid_message", "Moodle bridge message is missing sessionId.");
  }
  if (options.expectedSessionId !== undefined && value.sessionId !== options.expectedSessionId) {
    return failure("session_mismatch", "Moodle bridge message belongs to another session.");
  }

  if (value.kind === "request") return validateRequest(value);
  if (value.kind === "response") return validateResponse(value);
  if (value.kind === "lifecycle") return validateLifecycle(value);
  return failure("invalid_kind", "Moodle bridge message kind is not supported.");
}

function validateRequest(value: Record<string, unknown>): MoodleBridgeValidationResult {
  if (value.messageType !== "moodle.ajax") {
    return failure("invalid_type", "Moodle bridge request type is not supported.");
  }
  if (!isNonEmptyString(value.requestId) || !isRecord(value.payload)) {
    return failure("invalid_request", "Moodle bridge AJAX request is malformed.");
  }
  if (!isMoodleAjaxMethod(value.payload.methodName) || !isRecord(value.payload.args)) {
    return failure("invalid_request", "Moodle bridge AJAX request payload is malformed.");
  }
  return { ok: true, message: value as unknown as MoodleAjaxRequest };
}

function validateResponse(value: Record<string, unknown>): MoodleBridgeValidationResult {
  if (!isNonEmptyString(value.requestId)) {
    return failure("invalid_response", "Moodle bridge response is missing requestId.");
  }
  if (value.ok === true && Object.prototype.hasOwnProperty.call(value, "result")) {
    return { ok: true, message: value as unknown as MoodleBridgeResponse };
  }
  if (value.ok === false && isRecord(value.error) && isNonEmptyString(value.error.message)) {
    return { ok: true, message: value as unknown as MoodleBridgeResponse };
  }
  return failure("invalid_response", "Moodle bridge response is malformed.");
}

function validateLifecycle(value: Record<string, unknown>): MoodleBridgeValidationResult {
  if (!lifecycleTypeSet.has(String(value.messageType))) {
    return failure("invalid_type", "Moodle bridge lifecycle type is not supported.");
  }
  if (!isRecord(value.payload)) {
    return failure("invalid_message", "Moodle bridge lifecycle payload is malformed.");
  }

  if (value.messageType === "inner.ready" && Object.keys(value.payload).length === 0) {
    return { ok: true, message: value as unknown as MoodleBridgeLifecycleMessage };
  }
  if (
    value.messageType === "outer.init" &&
    Object.keys(value.payload).length === 1 &&
    isMoodleApplicationConfig(value.payload.config)
  ) {
    return { ok: true, message: value as unknown as MoodleBridgeLifecycleMessage };
  }
  if (
    value.messageType === "inner.heightChanged" &&
    Object.keys(value.payload).length === 1 &&
    typeof value.payload.height === "number" &&
    Number.isFinite(value.payload.height) &&
    value.payload.height >= 0
  ) {
    return { ok: true, message: value as unknown as MoodleBridgeLifecycleMessage };
  }
  if (
    value.messageType === "inner.fatalError" &&
    Object.keys(value.payload).length === 1 &&
    isNonEmptyString(value.payload.message)
  ) {
    return { ok: true, message: value as unknown as MoodleBridgeLifecycleMessage };
  }
  return failure("invalid_message", "Moodle bridge lifecycle payload is malformed.");
}

function isMoodleApplicationConfig(value: unknown): value is MoodleApplicationConfig {
  if (!isRecord(value)) return false;
  if (
    !Number.isInteger(value.cmid) ||
    !Number.isInteger(value.scaffoldid) ||
    !isNonEmptyString(value.wwwroot) ||
    !isNonEmptyString(value.sesskey) ||
    "bundleUrl" in value ||
    "innerUrl" in value
  ) {
    return false;
  }
  if (value.surface === "authoring") return isNonEmptyString(value.returnUrl);
  return value.surface === "learner" && !("returnUrl" in value);
}

function isMoodleAjaxMethod(value: unknown): value is MoodleAjaxMethod {
  return typeof value === "string" && moodleAjaxMethodSet.has(value);
}

function envelope<T extends object>(
  sessionId: string,
  body: T,
): Pick<MoodleBridgeBaseEnvelope<string>, "channel" | "protocolVersion" | "sessionId"> & T {
  return {
    channel: SCAFFOLD_MOODLE_BRIDGE_CHANNEL,
    protocolVersion: SCAFFOLD_MOODLE_BRIDGE_PROTOCOL_VERSION,
    sessionId,
    ...body,
  };
}

function failure(code: MoodleBridgeErrorCode, message: string): MoodleBridgeValidationResult {
  return { ok: false, error: { code, message } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
