// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { installWheelScrollForwarding, readDocumentHeight } from "./mount-inner-lifecycle";

describe("readDocumentHeight", () => {
  beforeEach(() => {
    setElementBox(document.documentElement, { scrollHeight: 900, offsetHeight: 880 });
    setElementBox(document.body, { scrollHeight: 860, offsetHeight: 840 });
  });

  it("uses a short rendered root instead of viewport-sized document boxes", () => {
    const root = document.createElement("div");
    document.body.append(root);
    setElementBox(root, { scrollHeight: 148, offsetHeight: 144, clientHeight: 140 });

    expect(readDocumentHeight(root)).toBe(148);
  });

  it("allows an empty rendered root to report zero", () => {
    const root = document.createElement("div");
    document.body.append(root);
    setElementBox(root, { scrollHeight: 0, offsetHeight: 0, clientHeight: 0 });

    expect(readDocumentHeight(root)).toBe(0);
  });

  it("reports the full height of a tall rendered root", () => {
    const root = document.createElement("div");
    document.body.append(root);
    setElementBox(root, { scrollHeight: 1077, offsetHeight: 1060, clientHeight: 1050 });

    expect(readDocumentHeight(root)).toBe(1077);
  });
});

describe("installWheelScrollForwarding", () => {
  it("forwards otherwise unconsumed vertical wheel movement", () => {
    const requestHostScroll = vi.fn();
    const cleanup = installWheelScrollForwarding(document, requestHostScroll);
    const target = document.createElement("div");
    document.body.append(target);
    const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 84 });

    target.dispatchEvent(event);

    expect(requestHostScroll).toHaveBeenCalledWith(84);
    expect(event.defaultPrevented).toBe(true);
    cleanup();
  });

  it("leaves movement with a nested region that can scroll in that direction", () => {
    const requestHostScroll = vi.fn();
    const cleanup = installWheelScrollForwarding(document, requestHostScroll);
    const region = scrollableRegion({ scrollTop: 40 });
    const target = document.createElement("div");
    region.append(target);
    document.body.append(region);
    const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 84 });

    target.dispatchEvent(event);

    expect(requestHostScroll).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    cleanup();
  });

  it("forwards movement after a nested region reaches its boundary", () => {
    const requestHostScroll = vi.fn();
    const cleanup = installWheelScrollForwarding(document, requestHostScroll);
    const region = scrollableRegion({ scrollTop: 200 });
    const target = document.createElement("div");
    region.append(target);
    document.body.append(region);
    const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 84 });

    target.dispatchEvent(event);

    expect(requestHostScroll).toHaveBeenCalledWith(84);
    expect(event.defaultPrevented).toBe(true);
    cleanup();
  });

  it("does not intercept browser zoom gestures", () => {
    const requestHostScroll = vi.fn();
    const cleanup = installWheelScrollForwarding(document, requestHostScroll);
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: 84,
    });

    document.body.dispatchEvent(event);

    expect(requestHostScroll).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    cleanup();
  });

  it("does not intercept horizontal wheel gestures", () => {
    const requestHostScroll = vi.fn();
    const cleanup = installWheelScrollForwarding(document, requestHostScroll);
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaX: 84,
      deltaY: 12,
    });

    document.body.dispatchEvent(event);

    expect(requestHostScroll).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    cleanup();
  });
});

function setElementBox(
  element: Element,
  dimensions: Partial<Record<"scrollHeight" | "offsetHeight" | "clientHeight", number>>,
): void {
  for (const [property, value] of Object.entries(dimensions)) {
    Object.defineProperty(element, property, {
      configurable: true,
      value,
    });
  }
}

function scrollableRegion({ scrollTop }: { scrollTop: number }): HTMLElement {
  const region = document.createElement("div");
  region.style.overflowY = "auto";
  setElementBox(region, { scrollHeight: 300, clientHeight: 100 });
  Object.defineProperty(region, "scrollTop", {
    configurable: true,
    writable: true,
    value: scrollTop,
  });
  return region;
}
