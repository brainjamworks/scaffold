// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vite-plus/test";

import type { FrameScheduler } from "./frame-coalescer";
import {
  createScaledCanvasCoordinateSpace,
  createViewportCoordinateSpace,
} from "./dom-coordinate-space";

describe("DOM coordinate spaces", () => {
  it("measures a live scaled root once and accepts the slideshow's computed 2D matrix", () => {
    const root = connectedRoot({ left: 120, top: 80, width: 512, height: 288 });
    root.style.transform = "matrix(0.5, 0, 0, 0.5, 0, 0)";
    const coordinateSpace = createScaledCanvasCoordinateSpace({
      getRoot: () => root,
      ownerDocument: document,
      localSize: { width: 1024, height: 576 },
    });

    const snapshot = coordinateSpace.measure();

    expect(root.getBoundingClientRect).toHaveBeenCalledOnce();
    expect(snapshot).toMatchObject({ kind: "scaled-canvas", scaleX: 0.5, scaleY: 0.5 });
    expect(snapshot?.clientPointToLocal({ space: "client", x: 376, y: 224 })).toEqual({
      space: "local",
      x: 512,
      y: 288,
    });
  });

  it("uses current viewport offsets and advances revision after coalesced invalidation", () => {
    const scheduler = createControlledFrameScheduler();
    let rect = { left: 10, top: 20, width: 600, height: 400 };
    const root = connectedRoot(rect);
    vi.mocked(root.getBoundingClientRect).mockImplementation(() => domRect(rect));
    const reasons: string[] = [];
    const coordinateSpace = createViewportCoordinateSpace({
      getRoot: () => root,
      ownerDocument: document,
      frameScheduler: scheduler.api,
    });
    const unsubscribe = coordinateSpace.subscribe((reason) => reasons.push(reason));

    const before = coordinateSpace.measure();
    rect = { ...rect, left: -30, top: -50 };
    document.dispatchEvent(new Event("scroll"));
    document.dispatchEvent(new Event("scroll"));
    expect(scheduler.pending()).toBe(1);
    scheduler.flush();
    const after = coordinateSpace.measure();

    expect(reasons).toEqual(["scroll"]);
    expect(after?.revision).toBe((before?.revision ?? -1) + 1);
    expect(after?.clientRect).toMatchObject({ left: -30, top: -50 });
    unsubscribe();
  });

  it("supports independent axis scale plus translation", () => {
    const root = connectedRoot({ left: 40, top: 30, width: 512, height: 432 });
    root.style.transform = "matrix(0.5, 0, 0, 0.75, 20, 10)";
    const snapshot = createScaledCanvasCoordinateSpace({
      getRoot: () => root,
      ownerDocument: document,
      localSize: { width: 1024, height: 576 },
    }).measure();

    expect(snapshot).toMatchObject({ scaleX: 0.5, scaleY: 0.75 });
    expect(snapshot?.clientDeltaToLocal({ space: "client-delta", x: 25, y: 30 })).toEqual({
      space: "local-delta",
      x: 50,
      y: 40,
    });
  });

  it("coalesces resize and fullscreen signals into one frame while preserving reasons", () => {
    const scheduler = createControlledFrameScheduler();
    const root = connectedRoot({ left: 0, top: 0, width: 100, height: 80 });
    const reasons: string[] = [];
    const coordinateSpace = createViewportCoordinateSpace({
      getRoot: () => root,
      ownerDocument: document,
      frameScheduler: scheduler.api,
    });
    const unsubscribe = coordinateSpace.subscribe((reason) => reasons.push(reason));

    window.dispatchEvent(new Event("resize"));
    document.dispatchEvent(new Event("fullscreenchange"));

    expect(scheduler.pending()).toBe(1);
    scheduler.flush();
    expect(reasons).toEqual(["resize", "fullscreen"]);
    unsubscribe();
  });

  it("detects root replacement without retaining the first element", () => {
    const scheduler = createControlledFrameScheduler();
    let root = connectedRoot({ left: 0, top: 0, width: 100, height: 80 });
    const reasons: string[] = [];
    const coordinateSpace = createViewportCoordinateSpace({
      getRoot: () => root,
      ownerDocument: document,
      frameScheduler: scheduler.api,
    });
    const unsubscribe = coordinateSpace.subscribe((reason) => reasons.push(reason));
    const replacement = connectedRoot({ left: 200, top: 100, width: 300, height: 200 });
    root = replacement;

    document.dispatchEvent(new Event("scroll"));
    scheduler.flush();

    expect(reasons).toEqual(["root-replaced"]);
    expect(coordinateSpace.measure()?.clientRect).toMatchObject({ left: 200, top: 100 });
    unsubscribe();
  });

  it("fails closed for disconnected, cross-document, zero-sized, and invalid-transform roots", () => {
    const disconnected = document.createElement("div");
    vi.spyOn(disconnected, "getBoundingClientRect").mockReturnValue(
      domRect({ left: 0, top: 0, width: 100, height: 100 }),
    );
    expect(
      createViewportCoordinateSpace({
        getRoot: () => disconnected,
        ownerDocument: document,
      }).measure(),
    ).toBeNull();

    const foreignDocument = document.implementation.createHTMLDocument("foreign");
    const foreignRoot = foreignDocument.createElement("div");
    foreignDocument.body.append(foreignRoot);
    expect(
      createViewportCoordinateSpace({
        getRoot: () => foreignRoot,
        ownerDocument: document,
      }).measure(),
    ).toBeNull();

    for (const { rect, transform } of [
      { rect: { left: 0, top: 0, width: 0, height: 100 }, transform: "none" },
      {
        rect: { left: 0, top: 0, width: 100, height: 100 },
        transform: "matrix(1, 0.2, 0, 1, 0, 0)",
      },
      {
        rect: { left: 0, top: 0, width: 100, height: 100 },
        transform: "matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)",
      },
    ]) {
      const root = connectedRoot(rect);
      root.style.transform = transform;
      expect(
        createScaledCanvasCoordinateSpace({
          getRoot: () => root,
          ownerDocument: document,
          localSize: { width: 100, height: 100 },
        }).measure(),
      ).toBeNull();
    }
  });
});

function connectedRoot(rect: { left: number; top: number; width: number; height: number }) {
  const root = document.createElement("div");
  document.body.append(root);
  vi.spyOn(root, "getBoundingClientRect").mockReturnValue(domRect(rect));
  return root;
}

function domRect(rect: { left: number; top: number; width: number; height: number }): DOMRect {
  return {
    ...rect,
    bottom: rect.top + rect.height,
    right: rect.left + rect.width,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  };
}

function createControlledFrameScheduler() {
  let nextId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  const api: FrameScheduler = {
    requestFrame(callback) {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    },
    cancelFrame(id) {
      callbacks.delete(id);
    },
  };

  return {
    api,
    pending: () => callbacks.size,
    flush: () => {
      const pending = [...callbacks.values()];
      callbacks.clear();
      for (const callback of pending) callback(0);
    },
  };
}
