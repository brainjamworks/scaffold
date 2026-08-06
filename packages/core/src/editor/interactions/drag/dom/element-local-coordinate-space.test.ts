// @vitest-environment happy-dom

import { describe, expect, it } from "vite-plus/test";

import { createClientPoint, createLocalPoint } from "../model/coordinate-space";
import { measureElementLocalCoordinateSpace } from "./element-local-coordinate-space";

describe("measureElementLocalCoordinateSpace", () => {
  it("converts an offset, non-uniformly scaled HTML border box", () => {
    const element = document.createElement("div");
    document.body.append(element);
    Object.defineProperties(element, {
      offsetWidth: { configurable: true, value: 200 },
      offsetHeight: { configurable: true, value: 100 },
      getBoundingClientRect: {
        configurable: true,
        value: () => clientRect(40, 30, 100, 200),
      },
    });

    const snapshot = measureElementLocalCoordinateSpace(element);

    expect(snapshot?.scaleX).toBe(0.5);
    expect(snapshot?.scaleY).toBe(2);
    expect(snapshot?.clientPointToLocal(createClientPoint(90, 130)!)).toEqual({
      space: "local",
      x: 100,
      y: 50,
    });
    expect(snapshot?.localPointToClient(createLocalPoint(100, 50)!)).toEqual({
      space: "client",
      x: 90,
      y: 130,
    });
  });

  it("uses the SVG screen CTM so viewBox scaling participates in round trips", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 400 100");
    document.body.append(svg);
    stubScreenCtm(svg, { a: 0.5, b: 0, c: 0, d: 2, e: 25, f: 40 });

    const snapshot = measureElementLocalCoordinateSpace(svg);

    expect(snapshot?.kind).toBe("svg-ctm");
    expect(snapshot?.clientPointToLocal(createClientPoint(125, 140)!)).toEqual({
      space: "local",
      x: 200,
      y: 50,
    });
    expect(snapshot?.localPointToClient(createLocalPoint(200, 50)!)).toEqual({
      space: "client",
      x: 125,
      y: 140,
    });
  });

  it("fails closed for disconnected, non-finite, singular, mirrored, and rotated CTMs", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    expect(measureElementLocalCoordinateSpace(svg)).toBeNull();

    document.body.append(svg);
    for (const matrix of [
      { a: Number.NaN, b: 0, c: 0, d: 1, e: 0, f: 0 },
      { a: 0, b: 0, c: 0, d: 1, e: 0, f: 0 },
      { a: -1, b: 0, c: 0, d: 1, e: 0, f: 0 },
      { a: 1, b: 0.1, c: 0, d: 1, e: 0, f: 0 },
    ]) {
      stubScreenCtm(svg, matrix);
      expect(measureElementLocalCoordinateSpace(svg)).toBeNull();
    }
  });

  it("fails closed when an SVG has a 3D or perspective ancestor hidden by an affine screen CTM", () => {
    const ancestor = document.createElement("div");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    ancestor.append(svg);
    document.body.append(ancestor);
    stubScreenCtm(svg, { a: 1, b: 0, c: 0, d: 1, e: 20, f: 30 });

    ancestor.style.transform = "matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, -0.002, 0, 0, 0, 1)";
    expect(measureElementLocalCoordinateSpace(svg)).toBeNull();

    ancestor.style.transform = "none";
    ancestor.style.perspective = "500px";
    expect(measureElementLocalCoordinateSpace(svg)).toBeNull();
  });
});

function stubScreenCtm(
  svg: SVGSVGElement,
  matrix: Readonly<{ a: number; b: number; c: number; d: number; e: number; f: number }>,
) {
  Object.defineProperty(svg, "getScreenCTM", {
    configurable: true,
    value: () => matrix,
  });
}

function clientRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}
