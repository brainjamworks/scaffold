// @vitest-environment happy-dom

import { EmbeddedDataIdSchema } from "@scaffold/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { createAnimeVisualAnimationDriver } from "./anime-visual-animation-driver";

describe("AnimeVisualAnimationDriver", () => {
  it("creates a callback-free paused animation from one element reference", () => {
    const animation = { seek: vi.fn(), cancel: vi.fn() };
    const animate = vi.fn(
      (_element: HTMLElement, _parameters: Readonly<Record<string, unknown>>) => animation,
    );
    const element = document.createElement("div");
    const driver = createAnimeVisualAnimationDriver({ animate });

    driver.create({
      segmentId: EmbeddedDataIdSchema.parse("segment00001"),
      element,
      durationMs: 500,
      easing: "linear",
      keyframes: [
        { offset: 0, opacity: 0 },
        { offset: 1, opacity: 1 },
      ],
    });

    expect(animate).toHaveBeenCalledOnce();
    expect(animate.mock.calls[0]?.[0]).toBe(element);
    expect(animate.mock.calls[0]?.[1]).toEqual({
      autoplay: false,
      duration: 500,
      ease: "linear",
      keyframes: {
        "0": { opacity: 0 },
        "100": { opacity: 1 },
      },
    });
    expect(animate.mock.calls[0]?.[1]).not.toHaveProperty("onComplete");
    expect(animate.mock.calls[0]?.[1]).not.toHaveProperty("targets");
  });

  it("composes Presentation transforms after the target's authored transform", () => {
    const animate = vi.fn(
      (_element: HTMLElement, _parameters: Readonly<Record<string, unknown>>) => ({
        seek: vi.fn(),
        cancel: vi.fn(),
      }),
    );
    const driver = createAnimeVisualAnimationDriver({ animate });

    driver.create({
      segmentId: EmbeddedDataIdSchema.parse("segment00001"),
      element: document.createElement("div"),
      durationMs: 500,
      easing: "linear",
      baseTransform: "translate(-50%, -50%)",
      keyframes: [
        { offset: 0, transform: { scale: 1 } },
        { offset: 1, transform: { scale: 1.06 } },
      ],
    });

    expect(animate.mock.calls[0]?.[1]).toMatchObject({
      keyframes: {
        "0": { transform: "translate(-50%, -50%) scale(1)" },
        "100": { transform: "translate(-50%, -50%) scale(1.06)" },
      },
    });
  });

  it("seeks absolutely with callbacks muted and cancels idempotently", () => {
    const animation = { seek: vi.fn(), cancel: vi.fn() };
    const driver = createAnimeVisualAnimationDriver({ animate: () => animation });
    const handle = driver.create({
      segmentId: EmbeddedDataIdSchema.parse("segment00001"),
      element: document.createElement("div"),
      durationMs: 500,
      easing: "linear",
      keyframes: [
        { offset: 0, opacity: 0 },
        { offset: 1, opacity: 1 },
      ],
    });

    handle.seek(0);
    handle.seek(250);
    handle.seek(500);
    expect(animation.seek.mock.calls).toEqual([
      [0, true],
      [250, true],
      [500, true],
    ]);

    handle.cancel();
    handle.cancel();
    expect(animation.cancel).toHaveBeenCalledOnce();
    expect(() => handle.seek(250)).toThrow(/cancelled/);
  });

  it("rejects invalid driver primitives as programming defects", () => {
    const driver = createAnimeVisualAnimationDriver({
      animate: () => ({ seek() {}, cancel() {} }),
    });

    expect(() =>
      driver.create({
        segmentId: EmbeddedDataIdSchema.parse("segment00001"),
        element: document.createElement("div"),
        durationMs: 500,
        easing: "linear",
        keyframes: [
          { offset: 0.5, opacity: 0 },
          { offset: 1, opacity: 1 },
        ],
      }),
    ).toThrow(/offset/);
  });
});
