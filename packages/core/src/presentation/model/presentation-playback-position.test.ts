import { describe, expect, it } from "vite-plus/test";

import {
  comparePresentationPlaybackPositions,
  createPresentationPlaybackPosition,
  presentationActionStartPosition,
} from "./presentation-playback-position";

describe("PresentationPlaybackPosition", () => {
  it("orders time first and before-actions before after-actions at the same time", () => {
    const before = createPresentationPlaybackPosition(1_000, "before-actions");
    const after = createPresentationPlaybackPosition(1_000, "after-actions");

    expect(comparePresentationPlaybackPositions(before, after)).toBeLessThan(0);
    expect(comparePresentationPlaybackPositions(after, before)).toBeGreaterThan(0);
    expect(
      comparePresentationPlaybackPositions(
        createPresentationPlaybackPosition(999, "after-actions"),
        before,
      ),
    ).toBeLessThan(0);
    expect(
      comparePresentationPlaybackPositions(after, presentationActionStartPosition(1_000)),
    ).toBe(0);
  });

  it("creates frozen positions and keeps invalid time observable as a defect", () => {
    const position = createPresentationPlaybackPosition(0, "before-actions");

    expect(position).toEqual({ timeMs: 0, side: "before-actions" });
    expect(Object.isFrozen(position)).toBe(true);
    for (const timeMs of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => createPresentationPlaybackPosition(timeMs, "after-actions")).toThrow(/time/i);
    }
    expect(() => createPresentationPlaybackPosition(0, "during-actions" as never)).toThrow(/side/i);
    expect(() =>
      comparePresentationPlaybackPositions(
        { timeMs: 0, side: "during-actions" as never },
        position,
      ),
    ).toThrow(/side/i);
  });
});
