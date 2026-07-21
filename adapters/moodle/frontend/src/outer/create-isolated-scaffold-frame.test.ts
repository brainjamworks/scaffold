// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createMoodleAjaxRequest, createMoodleBridgeLifecycleMessage } from "../bridge/protocol";
import { createIsolatedScaffoldFrame } from "./create-isolated-scaffold-frame";
import type { MoodleOuterBootstrapConfig } from "../types";

const authoringConfig: MoodleOuterBootstrapConfig = {
  cmid: 42,
  scaffoldid: 7,
  surface: "authoring",
  returnUrl: "https://moodle.example/mod/scaffold/view.php?id=42",
  bundleUrl: "https://moodle.example/mod/scaffold/public/moodle-ui.js",
  innerUrl: "https://moodle.example/mod/scaffold/public/moodle-inner.html",
  wwwroot: "https://moodle.example",
  sesskey: "sesskey",
};

const learnerConfig: MoodleOuterBootstrapConfig = {
  cmid: 42,
  scaffoldid: 7,
  surface: "learner",
  bundleUrl: "https://moodle.example/mod/scaffold/public/moodle-ui.js",
  innerUrl: "https://moodle.example/mod/scaffold/public/moodle-inner.html",
  wwwroot: "https://moodle.example",
  sesskey: "sesskey",
};

afterEach(() => {
  document.body.replaceChildren();
});

