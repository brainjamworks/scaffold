// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  createMoodleBridgeFailureResponse,
  createMoodleBridgeLifecycleMessage,
  createMoodleBridgeSuccessResponse,
} from "../bridge/protocol";
import { mountMoodleInner } from "./mount-inner-lifecycle";

const sessionId = "session-123";
const parentOrigin = window.location.origin;
const learnerConfig = {
  cmid: 42,
  scaffoldid: 7,
  surface: "learner" as const,
  wwwroot: parentOrigin,
  sesskey: "sesskey",
};
const authoringConfig = {
  ...learnerConfig,
  surface: "authoring" as const,
  returnUrl: `${parentOrigin}/mod/scaffold/view.php?id=42`,
};

let postMessage: ReturnType<typeof vi.spyOn>;
let resizeObservers: FakeResizeObserver[];

beforeEach(() => {
  history.replaceState(
    {},
    "",
    `/?sessionId=${sessionId}&parentOrigin=${encodeURIComponent(parentOrigin)}`,
  );
  postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => {});
  resizeObservers = [];
  vi.stubGlobal(
    "ResizeObserver",
    class extends FakeResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        super(callback);
        resizeObservers.push(this);
      }
    },
  );
});

afterEach(() => {
  delete window.ScaffoldMoodleAjax;
  document.documentElement.removeAttribute("data-scaffold-surface");
  document.body.replaceChildren();
  Reflect.deleteProperty(document, "fullscreenElement");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("mountMoodleInner", () => {
  it.each([
    ["missing session", `/?parentOrigin=${encodeURIComponent(parentOrigin)}`],
    ["missing origin", `/?sessionId=${sessionId}`],
    [
      "origin with a path",
      `/?sessionId=${sessionId}&parentOrigin=${encodeURIComponent(`${parentOrigin}/path`)}`,
    ],
    [
      "non-http origin",
      `/?sessionId=${sessionId}&parentOrigin=${encodeURIComponent("javascript:alert(1)")}`,
    ],
  ])("renders an accessible setup error for %s", (_label, url) => {
    history.replaceState({}, "", url);
    const root = createRoot();

    const lifecycle = mountMoodleInner({ root, mount: vi.fn() });

    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      "Scaffold could not be loaded",
    );
    expect(postMessage).not.toHaveBeenCalled();
    lifecycle.destroy();
  });

  it("sends ready and mounts exactly once after validated initialization", () => {
    const root = createRoot();
    const mount = vi.fn(() => {
      expect(window.ScaffoldMoodleAjax).toBeDefined();
    });
    const lifecycle = mountMoodleInner({ root, mount });

    expect(postMessage).toHaveBeenCalledWith(
      createMoodleBridgeLifecycleMessage({
        sessionId,
        messageType: "inner.ready",
        payload: {},
      }),
      parentOrigin,
    );

    dispatchInit(authoringConfig);
    dispatchInit(authoringConfig);

    expect(mount).toHaveBeenCalledTimes(1);
    expect(mount).toHaveBeenCalledWith(root, authoringConfig);
    expect(document.documentElement.dataset["scaffoldSurface"]).toBe("authoring");
    lifecycle.destroy();
  });

  it("rejects initialization from the wrong origin, source, or session", () => {
    const root = createRoot();
    const mount = vi.fn();
    const lifecycle = mountMoodleInner({ root, mount });

    dispatchInit(authoringConfig, { origin: "https://attacker.example" });
    dispatchInit(authoringConfig, { source: {} as MessageEventSource });
    dispatchInit(authoringConfig, { messageSessionId: "wrong-session" });

    expect(mount).not.toHaveBeenCalled();
    expect(window.ScaffoldMoodleAjax).toBeUndefined();
    lifecycle.destroy();
  });

  it("resolves and rejects AJAX calls through validated responses", async () => {
    const root = createRoot();
    const lifecycle = mountMoodleInner({ root, mount: vi.fn() });
    dispatchInit(learnerConfig);
    postMessage.mockClear();

    const success = window.ScaffoldMoodleAjax!.call("mod_scaffold_get_payload", {
      cmid: 42,
      purpose: "learner",
    });
    const request = postMessage.mock.calls[0]?.[0];
    expect(request).toMatchObject({
      kind: "request",
      messageType: "moodle.ajax",
      payload: {
        methodName: "mod_scaffold_get_payload",
        args: { cmid: 42, purpose: "learner" },
      },
    });
    dispatchResponse(
      createMoodleBridgeSuccessResponse({
        sessionId,
        requestId: request.requestId,
        result: { success: true },
      }),
    );
    await expect(success).resolves.toEqual({ success: true });

    const failure = window.ScaffoldMoodleAjax!.call("mod_scaffold_save_content", { cmid: 42 });
    const failedRequest = postMessage.mock.calls[1]?.[0];
    dispatchResponse(
      createMoodleBridgeFailureResponse({
        sessionId,
        requestId: failedRequest.requestId,
        message: "Permission denied",
      }),
    );
    await expect(failure).rejects.toThrow("Permission denied");

    await expect(window.ScaffoldMoodleAjax!.call("core_user_delete", {})).rejects.toThrow(
      "Unsupported Moodle AJAX method",
    );
    expect(postMessage).toHaveBeenCalledTimes(2);
    lifecycle.destroy();
  });

  it("renders and reports an accessible fatal mount error", () => {
    const root = createRoot();
    const lifecycle = mountMoodleInner({
      root,
      mount() {
        throw new Error("Core mount failed");
      },
    });

    dispatchInit(authoringConfig);

    expect(root.querySelector('[role="alert"]')?.textContent).toContain("Core mount failed");
    expect(postMessage).toHaveBeenLastCalledWith(
      createMoodleBridgeLifecycleMessage({
        sessionId,
        messageType: "inner.fatalError",
        payload: { message: "Core mount failed" },
      }),
      parentOrigin,
    );
    expect(window.ScaffoldMoodleAjax).toBeUndefined();
    lifecycle.destroy();
  });

  it("reports learner layout-root height changes without measuring overlays", () => {
    const root = createRoot();
    let rootHeight = 410.2;
    vi.spyOn(root, "getBoundingClientRect").mockImplementation(
      () => ({ height: rootHeight }) as DOMRect,
    );
    const lifecycle = mountMoodleInner({ root, mount: vi.fn() });

    dispatchInit(learnerConfig);

    expect(resizeObservers).toHaveLength(1);
    expect(resizeObservers[0]?.observed).toBe(root);
    expect(lastHeightMessage()).toMatchObject({ payload: { height: 411 } });

    rootHeight = 279.1;
    resizeObservers[0]?.trigger();
    expect(lastHeightMessage()).toMatchObject({ payload: { height: 280 } });

    const overlay = document.createElement("div");
    const overlayRect = vi
      .spyOn(overlay, "getBoundingClientRect")
      .mockReturnValue({ height: 1200 } as DOMRect);
    document.body.append(overlay);
    resizeObservers[0]?.trigger();
    expect(lastHeightMessage()).toMatchObject({ payload: { height: 280 } });
    expect(overlayRect).not.toHaveBeenCalled();

    lifecycle.destroy();
  });

  it("preserves and restores the inline learner height across fullscreen", () => {
    const root = createRoot();
    const fullscreenViewport = document.createElement("div");
    let rootHeight = 384;
    let fullscreenElement: Element | null = null;
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement,
    });
    vi.spyOn(root, "getBoundingClientRect").mockImplementation(
      () => ({ height: rootHeight }) as DOMRect,
    );
    const lifecycle = mountMoodleInner({ root, mount: vi.fn() });

    dispatchInit(learnerConfig);
    expect(lastHeightMessage()).toMatchObject({ payload: { height: 384 } });

    fullscreenElement = fullscreenViewport;
    rootHeight = 700;
    document.dispatchEvent(new Event("fullscreenchange"));
    resizeObservers[0]?.trigger();
    expect(lastHeightMessage()).toMatchObject({ payload: { height: 384 } });

    fullscreenElement = null;
    document.dispatchEvent(new Event("fullscreenchange"));
    expect(lastHeightMessage()).toMatchObject({ payload: { height: 384 } });

    rootHeight = 384;
    resizeObservers[0]?.trigger();
    expect(lastHeightMessage()).toMatchObject({ payload: { height: 384 } });

    lifecycle.destroy();
  });

  it("does not observe or report height for authoring", () => {
    const root = createRoot();
    vi.spyOn(root, "getBoundingClientRect").mockReturnValue({ height: 500 } as DOMRect);
    const lifecycle = mountMoodleInner({ root, mount: vi.fn() });

    dispatchInit(authoringConfig);

    expect(resizeObservers).toHaveLength(0);
    expect(
      postMessage.mock.calls.some(
        (call: unknown[]) =>
          (call[0] as { messageType?: string } | undefined)?.messageType === "inner.heightChanged",
      ),
    ).toBe(false);
    lifecycle.destroy();
  });

  it("cleans up listeners, pending requests, the bridge, observer, and mount", async () => {
    const root = createRoot();
    const unmount = vi.fn();
    const lifecycle = mountMoodleInner({ root, mount: vi.fn(() => unmount) });
    dispatchInit(learnerConfig);
    const pending = window.ScaffoldMoodleAjax!.call("mod_scaffold_get_payload", { cmid: 42 });

    lifecycle.destroy();

    await expect(pending).rejects.toThrow("destroyed");
    expect(resizeObservers[0]?.disconnected).toBe(true);
    expect(unmount).toHaveBeenCalledTimes(1);
    expect(window.ScaffoldMoodleAjax).toBeUndefined();
    dispatchInit(learnerConfig);
    expect(unmount).toHaveBeenCalledTimes(1);
  });
});

