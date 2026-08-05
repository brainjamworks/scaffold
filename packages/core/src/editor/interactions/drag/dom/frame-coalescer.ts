export interface FrameScheduler {
  requestFrame(callback: FrameRequestCallback): number;
  cancelFrame(id: number): void;
}

export interface FrameCoalescer {
  request(): void;
  cancel(): void;
  dispose(): void;
}

export function createWindowFrameScheduler(ownerWindow: Window): FrameScheduler {
  return {
    requestFrame: ownerWindow.requestAnimationFrame.bind(ownerWindow),
    cancelFrame: ownerWindow.cancelAnimationFrame.bind(ownerWindow),
  };
}

export function createFrameCoalescer(
  callback: () => void,
  scheduler: FrameScheduler,
): FrameCoalescer {
  let frameId: number | null = null;
  let disposed = false;

  const cancel = () => {
    if (frameId === null) return;
    scheduler.cancelFrame(frameId);
    frameId = null;
  };

  return {
    request() {
      if (disposed || frameId !== null) return;
      frameId = scheduler.requestFrame(() => {
        frameId = null;
        if (!disposed) callback();
      });
    },
    cancel,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancel();
    },
  };
}
