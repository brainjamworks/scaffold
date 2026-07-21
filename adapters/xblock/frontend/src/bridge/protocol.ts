export const SCAFFOLD_XBLOCK_BRIDGE_CHANNEL = "scaffold.xblock.bridge";
export const SCAFFOLD_XBLOCK_BRIDGE_PROTOCOL_VERSION = 1;

export const SCAFFOLD_XBLOCK_BRIDGE_REQUEST_TYPES = [
  "persistence.createArtifact",
  "persistence.saveArtifact",
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
  "host.notifySaveStart",
  "host.notifySaveEnd",
  "host.done",
] as const;

export const SCAFFOLD_XBLOCK_BRIDGE_LIFECYCLE_TYPES = [
  "inner.ready",
  "outer.init",
  "inner.heightChanged",
  "inner.dirtyChanged",
  "inner.fatalError",
  "outer.hostActionResult",
] as const;

export type XBlockBridgeRequestType = (typeof SCAFFOLD_XBLOCK_BRIDGE_REQUEST_TYPES)[number];

export type XBlockBridgeLifecycleType = (typeof SCAFFOLD_XBLOCK_BRIDGE_LIFECYCLE_TYPES)[number];

export type XBlockBridgeMessageKind = "request" | "response" | "lifecycle";

export interface XBlockBridgeBaseEnvelope<
  TKind extends XBlockBridgeMessageKind,
  TType extends string,
  TPayload,
> {
  channel: typeof SCAFFOLD_XBLOCK_BRIDGE_CHANNEL;
  protocolVersion: typeof SCAFFOLD_XBLOCK_BRIDGE_PROTOCOL_VERSION;
  sessionId: string;
  kind: TKind;
  messageType: TType;
  payload: TPayload;
}

export interface XBlockBridgeRequest<
  TType extends XBlockBridgeRequestType = XBlockBridgeRequestType,
  TPayload = unknown,
> extends XBlockBridgeBaseEnvelope<"request", TType, TPayload> {
  requestId: string;
}

export interface XBlockBridgeLifecycleMessage<
  TType extends XBlockBridgeLifecycleType = XBlockBridgeLifecycleType,
  TPayload = unknown,
> extends XBlockBridgeBaseEnvelope<"lifecycle", TType, TPayload> {}

export type XBlockBridgeResponse<TResult = unknown> =
  | {
      channel: typeof SCAFFOLD_XBLOCK_BRIDGE_CHANNEL;
      protocolVersion: typeof SCAFFOLD_XBLOCK_BRIDGE_PROTOCOL_VERSION;
      sessionId: string;
      kind: "response";
      requestId: string;
      ok: true;
      result: TResult;
    }
  | {
      channel: typeof SCAFFOLD_XBLOCK_BRIDGE_CHANNEL;
      protocolVersion: typeof SCAFFOLD_XBLOCK_BRIDGE_PROTOCOL_VERSION;
      sessionId: string;
      kind: "response";
      requestId: string;
      ok: false;
      error: XBlockBridgeErrorPayload;
    };

export type XBlockBridgeMessage =
  | XBlockBridgeRequest
  | XBlockBridgeLifecycleMessage
  | XBlockBridgeResponse;

export type XBlockBridgeErrorCode =
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

export interface XBlockBridgeErrorPayload {
  code: XBlockBridgeErrorCode;
  message: string;
}

export type XBlockBridgeValidationResult<TMessage extends XBlockBridgeMessage> =
  | { ok: true; message: TMessage }
  | { ok: false; error: XBlockBridgeErrorPayload };

export interface XBlockBridgeValidationOptions {
  expectedSessionId?: string;
}

export interface XBlockBridgeEventLike {
  data: unknown;
  origin: string;
  source: unknown;
}

export interface XBlockBridgeEventValidationOptions extends XBlockBridgeValidationOptions {
  expectedOrigin?: string;
  expectedSource?: unknown;
}

const requestTypeSet = new Set<string>(SCAFFOLD_XBLOCK_BRIDGE_REQUEST_TYPES);
const lifecycleTypeSet = new Set<string>(SCAFFOLD_XBLOCK_BRIDGE_LIFECYCLE_TYPES);

export function isXBlockBridgeRequestType(value: unknown): value is XBlockBridgeRequestType {
  return typeof value === "string" && requestTypeSet.has(value);
}

export function isXBlockBridgeLifecycleType(value: unknown): value is XBlockBridgeLifecycleType {
  return typeof value === "string" && lifecycleTypeSet.has(value);
}

export function createXBlockBridgeError(
  code: XBlockBridgeErrorCode,
  message: string,
): XBlockBridgeErrorPayload {
  return { code, message };
}

export function createXBlockBridgeRequest<TType extends XBlockBridgeRequestType, TPayload>({
  requestId,
  sessionId,
  type,
  payload,
}: {
  requestId: string;
  sessionId: string;
  type: TType;
  payload: TPayload;
}): XBlockBridgeRequest<TType, TPayload> {
  return {
    channel: SCAFFOLD_XBLOCK_BRIDGE_CHANNEL,
    protocolVersion: SCAFFOLD_XBLOCK_BRIDGE_PROTOCOL_VERSION,
    sessionId,
    kind: "request",
    requestId,
    messageType: type,
    payload,
  };
}

export function createXBlockBridgeLifecycleMessage<
  TType extends XBlockBridgeLifecycleType,
  TPayload,
>({
  sessionId,
  type,
  payload,
}: {
  sessionId: string;
  type: TType;
  payload: TPayload;
}): XBlockBridgeLifecycleMessage<TType, TPayload> {
  return {
    channel: SCAFFOLD_XBLOCK_BRIDGE_CHANNEL,
    protocolVersion: SCAFFOLD_XBLOCK_BRIDGE_PROTOCOL_VERSION,
    sessionId,
    kind: "lifecycle",
    messageType: type,
    payload,
  };
}

