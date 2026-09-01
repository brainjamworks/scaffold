import { describe, expect, it } from "vite-plus/test";

import {
  PresentationSvgPathDataSchema,
  parsePresentationSvgPathData,
} from "./presentation-svg-path";

describe("presentation SVG path data", () => {
  it("accepts the absolute M, L and C subset and exposes its endpoints", () => {
    const pathData = "M 0 0 L 10 -12.5 C 20 30 40 50 0 0";

    expect(PresentationSvgPathDataSchema.parse(pathData)).toBe(pathData);
    expect(parsePresentationSvgPathData(pathData)).toMatchObject({
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
    });
  });

  it.each([
    "",
    "M 0 0",
    "m 0 0 l 1 1",
    "M 0 0 H 10",
    "M 0 0 V 10",
    "M 0 0 Q 1 1 2 2",
    "M 0 0 A 1 1 0 0 0 2 2",
    "M 0 0 L 1 1 Z",
    "M 0 0 M 1 1",
    "M 0 0 L Infinity 1",
    "M 0 0 L NaN 1",
    "M 0 0 L 1025 0",
    "M 0 0 L 0 -1025",
    "M 0 0 L 1",
    "M 0 0 C 1 2 3 4 5",
  ])("rejects unsupported or out-of-bounds path data: %s", (pathData) => {
    expect(PresentationSvgPathDataSchema.safeParse(pathData).success).toBe(false);
  });

  it("accepts coordinates at the fixed-canvas delta bounds", () => {
    expect(PresentationSvgPathDataSchema.parse("M -1024 1024 L 1024 -1024")).toBe(
      "M -1024 1024 L 1024 -1024",
    );
  });
});
