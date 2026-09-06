// @vitest-environment happy-dom

import { cleanup, render, type RenderResult } from "@testing-library/react";
import { createElement, useEffect, useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { useMeasuredHeaderHeight } from "./use-measured-header-height";

function Harness({
  onReady,
}: {
  onReady: (header: HTMLElement | null, target: HTMLElement | null) => void;
}) {
  const headerRef = useRef<HTMLElement | null>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  useMeasuredHeaderHeight(headerRef, targetRef);
  useEffect(() => {
    onReady(headerRef.current, targetRef.current);
  }, [onReady]);
  return createElement(
    "div",
    null,
    createElement("header", { ref: headerRef }),
    createElement("main", { ref: targetRef }),
  );
}

function renderHarness(): RenderResult & { header: HTMLElement; target: HTMLElement } {
  let header: HTMLElement | null = null;
  let target: HTMLElement | null = null;
  const view = render(
    createElement(Harness, {
      onReady: (readyHeader, readyTarget) => {
        header = readyHeader;
        target = readyTarget;
      },
    }),
  );
  if (!header || !target) throw new Error("expected header and target elements");
  return { ...view, header, target };
}

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();

  constructor(readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }
}

afterEach(() => {
  cleanup();
  FakeResizeObserver.instances.length = 0;
  vi.unstubAllGlobals();
});

describe("useMeasuredHeaderHeight", () => {
  it("measures the border-box height and follows ResizeObserver updates", () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const { header, target } = renderHarness();
    vi.spyOn(header, "getBoundingClientRect").mockReturnValue({ height: 57 } as DOMRect);

    expect(FakeResizeObserver.instances).toHaveLength(1);
    expect(FakeResizeObserver.instances[0]?.observe).toHaveBeenCalledTimes(1);
    expect(target.style.getPropertyValue("--sc-editor-header-height")).toBe("0px");

    const instance = FakeResizeObserver.instances[0];
    instance?.callback(
      [{ contentRect: { height: 99 } } as ResizeObserverEntry],
      instance as unknown as ResizeObserver,
    );
    expect(target.style.getPropertyValue("--sc-editor-header-height")).toBe("57px");
  });

  it("disconnects on unmount", () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const { unmount } = renderHarness();

    unmount();

    expect(FakeResizeObserver.instances[0]?.disconnect).toHaveBeenCalledTimes(1);
  });

  it("falls back to a synchronous measure without ResizeObserver", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    const { target } = renderHarness();

    expect(target.style.getPropertyValue("--sc-editor-header-height")).toBe("0px");
  });
});
