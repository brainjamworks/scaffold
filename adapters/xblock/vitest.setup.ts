if (typeof globalThis.ResizeObserver === "undefined") {
  class VitestResizeObserver implements ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    writable: true,
    value: VitestResizeObserver,
  });
}
