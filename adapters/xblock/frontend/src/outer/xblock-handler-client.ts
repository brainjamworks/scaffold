import {
  createXBlockBridgeError,
  type XBlockBridgeErrorPayload,
  type XBlockBridgeRequest,
} from "../bridge/protocol";
import { type XBlockHandlerElement, type XBlockRuntime, xblockPost } from "../api";

export interface XBlockOuterRequestContext {
  runtime: XBlockRuntime;
  element: XBlockHandlerElement;
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
      return xblockPost(context.runtime, context.element, "start_quiz_attempt", request.payload);

    case "assessment.quiz.submitQuestion":
      return xblockPost(context.runtime, context.element, "submit_quiz_question", request.payload);

    case "assessment.quiz.finishAttempt":
      return xblockPost(context.runtime, context.element, "finish_quiz_attempt", request.payload);

    case "assessment.quiz.revealAnswers":
      return xblockPost(context.runtime, context.element, "reveal_quiz_answers", request.payload);

    case "learnerActivity.load":
      return xblockPost(context.runtime, context.element, "load_learner_activity", request.payload);

    case "learnerActivity.save":
      return xblockPost(context.runtime, context.element, "save_learner_activity", request.payload);

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

function readOptionalMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const message = (payload as Record<string, unknown>).message;
  return typeof message === "string" && message.trim() ? message : null;
}
