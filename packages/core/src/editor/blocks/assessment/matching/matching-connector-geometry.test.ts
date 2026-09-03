// @vitest-environment happy-dom

import { describe, expect, it } from "vite-plus/test";

import { getMatchingConnectorPath } from "@/editor/assessment/matching/matching-fields-shared";
import {
  createMatchingConnectorRevision,
  measureMatchingConnectorGeometry,
  sameMatchingConnectors,
} from "@/editor/assessment/matching/matching-connector-geometry";

describe("matching connector geometry", () => {
  it("converts endpoint client edges into one SVG-local geometry revision", () => {
    const { container, item, svg, target } = fixture();
    stubRect(item, { left: 120, top: 70, width: 80, height: 40 });
    stubRect(target, { left: 300, top: 110, width: 100, height: 60 });
    stubScreenCtm(svg, { a: 2, b: 0, c: 0, d: 2, e: 100, f: 50 });

    expect(
      measureMatchingConnectorGeometry({
        connections: [{ itemId: "i1", targetId: "t1", state: "correct" }],
        container,
        svg,
      }),
    ).toEqual([
      {
        itemId: "i1",
        targetId: "t1",
        startX: 55,
        startY: 20,
        endX: 95,
        endY: 45,
        state: "correct",
      },
    ]);
  });

  it("clears the revision when the converter or any requested endpoint is invalid", () => {
    const { container, item, svg, target } = fixture();
    stubRect(item, { left: 120, top: 70, width: 80, height: 40 });
    stubRect(target, { left: 300, top: 110, width: 100, height: 60 });
    stubScreenCtm(svg, { a: 2, b: 0, c: 0, d: 2, e: 100, f: 50 });
    const input = {
      connections: [{ itemId: "i1", targetId: "t1", state: "default" as const }],
      container,
      svg,
    };

    target.remove();
    expect(measureMatchingConnectorGeometry(input)).toEqual([]);
    container.append(target);
    stubScreenCtm(svg, { a: 1, b: 0.2, c: 0, d: 1, e: 0, f: 0 });
    expect(measureMatchingConnectorGeometry(input)).toEqual([]);
  });

  it("owns the cubic path and revision equality cases without duplicate component coverage", () => {
    const connector = {
      itemId: "i1",
      targetId: "t1",
      startX: 10,
      startY: 20,
      endX: 110,
      endY: 80,
      state: "default" as const,
    };
    expect(getMatchingConnectorPath(connector)).toBe("M 10 20 C 40 20, 80 80, 110 80");
    expect(sameMatchingConnectors([connector], [{ ...connector }])).toBe(true);
    expect(sameMatchingConnectors([connector], [{ ...connector, endY: 81 }])).toBe(false);
  });

  it("creates collision-safe revisions for opaque match and feedback IDs", () => {
    const first = createMatchingConnectorRevision(
      { a: "b|c:d" },
      { "feedback:item": { correct: true } },
    );
    const second = createMatchingConnectorRevision(
      { a: "b", c: "d" },
      { feedback: { correct: true }, item: { correct: true } },
    );

    expect(first).not.toBe(second);
  });
});

function fixture() {
  const container = document.createElement("div");
  const item = document.createElement("div");
  const target = document.createElement("div");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  item.dataset.itemId = "i1";
  target.dataset.targetId = "t1";
  container.append(svg, item, target);
  document.body.append(container);
  return { container, item, svg, target };
}

function stubRect(
  element: Element,
  rect: Readonly<{ left: number; top: number; width: number; height: number }>,
) {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () =>
      ({
        bottom: rect.top + rect.height,
        height: rect.height,
        left: rect.left,
        right: rect.left + rect.width,
        top: rect.top,
        width: rect.width,
        x: rect.left,
        y: rect.top,
        toJSON: () => ({}),
      }) as DOMRect,
  });
}

function stubScreenCtm(
  svg: SVGSVGElement,
  matrix: Readonly<{ a: number; b: number; c: number; d: number; e: number; f: number }>,
) {
  Object.defineProperty(svg, "getScreenCTM", {
    configurable: true,
    value: () => matrix,
  });
}
