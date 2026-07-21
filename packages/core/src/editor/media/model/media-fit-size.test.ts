import { describe, expect, it } from "vite-plus/test";

import { resolveMediaFitSize } from "./media-fit-size";

describe("resolveMediaFitSize", () => {
  it("fits a landscape image by the available width when height is sufficient", () => {
    expect(
      resolveMediaFitSize({
        availableHeight: 600,
        availableWidth: 800,
        intrinsicHeight: 900,
        intrinsicWidth: 1600,
        strategy: "contain",
      }),
    ).toEqual({ height: 450, width: 800 });
  });

  it("fits by the available height when width-driven sizing would overflow", () => {
    expect(
      resolveMediaFitSize({
        availableHeight: 200,
        availableWidth: 800,
        intrinsicHeight: 900,
        intrinsicWidth: 1600,
        strategy: "contain",
      }),
    ).toEqual({ height: 200, width: 1600 / 4.5 });
  });

  it("uses width-driven sizing without requiring a finite height", () => {
    expect(
      resolveMediaFitSize({
        availableHeight: 0,
        availableWidth: 720,
        intrinsicHeight: 900,
        intrinsicWidth: 1600,
        strategy: "width",
      }),
    ).toEqual({ height: 405, width: 720 });
  });

  it.each([
    { availableHeight: 200, availableWidth: 0, intrinsicHeight: 900, intrinsicWidth: 1600 },
    { availableHeight: 200, availableWidth: 800, intrinsicHeight: 0, intrinsicWidth: 1600 },
    {
      availableHeight: Number.NaN,
      availableWidth: 800,
      intrinsicHeight: 900,
      intrinsicWidth: 1600,
    },
  ])("rejects invalid dimensions %#", (dimensions) => {
    expect(resolveMediaFitSize({ ...dimensions, strategy: "contain" })).toBeNull();
  });
});
