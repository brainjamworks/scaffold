import {
  createMoodleBridgeFailureResponse,
  createMoodleBridgeLifecycleMessage,
  createMoodleBridgeSuccessResponse,
  validateMoodleBridgeEvent,
  type MoodleAjaxRequest,
} from "../bridge/protocol";
import type { MoodleApplicationConfig, MoodleOuterBootstrapConfig } from "../types";

export type MoodleCall = (methodName: string, args: Record<string, unknown>) => Promise<unknown>;

export interface IsolatedScaffoldFrame {
  iframe: HTMLIFrameElement;
  destroy(): void;
}

export function createIsolatedScaffoldFrame({
  container,
  config,
  callMoodle,
}: {
  container: HTMLElement;
  config: MoodleOuterBootstrapConfig;
  callMoodle: MoodleCall;
}): IsolatedScaffoldFrame {
  const sessionId = crypto.randomUUID();
  const innerUrl = new URL(config.innerUrl, window.location.href);
  innerUrl.searchParams.set("sessionId", sessionId);
  innerUrl.searchParams.set("parentOrigin", window.location.origin);

  const iframe = document.createElement("iframe");
  iframe.src = innerUrl.href;
  iframe.title =
    config.surface === "authoring" ? "Scaffold authoring" : "Scaffold activity content";
  iframe.className = "sc-moodle-isolated-frame";
  iframe.dataset["surface"] = config.surface;
  iframe.loading = "eager";
  iframe.setAttribute("allow", "fullscreen");
  iframe.setAttribute("referrerpolicy", "same-origin");
  iframe.style.border = "0";
  iframe.style.display = "block";
  iframe.style.width = "100%";

  if (config.surface === "authoring") {
    iframe.style.height = "100%";
  } else {
    iframe.style.height = "384px";
    iframe.style.minHeight = "384px";
  }

  container.replaceChildren(iframe);

  const applicationConfig = toApplicationConfig(config);
  let initialized = false;
  let errorElement: HTMLDivElement | null = null;

  const postToInner = (message: unknown) => {
    iframe.contentWindow?.postMessage(message, innerUrl.origin);
  };

  const showError = (message: string) => {
    errorElement?.remove();
    errorElement = document.createElement("div");
    errorElement.className = "sc-moodle-frame-error";
    errorElement.setAttribute("role", "alert");
    errorElement.textContent = message;
    container.append(errorElement);
  };

  const handleAjaxRequest = async (request: MoodleAjaxRequest) => {
    try {
      const result = await callMoodle(request.payload.methodName, request.payload.args);
      postToInner(
        createMoodleBridgeSuccessResponse({
          sessionId,
          requestId: request.requestId,
          result,
        }),
      );
    } catch (error) {
      postToInner(
        createMoodleBridgeFailureResponse({
          sessionId,
          requestId: request.requestId,
          message: error instanceof Error ? error.message : "Moodle call failed",
        }),
      );
    }
  };

  const onMessage = (event: MessageEvent) => {
    const result = validateMoodleBridgeEvent(event, {
      expectedOrigin: innerUrl.origin,
      expectedSource: iframe.contentWindow,
      expectedSessionId: sessionId,
    });
    if (!result.ok) return;

    const message = result.message;
    if (message.kind === "request") {
      void handleAjaxRequest(message);
      return;
    }
    if (message.kind !== "lifecycle") return;

    if (message.messageType === "inner.ready" && !initialized) {
      initialized = true;
      postToInner(
        createMoodleBridgeLifecycleMessage({
          sessionId,
          messageType: "outer.init",
          payload: { config: applicationConfig },
        }),
      );
      return;
    }
    if (message.messageType === "inner.heightChanged" && config.surface === "learner") {
      iframe.style.minHeight = "0px";
      iframe.style.height = `${Math.ceil(message.payload.height)}px`;
      return;
    }
    if (message.messageType === "inner.fatalError") {
      showError(message.payload.message);
    }
  };

  window.addEventListener("message", onMessage);

  return {
    iframe,
    destroy() {
      window.removeEventListener("message", onMessage);
      errorElement?.remove();
      iframe.remove();
    },
  };
}

function toApplicationConfig(config: MoodleOuterBootstrapConfig): MoodleApplicationConfig {
  const common = {
    cmid: config.cmid,
    scaffoldid: config.scaffoldid,
    wwwroot: config.wwwroot,
    sesskey: config.sesskey,
  };
  if (config.surface === "authoring") {
    return { ...common, surface: "authoring", returnUrl: config.returnUrl };
  }
  return { ...common, surface: "learner" };
}
