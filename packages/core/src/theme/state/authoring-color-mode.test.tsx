// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { AUTHORING_COLOR_MODE_STORAGE_KEY, useAuthoringColorMode } from "./authoring-color-mode";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useAuthoringColorMode", () => {
  it("uses a valid stored preference before the browser preference", () => {
    localStorage.setItem(AUTHORING_COLOR_MODE_STORAGE_KEY, "dark");
    installBrowserPreference(false);

    const { result } = renderHook(() => useAuthoringColorMode());

    expect(result.current.mode).toBe("dark");
  });

  it("ignores invalid storage and uses the initial browser preference", () => {
    localStorage.setItem(AUTHORING_COLOR_MODE_STORAGE_KEY, "sepia");
    installBrowserPreference(true);

    const { result } = renderHook(() => useAuthoringColorMode());

    expect(result.current.mode).toBe("dark");
  });

  it("falls back to light when browser and storage APIs are unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    vi.stubGlobal("matchMedia", undefined);

    const { result } = renderHook(() => useAuthoringColorMode());

    expect(result.current.mode).toBe("light");
  });

  it("falls back to light when matchMedia throws", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => {
        throw new Error("media query blocked");
      }),
    );

    const { result } = renderHook(() => useAuthoringColorMode());

    expect(result.current.mode).toBe("light");
  });

  it("toggles and stores the active preference", () => {
    installBrowserPreference(false);
    const { result } = renderHook(() => useAuthoringColorMode());

    act(() => result.current.toggleMode());

    expect(result.current.mode).toBe("dark");
    expect(localStorage.getItem(AUTHORING_COLOR_MODE_STORAGE_KEY)).toBe("dark");
  });

  it("keeps the active toggle when storage writes fail", () => {
    installBrowserPreference(false);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage full");
    });
    const { result } = renderHook(() => useAuthoringColorMode());

    act(() => result.current.toggleMode());

    expect(result.current.mode).toBe("dark");
  });

  it("restores a toggled preference after remount", () => {
    installBrowserPreference(false);
    const first = renderHook(() => useAuthoringColorMode());
    act(() => first.result.current.toggleMode());
    first.unmount();

    const second = renderHook(() => useAuthoringColorMode());

    expect(second.result.current.mode).toBe("dark");
  });
});

function installBrowserPreference(dark: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: dark }) as MediaQueryList),
  );
}
