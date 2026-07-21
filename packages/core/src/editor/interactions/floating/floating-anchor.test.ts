// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  createElementFloatingAnchor,
  createVirtualFloatingAnchor,
  resolveFloatingAnchorSnapshot,
} from "./floating-anchor";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("resolveFloatingAnchorSnapshot", () => {
  it("returns the raw element rect for a visible element anchor", () => {
    const root = document.createElement("div");
    const anchorElement = document.createElement("button");
    root.append(anchorElement);
    document.body.append(root);
    const anchorRect = rect({ bottom: 90, left: 20, right: 120, top: 10 });

    mockRect(root, rect({ bottom: 300, left: 0, right: 300, top: 0 }));
    mockRect(anchorElement, anchorRect);

    const snapshot = resolveFloatingAnchorSnapshot(
      createElementFloatingAnchor(anchorElement, { root }),
    );

    expect(snapshot?.rect).toBe(anchorRect);
  });

  it("returns the raw virtual rect for a virtual anchor", () => {
    const anchorRect = rect({ bottom: 100, left: 40, right: 140, top: 60 });

    const snapshot = resolveFloatingAnchorSnapshot(
      createVirtualFloatingAnchor({
        getBoundingClientRect: () => anchorRect,
      }),
    );

    expect(snapshot?.rect).toBe(anchorRect);
  });

  it("clips virtual anchor visibility against the supplied root", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const anchorRect = rect({ bottom: 80, left: 120, right: 220, top: 10 });

    mockRect(root, rect({ bottom: 100, left: 0, right: 100, top: 0 }));

    const snapshot = resolveFloatingAnchorSnapshot(
      createVirtualFloatingAnchor({
        getBoundingClientRect: () => anchorRect,
        root,
      }),
    );

    expect(snapshot).toBeNull();
  });

  it("keeps a live virtual reference instead of freezing the initial rect", () => {
    const firstRect = rect({ bottom: 100, left: 40, right: 140, top: 60 });
    const nextRect = rect({ bottom: 120, left: 60, right: 160, top: 80 });
    let currentRect = firstRect;

    const snapshot = resolveFloatingAnchorSnapshot(
      createVirtualFloatingAnchor({
        getBoundingClientRect: () => currentRect,
      }),
    );
    currentRect = nextRect;

    expect(snapshot?.reference.getBoundingClientRect()).toBe(nextRect);
  });

  it("returns null for a detached element anchor", () => {
    const anchorElement = document.createElement("button");
    mockRect(anchorElement, rect({ bottom: 90, left: 20, right: 120, top: 10 }));

    const snapshot = resolveFloatingAnchorSnapshot(createElementFloatingAnchor(anchorElement));

    expect(snapshot).toBeNull();
  });

  it("keeps the raw element rect when the visibility gate clips the anchor partially", () => {
    const root = document.createElement("div");
    const anchorElement = document.createElement("button");
    root.append(anchorElement);
    document.body.append(root);
    const rawRect = rect({ bottom: 80, left: 60, right: 160, top: 10 });

    mockRect(root, rect({ bottom: 100, left: 0, right: 100, top: 0 }));
    mockRect(anchorElement, rawRect);

    const snapshot = resolveFloatingAnchorSnapshot(
      createElementFloatingAnchor(anchorElement, { root }),
    );

    expect(snapshot?.rect).toBe(rawRect);
  });

  it("returns null when the visibility gate fully hides the element anchor", () => {
    const root = document.createElement("div");
    const anchorElement = document.createElement("button");
    root.append(anchorElement);
    document.body.append(root);

    mockRect(root, rect({ bottom: 100, left: 0, right: 100, top: 0 }));
    mockRect(anchorElement, rect({ bottom: 80, left: 120, right: 220, top: 10 }));

    const snapshot = resolveFloatingAnchorSnapshot(
      createElementFloatingAnchor(anchorElement, { root }),
    );

    expect(snapshot).toBeNull();
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
