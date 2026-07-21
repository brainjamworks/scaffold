import { describe, expect, it } from "vite-plus/test";

import { imagePositionToCss } from "@/editor/media/model/image-position";

describe("imagePositionToCss", () => {
  it.each([
    ["top-left", "left top"],
    ["top-center", "center top"],
    ["top-right", "right top"],
    ["center-left", "left center"],
    ["center", "center center"],
    ["center-right", "right center"],
    ["bottom-left", "left bottom"],
    ["bottom-center", "center bottom"],
    ["bottom-right", "right bottom"],
  ] as const)("maps %s to %s", (position, expected) => {
    expect(imagePositionToCss(position)).toBe(expected);
  });

  it("uses centre for missing and invalid positions", () => {
    expect(imagePositionToCss(undefined)).toBe("center center");
    expect(imagePositionToCss("25% 75%")).toBe("center center");
  });
});
