import { createIsolatedScaffoldFrame } from "./outer/create-isolated-scaffold-frame";
import { handleXBlockBridgeRequest, toBridgeError } from "./outer/xblock-handler-client";
import type { XBlockBridgeRequest } from "./bridge/protocol";
import { type XBlockHandlerElement, type XBlockRuntime, xblockPost } from "./api";
import type { ScaffoldXBlockOuterData } from "./types";
import { createXBlockSessionId } from "./xblock-ids";
import { buildXBlockInnerInitPayload } from "./xblock-init-payload";

export function renderBlock(
  mountElement: Element,
  data: ScaffoldXBlockOuterData,
  runtime: XBlockRuntime,
  handlerElement: XBlockHandlerElement = mountElement,
): void {
  if (!(mountElement instanceof HTMLElement)) {
    throw new Error("Scaffold student mount element must be an HTMLElement.");
  }
  if (!data.innerUrl) {
    throw new Error("Scaffold student payload is missing innerUrl.");
  }

  runtime.element = handlerElement;
  const bootstrapGradeDelivery = xblockPost(
    runtime,
    handlerElement,
    "retry_assessment_grade_delivery",
    {},
  ).catch(() => undefined);

  const sessionId = createXBlockSessionId();
  const initPayload = buildXBlockInnerInitPayload({
    view: "student",
    data,
    defaultMediaContext: "runtime",
  });

  createIsolatedScaffoldFrame({
    container: mountElement,
    innerUrl: data.innerUrl,
    sessionId,
    title: "Scaffold content",
    minHeight: 0,
    initPayload,
    onRequest(request, frame) {
      void bootstrapGradeDelivery.then(() =>
        respondToRequest(request, frame, runtime, handlerElement),
      );
    },
  });
}

async function respondToRequest(
  request: XBlockBridgeRequest,
  frame: {
    sendSuccessResponse(response: { requestId: string; result: unknown }): void;
    sendFailureResponse(response: {
      requestId: string;
      error: ReturnType<typeof toBridgeError>;
    }): void;
  },
  runtime: XBlockRuntime,
  element: XBlockHandlerElement,
): Promise<void> {
  try {
    const result = await handleXBlockBridgeRequest(request, {
      runtime,
      element,
    });
    frame.sendSuccessResponse({ requestId: request.requestId, result });
  } catch (error) {
    frame.sendFailureResponse({
      requestId: request.requestId,
      error: toBridgeError(error),
    });
  }
}
