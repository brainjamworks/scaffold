export interface PresentationMonotonicClockPort {
  nowMs(): number;
  subscribe(listener: () => void): () => void;
}

export function createAnimationFramePresentationMonotonicClock(): PresentationMonotonicClockPort {
  return Object.freeze({
    nowMs: () => performance.now(),
    subscribe(listener: () => void) {
      let active = true;
      let frameId = requestAnimationFrame(onFrame);

      function onFrame(): void {
        if (!active) return;
        listener();
        if (active) frameId = requestAnimationFrame(onFrame);
      }

      return () => {
        if (!active) return;
        active = false;
        cancelAnimationFrame(frameId);
      };
    },
  });
}