function createRoot(): HTMLDivElement {
  const root = document.createElement("div");
  root.id = "scaffold-moodle-inner-root";
  document.body.append(root);
  return root;
}

function dispatchInit(
  config: typeof learnerConfig | typeof authoringConfig,
  overrides: {
    origin?: string;
    source?: MessageEventSource | null;
    messageSessionId?: string;
  } = {},
): void {
  window.dispatchEvent(
    new MessageEvent("message", {
      data: createMoodleBridgeLifecycleMessage({
        sessionId: overrides.messageSessionId ?? sessionId,
        messageType: "outer.init",
        payload: { config },
      }),
      origin: overrides.origin ?? parentOrigin,
      source: overrides.source ?? window.parent,
    }),
  );
}

function dispatchResponse(data: unknown): void {
  window.dispatchEvent(
    new MessageEvent("message", {
      data,
      origin: parentOrigin,
      source: window.parent,
    }),
  );
}

function lastHeightMessage() {
  let last: { messageType?: string; payload?: unknown } | undefined;
  for (const call of postMessage.mock.calls as unknown[][]) {
    const message = call[0] as { messageType?: string; payload?: unknown } | undefined;
    if (message?.messageType === "inner.heightChanged") last = message;
  }
  return last;
}

class FakeResizeObserver {
  observed: Element | null = null;
  disconnected = false;

  constructor(private readonly callback: ResizeObserverCallback) {}

  observe(element: Element): void {
    this.observed = element;
  }

  disconnect(): void {
    this.disconnected = true;
  }

  trigger(): void {
    this.callback([], this as unknown as ResizeObserver);
  }
}
