// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { ScaffoldColorMode } from "@/theme/model";

import { useLearnerColorMode } from "./learner-color-mode";

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: originalMatchMedia,
  });
});

describe("useLearnerColorMode", () => {
  it("prefers a live host mode over the browser preference", () => {
    const media = installMatchMedia(true);
    const { result, rerender } = renderHook(
      ({ hostColorMode }: { hostColorMode: ScaffoldColorMode | undefined }) =>
        useLearnerColorMode(hostColorMode),
      { initialProps: { hostColorMode: "light" as ScaffoldColorMode | undefined } },
    );

    expect(result.current).toBe("light");

    rerender({ hostColorMode: "dark" });
    expect(result.current).toBe("dark");

    act(() => media.setMatches(false));
    expect(result.current).toBe("dark");

    rerender({ hostColorMode: undefined });
    expect(result.current).toBe("light");
  });

  it.each([
    { matches: false, expected: "light" },
    { matches: true, expected: "dark" },
  ] as const)(
    "uses the browser preference when it resolves to $expected",
    ({ matches, expected }) => {
      installMatchMedia(matches);

      const { result } = renderHook(() => useLearnerColorMode());

      expect(result.current).toBe(expected);
    },
  );

  it("updates when the browser preference changes", () => {
    const media = installMatchMedia(false);
    const { result } = renderHook(() => useLearnerColorMode());

    act(() => media.setMatches(true));

    expect(result.current).toBe("dark");
  });

  it("falls back to light when matchMedia is unavailable or throws", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: undefined,
    });
    const unavailable = renderHook(() => useLearnerColorMode());
    expect(unavailable.result.current).toBe("light");
    unavailable.unmount();

    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => {
        throw new Error("blocked");
      },
    });
    const throwing = renderHook(() => useLearnerColorMode());
    expect(throwing.result.current).toBe("light");
  });

  it("removes its media-query listener on unmount", () => {
    const media = installMatchMedia(false);
    const { unmount } = renderHook(() => useLearnerColorMode());

    expect(media.addEventListener).toHaveBeenCalledOnce();
    unmount();
    expect(media.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });
});

function installMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const addEventListener = vi.fn(
    (_type: "change", listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
  );
  const removeEventListener = vi.fn(
    (_type: "change", listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
  );
  const mediaQueryList = {
    get matches() {
      return matches;
    },
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener,
    removeEventListener,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => mediaQueryList),
  });

  return {
    addEventListener,
    removeEventListener,
    setMatches(next: boolean) {
      matches = next;
      const event = { matches, media: mediaQueryList.media } as MediaQueryListEvent;
      for (const listener of listeners) listener(event);
    },
  };
}
