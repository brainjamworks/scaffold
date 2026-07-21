// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { resolveVisibleAuthoringAnchorRect } from "./authoring-anchor-visibility";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("resolveVisibleAuthoringAnchorRect", () => {
  it("returns the anchor rect when it is visible inside the editor root", () => {
    const root = document.createElement("div");
    const anchor = document.createElement("div");
    root.append(anchor);
    document.body.append(root);
    const anchorRect = rect({ bottom: 90, left: 20, right: 120, top: 10 });

    mockRect(root, rect({ bottom: 300, left: 0, right: 300, top: 0 }));
    mockRect(anchor, anchorRect);

    expect(resolveVisibleAuthoringAnchorRect(anchor, { root })).toBe(anchorRect);
  });

  it("returns null when the editor root clips the anchor", () => {
    const root = document.createElement("div");
    const anchor = document.createElement("div");
    root.append(anchor);
    document.body.append(root);

    mockRect(root, rect({ bottom: 100, left: 0, right: 100, top: 0 }));
    mockRect(anchor, rect({ bottom: 80, left: 120, right: 220, top: 10 }));

    expect(resolveVisibleAuthoringAnchorRect(anchor, { root })).toBeNull();
  });

  it("returns the visible rect when the editor root partially clips the anchor", () => {
    const root = document.createElement("div");
    const anchor = document.createElement("div");
    root.append(anchor);
    document.body.append(root);

    mockRect(root, rect({ bottom: 100, left: 0, right: 100, top: 0 }));
    mockRect(anchor, rect({ bottom: 90, left: 60, right: 160, top: 10 }));

    const visible = resolveVisibleAuthoringAnchorRect(anchor, { root });

    expect(visible).toMatchObject({
      bottom: 90,
      height: 80,
      left: 60,
      right: 100,
      top: 10,
      width: 40,
    });
  });

  it("returns null when a clipping ancestor hides the anchor", () => {
    const root = document.createElement("div");
    const clipper = document.createElement("div");
    const anchor = document.createElement("div");
    clipper.style.overflow = "hidden";
    clipper.append(anchor);
    root.append(clipper);
    document.body.append(root);

    mockRect(root, rect({ bottom: 300, left: 0, right: 300, top: 0 }));
    mockRect(clipper, rect({ bottom: 100, left: 0, right: 100, top: 0 }));
    mockRect(anchor, rect({ bottom: 80, left: 120, right: 220, top: 10 }));

    expect(resolveVisibleAuthoringAnchorRect(anchor, { root })).toBeNull();
  });
});

function mockRect(element: Element, value: DOMRectReadOnly): void {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(value);
}

function rect(input: {
  bottom: number;
  left: number;
  right: number;
  top: number;
}): DOMRectReadOnly {
  return {
    bottom: input.bottom,
    height: input.bottom - input.top,
    left: input.left,
    right: input.right,
    toJSON: () => input,
    top: input.top,
    width: input.right - input.left,
    x: input.left,
    y: input.top,
  };
}
