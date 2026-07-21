// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vite-plus/test";

import { readDocumentHeight } from "./mount-inner-lifecycle";

describe("readDocumentHeight", () => {
  beforeEach(() => {
    setElementBox(document.documentElement, { scrollHeight: 900, offsetHeight: 880 });
    setElementBox(document.body, { scrollHeight: 860, offsetHeight: 840 });
  });

  it("uses a short rendered root instead of viewport-sized document boxes", () => {
    const root = document.createElement("div");
    document.body.append(root);
    setElementBox(root, { scrollHeight: 148, offsetHeight: 144, clientHeight: 140 });

    expect(readDocumentHeight(root)).toBe(148);
  });

  it("allows an empty rendered root to report zero", () => {
    const root = document.createElement("div");
    document.body.append(root);
    setElementBox(root, { scrollHeight: 0, offsetHeight: 0, clientHeight: 0 });

    expect(readDocumentHeight(root)).toBe(0);
  });

  it("reports the full height of a tall rendered root", () => {
    const root = document.createElement("div");
    document.body.append(root);
    setElementBox(root, { scrollHeight: 1077, offsetHeight: 1060, clientHeight: 1050 });

    expect(readDocumentHeight(root)).toBe(1077);
  });
});

function setElementBox(
  element: Element,
  dimensions: Partial<Record<"scrollHeight" | "offsetHeight" | "clientHeight", number>>,
): void {
  for (const [property, value] of Object.entries(dimensions)) {
    Object.defineProperty(element, property, {
      configurable: true,
      value,
    });
  }
}
