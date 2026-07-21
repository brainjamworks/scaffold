import { describe, expect, it } from "vite-plus/test";

import {
  deriveSlideshowCanvasScale,
  getSlideshowCanvasMetrics,
  SLIDESHOW_CANVAS_METRICS,
} from "./slideshow-canvas";

describe("slideshow canvas", () => {
  it("defines one immutable 1024x576 16:9 canvas", () => {
    expect(SLIDESHOW_CANVAS_METRICS).toEqual({
      surfaceSize: "16x9",
      intrinsicWidth: 1024,
      intrinsicHeight: 576,
      aspectRatio: 16 / 9,
    });
    expect(Object.isFrozen(SLIDESHOW_CANVAS_METRICS)).toBe(true);
    expect(getSlideshowCanvasMetrics("16x9")).toBe(SLIDESHOW_CANVAS_METRICS);
  });

  it.each([
    {
      name: "an exact fit",
      availableWidth: 1024,
      availableHeight: 576,
      scale: 1,
      renderedWidth: 1024,
      renderedHeight: 576,
    },
    {
      name: "narrow bounds",
      availableWidth: 512,
      availableHeight: 800,
      scale: 0.5,
      renderedWidth: 512,
      renderedHeight: 288,
    },
    {
      name: "height-constrained bounds",
      availableWidth: 1000,
      availableHeight: 288,
      scale: 0.5,
      renderedWidth: 512,
      renderedHeight: 288,
    },
    {
      name: "wide bounds with proportional upscaling",
      availableWidth: 2048,
      availableHeight: 1152,
      scale: 2,
      renderedWidth: 2048,
      renderedHeight: 1152,
    },
    {
      name: "tall bounds",
      availableWidth: 1024,
      availableHeight: 2000,
      scale: 1,
      renderedWidth: 1024,
      renderedHeight: 576,
    },
  ])("derives a uniform scale for $name", (expected) => {
    const state = deriveSlideshowCanvasScale(expected.availableWidth, expected.availableHeight);

    if (!state) throw new Error("expected valid slideshow canvas scale state");
    expect(state).toEqual({
      availableWidth: expected.availableWidth,
      availableHeight: expected.availableHeight,
      metrics: SLIDESHOW_CANVAS_METRICS,
      scale: expected.scale,
      renderedWidth: expected.renderedWidth,
      renderedHeight: expected.renderedHeight,
    });
  });

  it.each([
    [0, 576],
    [-1, 576],
    [1024, 0],
    [1024, -1],
    [Number.NaN, 576],
    [Number.POSITIVE_INFINITY, 576],
    [1024, Number.NEGATIVE_INFINITY],
  ])("rejects invalid available bounds (%s, %s)", (availableWidth, availableHeight) => {
    expect(deriveSlideshowCanvasScale(availableWidth, availableHeight)).toBeNull();
  });

  it.each(["fluid", "4x3", null, undefined])(
    "rejects unsupported slideshow surface size %s",
    (surfaceSize) => {
      expect(() => getSlideshowCanvasMetrics(surfaceSize)).toThrow(
        "Slideshow surface size must be 16x9.",
      );
    },
  );
});
