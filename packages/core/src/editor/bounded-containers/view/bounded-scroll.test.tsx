// @vitest-environment happy-dom

import { cleanup, render, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  BOUNDED_SCROLL_END_ATTR,
  BOUNDED_SCROLL_OVERFLOW_ATTR,
  BOUNDED_SCROLL_VIEWPORT_SELECTOR,
  resolveBoundedScrollAffordanceState,
  useBoundedScrollAffordance,
} from "./bounded-scroll";

interface TestLaneMetrics {
  clientHeight: number;
  scrollHeight: number;
}

function mockLaneMetrics(metricsById: Record<string, TestLaneMetrics>) {
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
    function clientHeight(this: HTMLElement) {
      return metricsById[this.dataset.testLane ?? ""]?.clientHeight ?? 0;
    },
  );
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
    function scrollHeight(this: HTMLElement) {
      return metricsById[this.dataset.testLane ?? ""]?.scrollHeight ?? this.clientHeight;
    },
  );
}

function BoundedScrollRoot({ inputWidth = "8ch" }: { inputWidth?: string }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  useBoundedScrollAffordance(rootRef);

  return (
    <div ref={rootRef} data-test-root="">
      <div data-bounded-scroll="" data-test-lane="first">
        <input aria-label="First answer" style={{ width: inputWidth }} />
      </div>
      <div data-bounded-scroll="" data-test-lane="second">
        Second lane
      </div>
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("bounded scroll affordance", () => {
  it("treats two pixels of layout noise as fitting content", () => {
    expect(
      resolveBoundedScrollAffordanceState({
        clientHeight: 120,
        scrollHeight: 121,
        scrollTop: 0,
      }),
    ).toEqual({ atEnd: true, overflowing: false });
  });

  it("tracks overflow and the end of every registered viewport", () => {
    mockLaneMetrics({
      first: { clientHeight: 120, scrollHeight: 240 },
      second: { clientHeight: 120, scrollHeight: 120 },
    });

    const { container } = render(<BoundedScrollRoot />);
    const lanes = container.querySelectorAll<HTMLElement>(BOUNDED_SCROLL_VIEWPORT_SELECTOR);
    const firstLane = lanes[0]!;
    const secondLane = lanes[1]!;

    expect(firstLane.hasAttribute(BOUNDED_SCROLL_OVERFLOW_ATTR)).toBe(true);
    expect(firstLane.hasAttribute(BOUNDED_SCROLL_END_ATTR)).toBe(false);
    expect(secondLane.hasAttribute(BOUNDED_SCROLL_OVERFLOW_ATTR)).toBe(false);
    expect(secondLane.hasAttribute(BOUNDED_SCROLL_END_ATTR)).toBe(true);

    firstLane.scrollTop = 120;
    firstLane.dispatchEvent(new Event("scroll"));

    expect(firstLane.hasAttribute(BOUNDED_SCROLL_END_ATTR)).toBe(true);
  });

  it("remeasures viewports after descendant content changes", async () => {
    const metrics = {
      first: { clientHeight: 120, scrollHeight: 120 },
      second: { clientHeight: 120, scrollHeight: 120 },
    };
    mockLaneMetrics(metrics);

    const { container, rerender } = render(<BoundedScrollRoot />);
    const lanes = container.querySelectorAll<HTMLElement>(BOUNDED_SCROLL_VIEWPORT_SELECTOR);

    metrics.first.scrollHeight = 240;
    metrics.second.scrollHeight = 180;
    rerender(<BoundedScrollRoot inputWidth="20ch" />);

    await waitFor(() => {
      expect(
        Array.from(lanes).every((lane) => lane.hasAttribute(BOUNDED_SCROLL_OVERFLOW_ATTR)),
      ).toBe(true);
    });
  });

  it("remeasures viewports when the bounded root regains layout dimensions", () => {
    const observedTargets = new Set<Element>();
    let triggerResize: (target: Element) => void = () => {
      throw new Error("ResizeObserver was not constructed");
    };

    class TestResizeObserver implements ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        triggerResize = (target: Element) => {
          callback([{ target } as ResizeObserverEntry], this);
        };
      }

      disconnect = vi.fn();
      observe = vi.fn((target: Element) => observedTargets.add(target));
      unobserve = vi.fn((target: Element) => observedTargets.delete(target));
    }

    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    const metrics = {
      first: { clientHeight: 0, scrollHeight: 0 },
      second: { clientHeight: 0, scrollHeight: 0 },
    };
    mockLaneMetrics(metrics);

    const { container } = render(<BoundedScrollRoot />);
    const root = container.querySelector<HTMLElement>("[data-test-root]");
    const lanes = container.querySelectorAll<HTMLElement>(BOUNDED_SCROLL_VIEWPORT_SELECTOR);

    expect(root).not.toBeNull();
    expect(observedTargets.has(root!)).toBe(true);

    metrics.first = { clientHeight: 120, scrollHeight: 240 };
    metrics.second = { clientHeight: 120, scrollHeight: 180 };
    triggerResize(root!);

    expect(Array.from(lanes).every((lane) => lane.hasAttribute(BOUNDED_SCROLL_OVERFLOW_ATTR))).toBe(
      true,
    );
  });

  it("disconnects observers and viewport listeners on unmount", () => {
    const mutationDisconnect = vi.spyOn(MutationObserver.prototype, "disconnect");
    const removeEventListener = vi.spyOn(HTMLElement.prototype, "removeEventListener");
    const resizeDisconnect = vi.fn();

    class TestResizeObserver implements ResizeObserver {
      disconnect = resizeDisconnect;
      observe = vi.fn();
      unobserve = vi.fn();
    }

    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    mockLaneMetrics({
      first: { clientHeight: 120, scrollHeight: 120 },
      second: { clientHeight: 120, scrollHeight: 120 },
    });

    const { unmount } = render(<BoundedScrollRoot />);
    unmount();

    expect(mutationDisconnect).toHaveBeenCalledTimes(1);
    expect(resizeDisconnect).toHaveBeenCalledTimes(1);
    expect(removeEventListener).toHaveBeenCalledWith("scroll", expect.any(Function));
  });
});
