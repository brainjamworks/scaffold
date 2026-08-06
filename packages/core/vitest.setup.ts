import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vite-plus/test";

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

if (typeof document !== "undefined" && !document.getAnimations) {
  Object.defineProperty(document, "getAnimations", {
    configurable: true,
    value: () => [],
  });
}
if (typeof Element !== "undefined" && !Element.prototype.getAnimations) {
  Element.prototype.getAnimations = () => [];
}

afterEach(cleanup);