export function createXBlockBridgeSuccessResponse<TResult>({
  requestId,
  sessionId,
  result,
}: {
  requestId: string;
  sessionId: string;
  result: TResult;
}): XBlockBridgeResponse<TResult> {
  return {
    channel: SCAFFOLD_XBLOCK_BRIDGE_CHANNEL,
    protocolVersion: SCAFFOLD_XBLOCK_BRIDGE_PROTOCOL_VERSION,
    sessionId,
    kind: "response",
    requestId,
    ok: true,
    result,
  };
}

export function createXBlockBridgeFailureResponse({
  requestId,
  sessionId,
  error,
}: {
  requestId: string;
  sessionId: string;
  error: XBlockBridgeErrorPayload;
}): XBlockBridgeResponse<never> {
  return {
    channel: SCAFFOLD_XBLOCK_BRIDGE_CHANNEL,
    protocolVersion: SCAFFOLD_XBLOCK_BRIDGE_PROTOCOL_VERSION,
    sessionId,
    kind: "response",
    requestId,
    ok: false,
    error,
  };
}

export function validateXBlockBridgeEvent(
  event: XBlockBridgeEventLike,
  options: XBlockBridgeEventValidationOptions = {},
): XBlockBridgeValidationResult<XBlockBridgeMessage> {
  if (typeof options.expectedOrigin === "string" && event.origin !== options.expectedOrigin) {
    return failure(
      "origin_mismatch",
      `Ignored XBlock bridge message from unexpected origin: ${event.origin}`,
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(options, "expectedSource") &&
    event.source !== options.expectedSource
  ) {
    return failure("source_mismatch", "Ignored XBlock bridge message from unexpected source.");
  }

  return validateXBlockBridgeMessage(event.data, options);
}

export function validateXBlockBridgeMessage(
  value: unknown,
  options: XBlockBridgeValidationOptions = {},
): XBlockBridgeValidationResult<XBlockBridgeMessage> {
  if (!isRecord(value)) {
    return failure("invalid_message", "XBlock bridge message must be an object.");
  }

  if (value.channel !== SCAFFOLD_XBLOCK_BRIDGE_CHANNEL) {
    return failure("invalid_channel", "XBlock bridge message has an invalid channel.");
  }

  if (value.protocolVersion !== SCAFFOLD_XBLOCK_BRIDGE_PROTOCOL_VERSION) {
    return failure("protocol_mismatch", "XBlock bridge message protocol version is not supported.");
  }

  if (!isNonEmptyString(value.sessionId)) {
    return failure("invalid_message", "XBlock bridge message is missing sessionId.");
  }

  if (
    typeof options.expectedSessionId === "string" &&
    value.sessionId !== options.expectedSessionId
  ) {
    return failure("session_mismatch", "XBlock bridge message belongs to another session.");
  }

  if (value.kind === "request") {
    return validateRequest(value);
  }

  if (value.kind === "response") {
    return validateResponse(value);
  }

  if (value.kind === "lifecycle") {
    return validateLifecycle(value);
  }

  return failure("invalid_kind", "XBlock bridge message kind is not supported.");
}

function validateRequest(
  value: Record<string, unknown>,
): XBlockBridgeValidationResult<XBlockBridgeRequest> {
  if (!isNonEmptyString(value.requestId)) {
    return failure("invalid_request", "XBlock bridge request is missing requestId.");
  }

  if (!isXBlockBridgeRequestType(value.messageType)) {
    return failure("invalid_type", "XBlock bridge request type is not supported.");
  }

  if (!Object.prototype.hasOwnProperty.call(value, "payload")) {
    return failure("invalid_request", "XBlock bridge request is missing payload.");
  }

  return {
    ok: true,
    message: value as unknown as XBlockBridgeRequest,
  };
}

function validateResponse(
  value: Record<string, unknown>,
): XBlockBridgeValidationResult<XBlockBridgeResponse> {
  if (!isNonEmptyString(value.requestId)) {
    return failure("invalid_response", "XBlock bridge response is missing requestId.");
  }

  if (value.ok === true) {
    if (!Object.prototype.hasOwnProperty.call(value, "result")) {
      return failure("invalid_response", "XBlock bridge response is missing result.");
    }

    return {
      ok: true,
      message: value as unknown as XBlockBridgeResponse,
    };
  }

  if (value.ok === false) {
    if (!isRecord(value.error) || !isNonEmptyString(value.error.message)) {
      return failure("invalid_response", "XBlock bridge response is missing error.");
    }
    if (!isNonEmptyString(value.error.code)) {
      return failure("invalid_response", "XBlock bridge response error is missing code.");
    }

    return {
      ok: true,
      message: value as unknown as XBlockBridgeResponse,
    };
  }

  return failure("invalid_response", "XBlock bridge response ok flag is invalid.");
}

function validateLifecycle(
  value: Record<string, unknown>,
): XBlockBridgeValidationResult<XBlockBridgeLifecycleMessage> {
  if (!isXBlockBridgeLifecycleType(value.messageType)) {
    return failure("invalid_type", "XBlock bridge lifecycle type is not supported.");
  }

  if (!Object.prototype.hasOwnProperty.call(value, "payload")) {
    return failure("invalid_message", "XBlock bridge lifecycle message is missing payload.");
  }

  return {
    ok: true,
    message: value as unknown as XBlockBridgeLifecycleMessage,
  };
}

function failure(
  code: XBlockBridgeErrorCode,
  message: string,
): XBlockBridgeValidationResult<never> {
  return {
    ok: false,
    error: createXBlockBridgeError(code, message),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
