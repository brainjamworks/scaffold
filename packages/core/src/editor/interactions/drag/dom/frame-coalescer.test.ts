import { describe, expect, it, vi } from "vite-plus/test";

import { createFrameCoalescer, type FrameScheduler } from "./frame-coalescer";

describe("createFrameCoalescer", () => {
  it("runs many requests in one animation-frame callback", () => {
    const scheduler = createControlledFrameScheduler();
    const callback = vi.fn();
    const coalescer = createFrameCoalescer(callback, scheduler.api);

    coalescer.request();
    coalescer.request();
    coalescer.request();

    expect(scheduler.pending()).toBe(1);
    scheduler.flush();
    expect(callback).toHaveBeenCalledOnce();

    coalescer.request();
    scheduler.flush();
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it("cancels pending work and remains inert after disposal", () => {
    const scheduler = createControlledFrameScheduler();
    const callback = vi.fn();
    const coalescer = createFrameCoalescer(callback, scheduler.api);

    coalescer.request();
    coalescer.cancel();
    scheduler.flush();
    coalescer.request();
    coalescer.dispose();
    scheduler.flush();
    coalescer.request();

    expect(callback).not.toHaveBeenCalled();
    expect(scheduler.pending()).toBe(0);
  });
});

export function createControlledFrameScheduler() {
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
