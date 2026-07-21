import {
  MOODLE_AJAX_METHODS,
  createMoodleAjaxRequest,
  createMoodleBridgeLifecycleMessage,
  validateMoodleBridgeEvent,
  type MoodleBridgeResponse,
} from "../bridge/protocol";
import type { MoodleApplicationConfig } from "../types";

interface MoodleInnerLifecycle {
  destroy(): void;
}

export function mountMoodleInner({
  root,
  mount,
}: {
  root: HTMLElement;
  mount: (root: HTMLElement, config: MoodleApplicationConfig) => void | (() => void);
}): MoodleInnerLifecycle {
  const bridgeParams = readBridgeParams();
  if (!bridgeParams) {
    renderFatalError(root, "Scaffold iframe is missing valid bridge parameters.");
    return { destroy() {} };
  }

  const { sessionId, parentOrigin } = bridgeParams;
  const parentWindow = window.parent;
  let destroyed = false;
  let initialized = false;
  let resizeObserver: ResizeObserver | null = null;
  let unmount: (() => void) | null = null;
  let lastHeight: number | null = null;
  const pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (reason: unknown) => void }
  >();

  const postToParent = (message: unknown) => {
    if (!destroyed) parentWindow.postMessage(message, parentOrigin);
  };

  const ajaxBridge = {
    call<T>(methodName: string, args: Record<string, unknown>): Promise<T> {
      if (destroyed) return Promise.reject(new Error("Moodle bridge is destroyed."));
      const allowedMethod = MOODLE_AJAX_METHODS.find((method) => method === methodName);
      if (!allowedMethod) {
        return Promise.reject(new Error(`Unsupported Moodle AJAX method: ${methodName}`));
      }

      const requestId = crypto.randomUUID();
      const message = createMoodleAjaxRequest({
        sessionId,
        requestId,
        methodName: allowedMethod,
        args,
      });
      return new Promise<T>((resolve, reject) => {
        pending.set(requestId, {
          resolve(value) {
            resolve(value as T);
          },
          reject,
        });
        postToParent(message);
      });
    },
  };

  const reportLearnerHeight = () => {
    if (document.fullscreenElement) return;
    const height = Math.max(0, Math.ceil(root.getBoundingClientRect().height));
    if (height === lastHeight) return;
    lastHeight = height;
    postToParent(
      createMoodleBridgeLifecycleMessage({
        sessionId,
        messageType: "inner.heightChanged",
        payload: { height },
      }),
    );
  };

  const restoreInlineLearnerHeight = () => {
    if (document.fullscreenElement || lastHeight === null) return;
    postToParent(
      createMoodleBridgeLifecycleMessage({
        sessionId,
        messageType: "inner.heightChanged",
        payload: { height: lastHeight },
      }),
    );
  };

  const failMount = (error: unknown) => {
    const message = error instanceof Error ? error.message : "Scaffold could not be mounted.";
    if (window.ScaffoldMoodleAjax === ajaxBridge) delete window.ScaffoldMoodleAjax;
    renderFatalError(root, message);
    postToParent(
      createMoodleBridgeLifecycleMessage({
        sessionId,
        messageType: "inner.fatalError",
        payload: { message },
      }),
    );
  };

  const handleInit = (config: MoodleApplicationConfig) => {
    if (initialized) return;
    initialized = true;
    document.documentElement.dataset["scaffoldSurface"] = config.surface;
    window.ScaffoldMoodleAjax = ajaxBridge;
    root.replaceChildren();

    try {
      unmount = mount(root, config) ?? null;
    } catch (error) {
      failMount(error);
      return;
    }

    if (config.surface === "learner") {
      resizeObserver = new ResizeObserver(reportLearnerHeight);
      resizeObserver.observe(root);
      document.addEventListener("fullscreenchange", restoreInlineLearnerHeight);
      reportLearnerHeight();
    }
  };

  const handleResponse = (message: MoodleBridgeResponse) => {
    const request = pending.get(message.requestId);
    if (!request) return;
    pending.delete(message.requestId);
    if (message.ok) {
      request.resolve(message.result);
    } else {
      request.reject(new Error(message.error.message));
    }
  };

  const onMessage = (event: MessageEvent) => {
    const result = validateMoodleBridgeEvent(event, {
      expectedOrigin: parentOrigin,
      expectedSource: parentWindow,
      expectedSessionId: sessionId,
    });
    if (!result.ok) return;
    if (result.message.kind === "response") {
      handleResponse(result.message);
      return;
    }
    if (result.message.kind === "lifecycle" && result.message.messageType === "outer.init") {
      handleInit(result.message.payload.config);
    }
  };

  window.addEventListener("message", onMessage);
  postToParent(
    createMoodleBridgeLifecycleMessage({
      sessionId,
      messageType: "inner.ready",
      payload: {},
    }),
  );

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      window.removeEventListener("message", onMessage);
      document.removeEventListener("fullscreenchange", restoreInlineLearnerHeight);
      resizeObserver?.disconnect();
      unmount?.();
      if (window.ScaffoldMoodleAjax === ajaxBridge) delete window.ScaffoldMoodleAjax;
      for (const request of pending.values()) {
        request.reject(new Error("Moodle bridge was destroyed before the request completed."));
      }
      pending.clear();
    },
  };
}

function readBridgeParams(): { sessionId: string; parentOrigin: string } | null {
  const params = new URL(window.location.href).searchParams;
  const sessionId = params.get("sessionId");
  const parentOrigin = params.get("parentOrigin");
  if (!sessionId?.trim() || !parentOrigin) return null;

  try {
    const parsedOrigin = new URL(parentOrigin);
    if (
      (parsedOrigin.protocol !== "http:" && parsedOrigin.protocol !== "https:") ||
      parsedOrigin.origin !== parentOrigin
    ) {
      return null;
    }
  } catch {
    return null;
  }

  return { sessionId, parentOrigin };
}

function renderFatalError(root: HTMLElement, message: string): void {
  root.replaceChildren();
  const alert = document.createElement("div");
  alert.className = "sc-moodle-root sc-moodle-error";
  alert.setAttribute("role", "alert");

  const title = document.createElement("strong");
  title.textContent = "Scaffold could not be loaded.";
  const details = document.createElement("span");
  details.textContent = message;
  alert.append(title, details);
  root.append(alert);
}
