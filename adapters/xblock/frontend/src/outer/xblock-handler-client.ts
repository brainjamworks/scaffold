import {
  createXBlockBridgeError,
  type XBlockBridgeErrorPayload,
  type XBlockBridgeRequest,
} from "../bridge/protocol";
import { type XBlockHandlerElement, type XBlockRuntime, xblockPost } from "../api";

export interface XBlockOuterRequestContext {
  runtime: XBlockRuntime;
  element: XBlockHandlerElement;
  artifactId: string;
}

export async function handleXBlockBridgeRequest(
  request: XBlockBridgeRequest,
  context: XBlockOuterRequestContext,
): Promise<unknown> {
  switch (request.messageType) {
    case "persistence.createArtifact":
      return xblockPost(context.runtime, context.element, "create_artifact", request.payload);

    case "persistence.saveArtifact":
      return xblockPost(context.runtime, context.element, "save_content", request.payload);

    case "media.resolve":
      return xblockPost(context.runtime, context.element, "resolve_media", request.payload);

    case "media.list":
      return xblockPost(context.runtime, context.element, "list_media", request.payload);

    case "media.upload":
      return xblockPost(context.runtime, context.element, "upload_media", request.payload);

    case "assessment.check":
      return xblockPost(context.runtime, context.element, "check_assessment", request.payload);

    case "assessment.submit":
      return xblockPost(context.runtime, context.element, "submit_assessment", request.payload);

    case "assessment.previewCheck":
      return xblockPost(
        context.runtime,
        context.element,
        "preview_check_assessment",
        request.payload,
      );

    case "assessment.previewSubmit":
      return xblockPost(
        context.runtime,
        context.element,
        "preview_submit_assessment",
        request.payload,
      );

    case "assessment.revealHint":
      return xblockPost(context.runtime, context.element, "reveal_hint", request.payload);

    case "assessment.revealAnswer":
      return xblockPost(context.runtime, context.element, "reveal_answer", request.payload);

    case "assessment.quiz.startAttempt":
      return xblockQuizRequest(context, "start_quiz_attempt", request.payload);

    case "assessment.quiz.submitQuestion":
      return xblockQuizRequest(context, "submit_quiz_question", request.payload);

    case "assessment.quiz.finishAttempt":
      return xblockQuizRequest(context, "finish_quiz_attempt", request.payload);

    case "assessment.quiz.revealAnswers":
      return xblockQuizRequest(context, "reveal_quiz_answers", request.payload);

    case "learnerActivity.load":
      return xblockPost(context.runtime, context.element, "load_learner_activity", request.payload);

    case "learnerActivity.save":
      return xblockPost(context.runtime, context.element, "save_learner_activity", request.payload);

    case "xapi.accept":
      return xblockPost(context.runtime, context.element, "accept_xapi_statement", request.payload);

    case "host.notifySaveStart":
      context.runtime.notify?.("save", {
        state: "start",
        message: readOptionalMessage(request.payload) ?? "Saving Scaffold content",
      });
      return {};

    case "host.notifySaveEnd":
      context.runtime.notify?.("save", { state: "end" });
      return {};

    case "host.done":
      context.runtime.notify?.("cancel", {});
      return {};

    default:
      throw bridgeError("invalid_type", "Unsupported XBlock bridge request.");
  }
}

interface XBlockQuizGroupIdentity {
  authored: string;
  scoped: string;
}

async function xblockQuizRequest(
  context: XBlockOuterRequestContext,
  handlerName: string,
  payload: unknown,
): Promise<unknown> {
  const group = xblockQuizGroupIdentity(context.artifactId, payload);
  const response = await xblockPost(context.runtime, context.element, handlerName, {
    ...(payload as Record<string, unknown>),
    groupId: group.authored,
  });

  return restoreScopedQuizOutcome(response, group);
}

function xblockQuizGroupIdentity(
  artifactId: string,
  payload: unknown,
): XBlockQuizGroupIdentity {
  if (!isRecord(payload) || typeof payload.groupId !== "string") {
    throw new Error("Open edX Quiz request requires a group id");
  }

  const scoped = payload.groupId;
  const prefix = `artifact:${encodeURIComponent(artifactId)}/group:`;
  if (!scoped.startsWith(prefix)) {
    throw new Error("Open edX Quiz group id is not scoped to this XBlock");
  }

  const encodedAuthored = scoped.slice(prefix.length);
  let authored: string;
  try {
    authored = decodeURIComponent(encodedAuthored);
  } catch {
    throw new Error("Open edX Quiz group id is not valid");
  }

  if (authored.length === 0 || encodeURIComponent(authored) !== encodedAuthored) {
    throw new Error("Open edX Quiz group id is not valid");
  }

  return { authored, scoped };
}

function restoreScopedQuizOutcome(
  response: unknown,
  group: XBlockQuizGroupIdentity,
): unknown {
  if (!isRecord(response) || response.success !== true) {
    return response;
  }

  const quizAttempt = response.quizAttempt;
  if (!isRecord(quizAttempt) || quizAttempt.groupId !== group.authored) {
    throw new Error("Open edX Quiz response group id did not match request");
  }

  return {
    ...response,
    quizAttempt: {
      ...quizAttempt,
      groupId: group.scoped,
    },
  };
}

export function toBridgeError(error: unknown): XBlockBridgeErrorPayload {
  if (isBridgeError(error)) return error;
  return createXBlockBridgeError(
    "invalid_request",
    error instanceof Error ? error.message : "XBlock bridge request failed.",
  );
}

function bridgeError(
  code: XBlockBridgeErrorPayload["code"],
  message: string,
): XBlockBridgeErrorPayload {
  return createXBlockBridgeError(code, message);
}

function isBridgeError(value: unknown): value is XBlockBridgeErrorPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.code === "string" && typeof record.message === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptionalMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const message = (payload as Record<string, unknown>).message;
  return typeof message === "string" && message.trim() ? message : null;
}
