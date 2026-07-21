import {
  createXBlockBridgeLifecycleMessage,
  createXBlockBridgeRequest,
  validateXBlockBridgeEvent,
  type XBlockBridgeEventLike,
  type XBlockBridgeLifecycleMessage,
  type XBlockBridgeMessage,
  type XBlockBridgeRequestType,
  type XBlockBridgeResponse,
} from "../bridge/protocol";
import type {
  XBlockBridgeMessageHost,
  XBlockBridgeMessageListener,
  XBlockBridgeWindowTarget,
} from "../outer/xblock-outer-bridge";
import { createXBlockRequestId } from "../xblock-ids";

export interface XBlockInnerBridgeOptions<TInitPayload = unknown> {
  sessionId: string;
  expectedParentOrigin: string;
  parentWindow: XBlockBridgeWindowTarget;
  parentSource: unknown;
  messageHost: XBlockBridgeMessageHost;
  onInit: (payload: TInitPayload) => void;
}

export interface XBlockInnerBridge {
  destroy(): void;
  request<TResult = unknown, TPayload = unknown>(
    type: XBlockBridgeRequestType,
    payload: TPayload,
  ): Promise<TResult>;
  sendReady(payload?: Record<string, unknown>): void;
  reportHeight(height: number): void;
  reportDirty(dirty: boolean): void;
  reportFatalError(payload: unknown): void;
}

export function createXBlockInnerBridge<TInitPayload = unknown>(
  options: XBlockInnerBridgeOptions<TInitPayload>,
): XBlockInnerBridge {
  let destroyed = false;
  const pending = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (reason: unknown) => void;
    }
  >();

  const postToParent = (message: XBlockBridgeMessage) => {
    if (destroyed) return;
    options.parentWindow.postMessage(message, options.expectedParentOrigin);
  };

  const handleMessage: XBlockBridgeMessageListener = (event: XBlockBridgeEventLike) => {
    const result = validateXBlockBridgeEvent(event, {
      expectedOrigin: options.expectedParentOrigin,
      expectedSource: options.parentSource,
      expectedSessionId: options.sessionId,
    });

    if (!result.ok) return;
    if (result.message.kind === "lifecycle") {
      handleLifecycleMessage(result.message, options);
      return;
    }

    if (result.message.kind === "response") {
      handleResponseMessage(result.message, pending);
    }
  };

  options.messageHost.addMessageListener(handleMessage);

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      options.messageHost.removeMessageListener(handleMessage);
      for (const request of pending.values()) {
        request.reject(new Error("XBlock bridge was destroyed before the request completed."));
      }
      pending.clear();
    },

    request<TResult = unknown, TPayload = unknown>(
      type: XBlockBridgeRequestType,
      payload: TPayload,
    ) {
      if (destroyed) {
        return Promise.reject(new Error("XBlock bridge is destroyed."));
      }

      const requestId = createXBlockRequestId();
      const message = createXBlockBridgeRequest({
        sessionId: options.sessionId,
        requestId,
        type,
        payload,
      });

      return new Promise<TResult>((resolve, reject) => {
        pending.set(requestId, {
          resolve(value) {
            resolve(value as TResult);
          },
          reject,
        });
        postToParent(message);
      });
    },

    sendReady(payload = {}) {
      postToParent(
        createXBlockBridgeLifecycleMessage({
          sessionId: options.sessionId,
          type: "inner.ready",
          payload,
        }),
      );
    },

    reportHeight(height) {
      postToParent(
        createXBlockBridgeLifecycleMessage({
          sessionId: options.sessionId,
          type: "inner.heightChanged",
          payload: {
            height: Math.max(0, Math.ceil(height)),
          },
        }),
      );
    },

    reportDirty(dirty) {
      postToParent(
        createXBlockBridgeLifecycleMessage({
          sessionId: options.sessionId,
          type: "inner.dirtyChanged",
          payload: { dirty },
        }),
      );
    },

    reportFatalError(payload) {
      postToParent(
        createXBlockBridgeLifecycleMessage({
          sessionId: options.sessionId,
          type: "inner.fatalError",
          payload,
        }),
      );
    },
  };
}

function handleLifecycleMessage<TInitPayload>(
  message: XBlockBridgeLifecycleMessage,
  options: XBlockInnerBridgeOptions<TInitPayload>,
): void {
  if (message.messageType !== "outer.init") return;
  options.onInit(message.payload as TInitPayload);
}

function handleResponseMessage(
  message: XBlockBridgeResponse,
  pending: Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (reason: unknown) => void;
    }
  >,
): void {
  const request = pending.get(message.requestId);
  if (!request) return;

  pending.delete(message.requestId);
  if (message.ok) {
    request.resolve(message.result);
    return;
  }

  request.reject(new Error(message.error.message));
}
