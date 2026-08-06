// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vite-plus/test";

import type { CoordinateInvalidationReason } from "../model/coordinate-space";
import type { FrameScheduler } from "./frame-coalescer";
import { observeInteractionGeometry } from "./observe-interaction-geometry";

let restoreResizeObserver: (() => void) | null = null;

afterEach(() => {
  restoreResizeObserver?.();
  restoreResizeObserver = null;
  document.body.innerHTML = "";
});

describe("observeInteractionGeometry", () => {
  it("coalesces resize, scroll, and environment invalidation into one frame read", () => {
    const scheduler = controlledScheduler();
    const resize = installResizeObserver();
    restoreResizeObserver = resize.restore;
    const endpoint = document.createElement("div");
    document.body.append(endpoint);
    const environmentListeners = new Set<(reason: CoordinateInvalidationReason) => void>();
    let reads = 0;

    const stop = observeInteractionGeometry({
      coordinateSpace: {
        subscribe: (listener) => {
          environmentListeners.add(listener);
          return () => {
            environmentListeners.delete(listener);
          };
        },
      },
      frameScheduler: scheduler.api,
      getElements: () => [endpoint],
      onMeasure: () => {
        reads += 1;
      },
      ownerDocument: document,
    });

    expect(scheduler.pending()).toBe(1);
    scheduler.flush();
    expect(reads).toBe(1);
    expect(resize.observed()).toEqual([endpoint]);

    resize.notify();
    document.dispatchEvent(new Event("scroll"));
    for (const listener of environmentListeners) listener("transform");
    expect(scheduler.pending()).toBe(1);
    scheduler.flush();
    expect(reads).toBe(2);

    stop();
    expect(resize.disconnected()).toBe(true);
    expect(environmentListeners.size).toBe(0);
  });

  it("remeasures root replacement and disconnection without retaining a stale revision", async () => {
    const scheduler = controlledScheduler();
    const resize = installResizeObserver();
    restoreResizeObserver = resize.restore;
    let endpoint = document.createElement("div");
    document.body.append(endpoint);
    const connectedStates: boolean[] = [];

    const stop = observeInteractionGeometry({
      frameScheduler: scheduler.api,
      getElements: () => [endpoint],
      onMeasure: () => connectedStates.push(endpoint.isConnected),
      ownerDocument: document,
    });
    scheduler.flush();

    const replacement = document.createElement("div");
    endpoint.replaceWith(replacement);
    endpoint = replacement;
    await Promise.resolve();
    expect(scheduler.pending()).toBe(1);
    scheduler.flush();
    expect(resize.observed()).toEqual([replacement]);

    endpoint.remove();
    await Promise.resolve();
    scheduler.flush();
    expect(connectedStates).toEqual([true, true, false]);
    stop();
  });

  it("ignores mutations outside the geometry root while observing ancestor transforms", async () => {
    const scheduler = controlledScheduler();
    const ancestor = document.createElement("section");
    const root = document.createElement("div");
    const endpoint = document.createElement("div");
    const unrelated = document.createElement("aside");
    root.append(endpoint);
    ancestor.append(root);
    document.body.append(ancestor, unrelated);
    let reads = 0;

    const stop = observeInteractionGeometry({
      frameScheduler: scheduler.api,
      getElements: () => [root, endpoint],
      onMeasure: () => {
        reads += 1;
      },
      ownerDocument: document,
    });
    scheduler.flush();
    expect(reads).toBe(1);

    unrelated.append(document.createElement("span"));
    unrelated.className = "unrelated-change";
    await Promise.resolve();
    expect(scheduler.pending()).toBe(0);

    ancestor.style.transform = "matrix(0.8, 0, 0, 0.8, 0, 0)";
    await Promise.resolve();
    expect(scheduler.pending()).toBe(1);
    scheduler.flush();
    expect(reads).toBe(2);
    stop();
  });
});

function controlledScheduler() {
  let nextId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  const api: FrameScheduler = {
    requestFrame(callback) {
      const id = nextId;
      nextId += 1;
      callbacks.set(id, callback);
      return id;
    },
    cancelFrame(id) {
      callbacks.delete(id);
    },
  };
  return {
    api,
    flush() {
      const pending = [...callbacks.values()];
      callbacks.clear();
      pending.forEach((callback) => callback(0));
    },
    pending: () => callbacks.size,
  };
}

function installResizeObserver() {
  const original = Object.getOwnPropertyDescriptor(window, "ResizeObserver");
  let callback: ResizeObserverCallback | null = null;
  let elements: Element[] = [];
  let didDisconnect = false;
  class ControlledResizeObserver {
    constructor(nextCallback: ResizeObserverCallback) {
      callback = nextCallback;
    }
    observe(element: Element) {
      elements.push(element);
    }
    unobserve(element: Element) {
      elements = elements.filter((current) => current !== element);
    }
    disconnect() {
      elements = [];
      didDisconnect = true;
    }
  }
  Object.defineProperty(window, "ResizeObserver", {
    configurable: true,
    value: ControlledResizeObserver,
  });
  return {
    disconnected: () => didDisconnect,
    notify: () => callback?.([], {} as ResizeObserver),
    observed: () => [...elements],
    restore: () => {
      if (original) Object.defineProperty(window, "ResizeObserver", original);
      else delete (window as Window & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    },
  };
}
