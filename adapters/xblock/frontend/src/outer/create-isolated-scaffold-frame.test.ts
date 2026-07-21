// @vitest-environment jsdom

import { describe, expect, it } from "vite-plus/test";

import { createXBlockBridgeLifecycleMessage } from "../bridge/protocol";
import { createIsolatedScaffoldFrame } from "./create-isolated-scaffold-frame";

describe("createIsolatedScaffoldFrame", () => {
  it("permits embedded learner content to enter fullscreen", () => {
    const container = document.createElement("div");
    document.body.append(container);

    const frame = createIsolatedScaffoldFrame({
      container,
      innerUrl: "https://scaffold.example/student-inner.html",
      sessionId: "session-fullscreen",
      initPayload: {},
      title: "Scaffold content",
    });

    expect(frame.iframe.allowFullscreen).toBe(true);
    expect(frame.iframe.getAttribute("allow")).toBe("fullscreen");

    frame.destroy();
  });

  it("preserves bridge-driven height without CSS overflow clipping", () => {
    const container = document.createElement("div");
    document.body.append(container);

    const frame = createIsolatedScaffoldFrame({
      container,
      innerUrl: "https://scaffold.example/student-inner.html",
      sessionId: "session-1",
      initPayload: {},
      title: "Scaffold content",
      minHeight: 0,
    });

    expect(frame.iframe.getAttribute("scrolling")).toBeNull();
    expect(frame.iframe.style.overflow).toBe("");
    expect(frame.iframe.style.minHeight).toBe("0px");
    expect(frame.iframe.style.height).toBe("0px");

    frame.destroy();
  });

  it("allows a zero-minimum learner frame to grow and then shrink", () => {
    const container = document.createElement("div");
    const heightChanges: number[] = [];
    document.body.append(container);

    const frame = createIsolatedScaffoldFrame({
      container,
      innerUrl: "https://scaffold.example/student-inner.html",
      sessionId: "session-resize",
      initPayload: {},
      title: "Scaffold content",
      minHeight: 0,
      onHeightChanged(height) {
        heightChanges.push(height);
      },
    });

    expect(frame.iframe.style.height).toBe("0px");
    dispatchInnerHeight(frame.iframe, 641.2);
    expect(frame.iframe.style.height).toBe("642px");
    dispatchInnerHeight(frame.iframe, 279.1);
    expect(frame.iframe.style.height).toBe("280px");
    expect(heightChanges).toEqual([642, 280]);

    frame.destroy();
  });
});

function dispatchInnerHeight(iframe: HTMLIFrameElement, height: number): void {
  window.dispatchEvent(
    new MessageEvent("message", {
      data: createXBlockBridgeLifecycleMessage({
        sessionId: "session-resize",
        type: "inner.heightChanged",
        payload: { height },
      }),
      origin: "https://scaffold.example",
      source: iframe.contentWindow,
    }),
  );
}
