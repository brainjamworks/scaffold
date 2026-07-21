import { createXBlockOuterBridge } from "./xblock-outer-bridge";
import type { XBlockBridgeRequest } from "../bridge/protocol";
import type { XBlockOuterBridge } from "./xblock-outer-bridge";

export interface CreateIsolatedScaffoldFrameOptions<TInitPayload = unknown> {
  container: HTMLElement;
  innerUrl: string;
  sessionId: string;
  initPayload: TInitPayload;
  title: string;
  minHeight?: number;
  className?: string;
  onReady?: (payload: unknown) => void;
  onHeightChanged?: (height: number) => void;
  onDirtyChanged?: (dirty: boolean) => void;
  onFatalError?: (payload: unknown) => void;
  onRequest?: (request: XBlockBridgeRequest, bridge: XBlockOuterBridge) => void;
}

export interface IsolatedScaffoldFrame {
  iframe: HTMLIFrameElement;
  destroy(): void;
}

export function createIsolatedScaffoldFrame<TInitPayload = unknown>({
  container,
  innerUrl,
  sessionId,
  initPayload,
  title,
  minHeight = 640,
  className = "sc-xblock-isolated-frame",
  onReady,
  onHeightChanged,
  onDirtyChanged,
  onFatalError,
  onRequest,
}: CreateIsolatedScaffoldFrameOptions<TInitPayload>): IsolatedScaffoldFrame {
  const iframe = document.createElement("iframe");
  const resolvedInnerUrl = new URL(innerUrl, window.location.href);
  resolvedInnerUrl.searchParams.set("sessionId", sessionId);
  resolvedInnerUrl.searchParams.set("parentOrigin", window.location.origin);
  iframe.src = resolvedInnerUrl.href;
  iframe.title = title;
  iframe.className = className;
  iframe.style.border = "0";
  iframe.style.display = "block";
  iframe.style.width = "100%";
  iframe.style.minHeight = `${Math.ceil(minHeight)}px`;
  iframe.style.height = `${Math.ceil(minHeight)}px`;
  iframe.allowFullscreen = true;
  iframe.setAttribute("allow", "fullscreen");
  iframe.setAttribute("loading", "eager");
  iframe.setAttribute("referrerpolicy", "same-origin");

  container.replaceChildren(iframe);

  let bridge: XBlockOuterBridge;
  bridge = createXBlockOuterBridge({
    sessionId,
    expectedInnerOrigin: resolvedInnerUrl.origin,
    expectedInnerSource: iframe.contentWindow,
    innerWindow: {
      postMessage(message, targetOrigin) {
        iframe.contentWindow?.postMessage(message, targetOrigin);
      },
    },
    messageHost: {
      addMessageListener(listener) {
        window.addEventListener("message", listener);
      },
      removeMessageListener(listener) {
        window.removeEventListener("message", listener);
      },
    },
    initPayload,
    ...(onReady ? { onReady } : {}),
    onHeightChanged(height) {
      const nextHeight = Math.max(Math.ceil(minHeight), height);
      iframe.style.height = `${nextHeight}px`;
      onHeightChanged?.(nextHeight);
    },
    ...(onDirtyChanged ? { onDirtyChanged } : {}),
    ...(onFatalError ? { onFatalError } : {}),
    ...(onRequest
      ? {
          onRequest(request) {
            onRequest(request, bridge);
          },
        }
      : {}),
  });

  return {
    iframe,
    destroy() {
      bridge.destroy();
      iframe.remove();
    },
  };
}
