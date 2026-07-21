import {
  createXBlockBridgeFailureResponse,
  createXBlockBridgeLifecycleMessage,
  createXBlockBridgeRequest,
  createXBlockBridgeSuccessResponse,
  validateXBlockBridgeEvent,
  type XBlockBridgeEventLike,
  type XBlockBridgeLifecycleMessage,
  type XBlockBridgeMessage,
  type XBlockBridgeRequest,
} from "../bridge/protocol";

export interface XBlockBridgeWindowTarget {
  postMessage(message: XBlockBridgeMessage, targetOrigin: string): void;
}

export type XBlockBridgeMessageListener = (event: XBlockBridgeEventLike) => void;

export interface XBlockBridgeMessageHost {
  addMessageListener(listener: XBlockBridgeMessageListener): void;
  removeMessageListener(listener: XBlockBridgeMessageListener): void;
}

export interface XBlockOuterBridgeOptions<TInitPayload = unknown> {
  sessionId: string;
  expectedInnerOrigin: string;
  expectedInnerSource: unknown;
  innerWindow: XBlockBridgeWindowTarget;
  messageHost: XBlockBridgeMessageHost;
  initPayload: TInitPayload;
  onReady?: (payload: unknown) => void;
  onHeightChanged?: (height: number) => void;
  onDirtyChanged?: (dirty: boolean) => void;
  onFatalError?: (payload: unknown) => void;
  onRequest?: (request: XBlockBridgeRequest) => void;
}

export interface XBlockOuterBridge {
  destroy(): void;
  sendRequest<TPayload>(request: {
    requestId: string;
    type: Parameters<typeof createXBlockBridgeRequest>[0]["type"];
    payload: TPayload;
  }): void;
  sendSuccessResponse<TResult>(response: { requestId: string; result: TResult }): void;
  sendFailureResponse(response: {
    requestId: string;
    error: Parameters<typeof createXBlockBridgeFailureResponse>[0]["error"];
  }): void;
}

export function createXBlockOuterBridge<TInitPayload = unknown>(
  options: XBlockOuterBridgeOptions<TInitPayload>,
): XBlockOuterBridge {
  let destroyed = false;

  const postToInner = (message: XBlockBridgeMessage) => {
    if (destroyed) return;
    options.innerWindow.postMessage(message, options.expectedInnerOrigin);
  };

  const sendInit = () => {
    postToInner(
      createXBlockBridgeLifecycleMessage({
        sessionId: options.sessionId,
        type: "outer.init",
        payload: options.initPayload,
      }),
    );
  };

  const handleMessage: XBlockBridgeMessageListener = (event) => {
    const result = validateXBlockBridgeEvent(event, {
      expectedOrigin: options.expectedInnerOrigin,
      expectedSource: options.expectedInnerSource,
      expectedSessionId: options.sessionId,
    });

    if (!result.ok) return;
    if (result.message.kind === "lifecycle") {
      handleLifecycleMessage(result.message, options, sendInit);
      return;
    }

    if (result.message.kind === "request") {
      options.onRequest?.(result.message);
    }
  };

  options.messageHost.addMessageListener(handleMessage);

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      options.messageHost.removeMessageListener(handleMessage);
    },

    sendRequest(request) {
      postToInner(
        createXBlockBridgeRequest({
          sessionId: options.sessionId,
          requestId: request.requestId,
          type: request.type,
          payload: request.payload,
        }),
      );
    },

    sendSuccessResponse(response) {
      postToInner(
        createXBlockBridgeSuccessResponse({
          sessionId: options.sessionId,
          requestId: response.requestId,
          result: response.result,
        }),
      );
    },

    sendFailureResponse(response) {
      postToInner(
        createXBlockBridgeFailureResponse({
          sessionId: options.sessionId,
          requestId: response.requestId,
          error: response.error,
        }),
      );
    },
  };
}

function handleLifecycleMessage(
  message: XBlockBridgeLifecycleMessage,
  options: XBlockOuterBridgeOptions,
  sendInit: () => void,
): void {
  switch (message.messageType) {
    case "inner.ready":
      options.onReady?.(message.payload);
      sendInit();
      return;

    case "inner.heightChanged":
      options.onHeightChanged?.(readHeightPayload(message.payload));
      return;

    case "inner.dirtyChanged":
      options.onDirtyChanged?.(readDirtyPayload(message.payload));
      return;

    case "inner.fatalError":
      options.onFatalError?.(message.payload);
      return;

    default:
      return;
  }
}

function readHeightPayload(payload: unknown): number {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return 0;
  const height = (payload as Record<string, unknown>).height;
  return typeof height === "number" && Number.isFinite(height) && height > 0
    ? Math.ceil(height)
    : 0;
}

function readDirtyPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  return (payload as Record<string, unknown>).dirty === true;
}