describe("createIsolatedScaffoldFrame", () => {
  it("replaces the container with one accurately configured frame", () => {
    const container = document.createElement("div");
    container.append(document.createElement("p"), document.createElement("iframe"));
    document.body.append(container);

    const author = createIsolatedScaffoldFrame({
      container,
      config: authoringConfig,
      callMoodle: vi.fn(),
    });

    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild).toBe(author.iframe);
    expect(author.iframe.title).toBe("Scaffold authoring");
    expect(author.iframe.loading).toBe("eager");
    expect(author.iframe.getAttribute("referrerpolicy")).toBe("same-origin");
    expect(author.iframe.getAttribute("allow")).toBe("fullscreen");
    expect(author.iframe.hasAttribute("allowfullscreen")).toBe(false);
    expect(author.iframe.dataset["surface"]).toBe("authoring");
    expect(author.iframe.style.height).toBe("100%");

    const url = new URL(author.iframe.src);
    expect([...url.searchParams.keys()].sort()).toEqual(["parentOrigin", "sessionId"]);
    expect(url.searchParams.get("parentOrigin")).toBe(window.location.origin);
    expect(url.searchParams.get("sessionId")).not.toBeNull();
    expect(url.search).not.toContain("sesskey");
    expect(url.search).not.toContain("cmid");

    author.destroy();
    expect(container.children).toHaveLength(0);
  });

  it("initializes only after a validated ready message and excludes asset URLs", () => {
    const { container, frame, sessionId, innerOrigin, postMessage } = createFrame(authoringConfig);

    dispatchLifecycle(frame.iframe, innerOrigin, sessionId, "inner.ready", {});

    expect(postMessage).toHaveBeenCalledTimes(1);
    const [message, targetOrigin] = postMessage.mock.calls[0] ?? [];
    expect(targetOrigin).toBe(innerOrigin);
    expect(message).toMatchObject({
      kind: "lifecycle",
      messageType: "outer.init",
      sessionId,
      payload: {
        config: {
          cmid: 42,
          scaffoldid: 7,
          surface: "authoring",
          returnUrl: authoringConfig.returnUrl,
        },
      },
    });
    expect(message.payload.config).not.toHaveProperty("bundleUrl");
    expect(message.payload.config).not.toHaveProperty("innerUrl");

    dispatchLifecycle(frame.iframe, innerOrigin, sessionId, "inner.ready", {});
    expect(postMessage).toHaveBeenCalledTimes(1);

    frame.destroy();
    expect(container.children).toHaveLength(0);
  });

  it("uses exact learner heights after the first valid report and ignores invalid events", () => {
    const { frame, sessionId, innerOrigin } = createFrame(learnerConfig);

    expect(frame.iframe.title).toBe("Scaffold activity content");
    expect(frame.iframe.dataset["surface"]).toBe("learner");
    expect(frame.iframe.style.height).toBe("384px");
    expect(frame.iframe.style.minHeight).toBe("384px");

    dispatchLifecycle(frame.iframe, innerOrigin, sessionId, "inner.heightChanged", {
      height: 641.2,
    });
    expect(frame.iframe.style.height).toBe("642px");
    expect(frame.iframe.style.minHeight).toBe("0px");

    dispatchLifecycle(frame.iframe, innerOrigin, sessionId, "inner.heightChanged", {
      height: 279.1,
    });
    expect(frame.iframe.style.height).toBe("280px");

    dispatchLifecycle(frame.iframe, "https://attacker.example", sessionId, "inner.heightChanged", {
      height: 900,
    });
    dispatchLifecycle(frame.iframe, innerOrigin, "wrong-session", "inner.heightChanged", {
      height: 900,
    });
    window.dispatchEvent(
      new MessageEvent("message", {
        data: createMoodleBridgeLifecycleMessage({
          sessionId,
          messageType: "inner.heightChanged",
          payload: { height: 900 },
        }),
        origin: innerOrigin,
        source: window,
      }),
    );
    expect(frame.iframe.style.height).toBe("280px");

    frame.destroy();
  });

  it("keeps authoring viewport-sized when height messages arrive", () => {
    const { frame, sessionId, innerOrigin } = createFrame(authoringConfig);

    dispatchLifecycle(frame.iframe, innerOrigin, sessionId, "inner.heightChanged", { height: 200 });

    expect(frame.iframe.style.height).toBe("100%");
    frame.destroy();
  });

  it("proxies allowlisted AJAX success and failure responses", async () => {
    const callMoodle = vi
      .fn()
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error("Permission denied"));
    const { frame, sessionId, innerOrigin, postMessage } = createFrame(learnerConfig, callMoodle);

    dispatchRequest(frame.iframe, innerOrigin, sessionId, "request-1");
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
    expect(callMoodle).toHaveBeenCalledWith("mod_scaffold_get_payload", {
      cmid: 42,
      purpose: "learner",
    });
    expect(postMessage.mock.calls[0]?.[0]).toMatchObject({
      kind: "response",
      requestId: "request-1",
      ok: true,
      result: { success: true },
    });

    dispatchRequest(frame.iframe, innerOrigin, sessionId, "request-2");
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledTimes(2));
    expect(postMessage.mock.calls[1]?.[0]).toMatchObject({
      kind: "response",
      requestId: "request-2",
      ok: false,
      error: { message: "Permission denied" },
    });

    frame.destroy();
  });

  it("shows fatal errors accessibly and removes listeners during cleanup", () => {
    const { container, frame, sessionId, innerOrigin } = createFrame(learnerConfig);

    dispatchLifecycle(frame.iframe, innerOrigin, sessionId, "inner.fatalError", {
      message: "Scaffold could not start",
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Scaffold could not start",
    );

    frame.destroy();
    expect(container.children).toHaveLength(0);
    dispatchLifecycle(frame.iframe, innerOrigin, sessionId, "inner.fatalError", {
      message: "Should be ignored",
    });
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});

function createFrame(config: MoodleOuterBootstrapConfig, callMoodle = vi.fn()) {
  const container = document.createElement("div");
  document.body.append(container);
  const frame = createIsolatedScaffoldFrame({ container, config, callMoodle });
  const url = new URL(frame.iframe.src);
  const sessionId = url.searchParams.get("sessionId") ?? "";
  const postMessage = vi.spyOn(frame.iframe.contentWindow!, "postMessage");
  return { container, frame, sessionId, innerOrigin: url.origin, postMessage };
}

function dispatchLifecycle(
  iframe: HTMLIFrameElement,
  origin: string,
  sessionId: string,
  messageType: "inner.ready" | "inner.heightChanged" | "inner.fatalError",
  payload: Record<string, unknown>,
): void {
  window.dispatchEvent(
    new MessageEvent("message", {
      data: createMoodleBridgeLifecycleMessage({ sessionId, messageType, payload } as never),
      origin,
      source: iframe.contentWindow,
    }),
  );
}

function dispatchRequest(
  iframe: HTMLIFrameElement,
  origin: string,
  sessionId: string,
  requestId: string,
): void {
  window.dispatchEvent(
    new MessageEvent("message", {
      data: createMoodleAjaxRequest({
        sessionId,
        requestId,
        methodName: "mod_scaffold_get_payload",
        args: { cmid: 42, purpose: "learner" },
      }),
      origin,
      source: iframe.contentWindow,
    }),
  );
}
