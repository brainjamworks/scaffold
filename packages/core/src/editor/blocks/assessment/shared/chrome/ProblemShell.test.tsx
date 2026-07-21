// @vitest-environment happy-dom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { ProblemShell, resolveBoundedScrollAffordanceState } from "./ProblemShell";

const BOUNDED_SCROLL_SELECTOR = "[data-assessment-bounded-scroll]";
const BOUNDED_SCROLL_OVERFLOW_ATTR = "data-assessment-bounded-scroll-overflow";
const BOUNDED_SCROLL_END_ATTR = "data-assessment-bounded-scroll-end";

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

function BoundedScrollShell({ inputWidth = "8ch" }: { inputWidth?: string }) {
  return (
    <ProblemShell isEditable={false}>
      <div data-assessment-bounded-scroll="" data-test-lane="first">
        <input aria-label="First answer" style={{ width: inputWidth }} />
      </div>
      <div data-assessment-bounded-scroll="" data-test-lane="second">
        Second lane
      </div>
    </ProblemShell>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("assessment bounded scroll affordance", () => {
  it("does not show the hint when content fits", () => {
    expect(
      resolveBoundedScrollAffordanceState({
        clientHeight: 120,
        scrollHeight: 121,
        scrollTop: 0,
      }),
    ).toEqual({ atEnd: true, overflowing: false });
  });

  it("shows the hint while overflowing content remains below", () => {
    expect(
      resolveBoundedScrollAffordanceState({
        clientHeight: 120,
        scrollHeight: 240,
        scrollTop: 24,
      }),
    ).toEqual({ atEnd: false, overflowing: true });
  });

  it("hides the hint at the bottom of an overflowing lane", () => {
    expect(
      resolveBoundedScrollAffordanceState({
        clientHeight: 120,
        scrollHeight: 240,
        scrollTop: 119,
      }),
    ).toEqual({ atEnd: true, overflowing: true });
  });

  it("measures registered bounded lanes on mount", () => {
    mockLaneMetrics({
      first: { clientHeight: 120, scrollHeight: 240 },
      second: { clientHeight: 120, scrollHeight: 120 },
    });

    const { container } = render(<BoundedScrollShell />);
    const lanes = container.querySelectorAll<HTMLElement>(BOUNDED_SCROLL_SELECTOR);
    const firstLane = lanes[0];
    const secondLane = lanes[1];

    expect(firstLane?.hasAttribute(BOUNDED_SCROLL_OVERFLOW_ATTR)).toBe(true);
    expect(firstLane?.hasAttribute(BOUNDED_SCROLL_END_ATTR)).toBe(false);
    expect(secondLane?.hasAttribute(BOUNDED_SCROLL_OVERFLOW_ATTR)).toBe(false);
    expect(secondLane?.hasAttribute(BOUNDED_SCROLL_END_ATTR)).toBe(true);
  });

  it("refreshes every bounded lane after a descendant style change", async () => {
    const metrics = {
      first: { clientHeight: 120, scrollHeight: 120 },
      second: { clientHeight: 120, scrollHeight: 120 },
    };
    mockLaneMetrics(metrics);

    const { container, rerender } = render(<BoundedScrollShell />);
    const lanes = container.querySelectorAll<HTMLElement>(BOUNDED_SCROLL_SELECTOR);

    expect(Array.from(lanes).every((lane) => lane.hasAttribute(BOUNDED_SCROLL_END_ATTR))).toBe(
      true,
    );
    expect(
      Array.from(lanes).every((lane) => !lane.hasAttribute(BOUNDED_SCROLL_OVERFLOW_ATTR)),
    ).toBe(true);

    metrics.first.scrollHeight = 240;
    metrics.second.scrollHeight = 180;
    rerender(<BoundedScrollShell inputWidth="20ch" />);

    await waitFor(() => {
      expect(
        Array.from(lanes).every((lane) => lane.hasAttribute(BOUNDED_SCROLL_OVERFLOW_ATTR)),
      ).toBe(true);
      expect(Array.from(lanes).every((lane) => !lane.hasAttribute(BOUNDED_SCROLL_END_ATTR))).toBe(
        true,
      );
    });
  });

  it("refreshes every bounded lane after the shell root regains layout dimensions", () => {
    const observedTargets = new Set<Element>();
    let triggerResize: (target: Element) => void = (_target) => {
      throw new Error("ResizeObserver was not constructed");
    };

    class TestResizeObserver implements ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        triggerResize = (target: Element) => {
          if (!observedTargets.has(target)) {
            throw new Error("ResizeObserver target was not observed");
          }
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

    const { container } = render(<BoundedScrollShell />);
    const shellRoot = container.querySelector<HTMLElement>("[data-assessment-shell]");
    const lanes = container.querySelectorAll<HTMLElement>(BOUNDED_SCROLL_SELECTOR);

    expect(shellRoot).not.toBeNull();
    expect(observedTargets.has(shellRoot!)).toBe(true);
    expect(
      Array.from(lanes).every((lane) => !lane.hasAttribute(BOUNDED_SCROLL_OVERFLOW_ATTR)),
    ).toBe(true);

    metrics.first = { clientHeight: 120, scrollHeight: 240 };
    metrics.second = { clientHeight: 120, scrollHeight: 180 };
    triggerResize(shellRoot!);

    expect(Array.from(lanes).every((lane) => lane.hasAttribute(BOUNDED_SCROLL_OVERFLOW_ATTR))).toBe(
      true,
    );
    expect(Array.from(lanes).every((lane) => !lane.hasAttribute(BOUNDED_SCROLL_END_ATTR))).toBe(
      true,
    );
  });

  it("disconnects observers and lane listeners on unmount", () => {
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

    const { unmount } = render(<BoundedScrollShell />);
    unmount();

    expect(mutationDisconnect).toHaveBeenCalledTimes(1);
    expect(resizeDisconnect).toHaveBeenCalledTimes(1);
    expect(removeEventListener).toHaveBeenCalledWith("scroll", expect.any(Function));
  });
});
