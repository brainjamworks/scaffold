import { describe, expect, it } from "vite-plus/test";

import { getSlideshowNavigationState, getSlideshowSurfaceStates } from "./slideshow-navigation";

describe("getSlideshowNavigationState", () => {
  it("describes a one-slide slideshow", () => {
    expect(getSlideshowNavigationState(["slide-1"])).toEqual({
      activeSurfaceId: "slide-1",
      currentIndex: 0,
      currentNumber: 1,
      count: 1,
      previousSurfaceId: null,
      nextSurfaceId: null,
      canGoPrevious: false,
      canGoNext: false,
    });
  });

  it("describes the first slide in a multi-slide slideshow", () => {
    expect(getSlideshowNavigationState(["slide-1", "slide-2", "slide-3"], "slide-1")).toEqual({
      activeSurfaceId: "slide-1",
      currentIndex: 0,
      currentNumber: 1,
      count: 3,
      previousSurfaceId: null,
      nextSurfaceId: "slide-2",
      canGoPrevious: false,
      canGoNext: true,
    });
  });

  it("describes a middle slide in a multi-slide slideshow", () => {
    expect(getSlideshowNavigationState(["slide-1", "slide-2", "slide-3"], "slide-2")).toEqual({
      activeSurfaceId: "slide-2",
      currentIndex: 1,
      currentNumber: 2,
      count: 3,
      previousSurfaceId: "slide-1",
      nextSurfaceId: "slide-3",
      canGoPrevious: true,
      canGoNext: true,
    });
  });

  it("describes the last slide in a multi-slide slideshow", () => {
    expect(getSlideshowNavigationState(["slide-1", "slide-2", "slide-3"], "slide-3")).toEqual({
      activeSurfaceId: "slide-3",
      currentIndex: 2,
      currentNumber: 3,
      count: 3,
      previousSurfaceId: "slide-2",
      nextSurfaceId: null,
      canGoPrevious: true,
      canGoNext: false,
    });
  });

  it("normalizes a missing or stale active id to the first slide", () => {
    expect(
      getSlideshowNavigationState(["slide-1", "slide-2", "slide-3"], "removed-slide"),
    ).toMatchObject({
      activeSurfaceId: "slide-1",
      currentIndex: 0,
      currentNumber: 1,
      previousSurfaceId: null,
      nextSurfaceId: "slide-2",
    });

    expect(getSlideshowNavigationState(["slide-1", "slide-2", "slide-3"])).toMatchObject({
      activeSurfaceId: "slide-1",
      currentIndex: 0,
      currentNumber: 1,
      previousSurfaceId: null,
      nextSurfaceId: "slide-2",
    });
  });

  it("derives runtime surface states from the active slide", () => {
    expect(
      getSlideshowSurfaceStates(["slide-1", "slide-2", "slide-3", "slide-4"], "slide-2"),
    ).toEqual({
      "slide-1": "previous",
      "slide-2": "current",
      "slide-3": "next",
      "slide-4": "hidden",
    });
  });

  it("normalizes stale active ids before deriving surface states", () => {
    expect(getSlideshowSurfaceStates(["slide-1", "slide-2", "slide-3"], "removed-slide")).toEqual({
      "slide-1": "current",
      "slide-2": "next",
      "slide-3": "hidden",
    });
  });
});
