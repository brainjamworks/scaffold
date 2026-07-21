// @vitest-environment happy-dom

import { describe, expect, it } from "vite-plus/test";

import { resolveAuthoringPresentationScale, resolveParentWidth } from "./frame-sizing";

describe("frame sizing under authoring presentation scale", () => {
  it("uses intrinsic layout widths instead of scaled visual rects", () => {
    const scaleRoot = document.createElement("div");
    scaleRoot.setAttribute("data-authoring-slide-scale", "0.5");
    const container = document.createElement("div");
    scaleRoot.append(container);

    Object.defineProperty(container, "offsetWidth", { configurable: true, value: 400 });
    container.getBoundingClientRect = () => DOMRect.fromRect({ width: 200, height: 100 });

    expect(resolveAuthoringPresentationScale(container)).toBe(0.5);
    expect(resolveParentWidth(container, 200)).toBe(400);
  });
});
