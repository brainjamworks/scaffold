import { fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";

import "@/styles/globals.css";

import {
  mountRuntimeDragHarness,
  type RuntimeDragBrowserHarness,
} from "./runtime-drag-browser-harness";

const mounted: RuntimeDragBrowserHarness[] = [];
let restoreReducedMotion: (() => void) | null = null;

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.dispose();
  restoreReducedMotion?.();
  restoreReducedMotion = null;
});

describe("Sequencing shared drag runtime", () => {
  it.each([
    { label: "Page", surface: "page" as const, scale: 1, targetClientSize: 44 },
    { label: "Slideshow 0.5", surface: "slideshow" as const, scale: 0.5, targetClientSize: 27.5 },
    { label: "Slideshow 0.8", surface: "slideshow" as const, scale: 0.8, targetClientSize: 44 },
    { label: "Slideshow 0.83", surface: "slideshow" as const, scale: 0.83, targetClientSize: 44 },
    { label: "Slideshow 1", surface: "slideshow" as const, scale: 1, targetClientSize: 44 },
    { label: "Slideshow 2", surface: "slideshow" as const, scale: 2, targetClientSize: 44 },
  ])(
    "reorders exactly with hit-tested, scale-safe geometry on $label",
    async ({ surface, scale, targetClientSize }) => {
      await page.viewport(Math.max(1024, Math.ceil(scale * 1024 + 100)), 900);
      const harness = await mountRuntimeDragHarness({ surface, scale });
      mounted.push(harness);

      expect(harness.getEnvironment().status).toBe("ready");
      const clientScale = surface === "slideshow" ? harness.getCanvasRect().width / 1024 : 1;
      expect(clientScale).toBeCloseTo(scale, 2);

      const targets = harness.getTargets();
      const activators = harness.getActivationAreas();
      const handles = harness.getTargets("[data-runtime-sequencing-handle]");
      const before = harness.getResponseOrder();
      expect(targets.map((target) => target.dataset.itemId)).toEqual(before);
      expect(harness.getResponseRevision()).toBe(0);
      assertActivationGeometry(harness, activators, handles, targetClientSize);

      const sourceRect = targets[0]!.getBoundingClientRect();
      const siblingRect = targets[1]!.getBoundingClientRect();
      const list = targets[0]!.parentElement!;
      const listRect = list.getBoundingClientRect();
      const sourceListOffset = sourceRect.top - listRect.top;
      const siblingListOffset = siblingRect.top - listRect.top;
      const drag = await startPointerDrag(
        harness,
        activators[0]!,
        centerOf(targets[2]!.getBoundingClientRect()),
        scale === 0.5 ? "touch" : "mouse",
      );

      const placeholder = harness.getPlaceholder();
      expect(placeholder).toBe(targets[0]);
      expectClose(
        placeholder!.getBoundingClientRect().top - list.getBoundingClientRect().top,
        sourceListOffset,
        1,
      );
      expect(harness.ownerWindow.getComputedStyle(placeholder!).visibility).toBe("visible");
      expect(harness.ownerWindow.getComputedStyle(placeholder!).pointerEvents).toBe("none");
      expect(
        harness.ownerWindow.getComputedStyle(
          placeholder!.querySelector<HTMLElement>(".sc-sequencing-item__content")!,
        ).visibility,
      ).toBe("hidden");
      const placeholderHandle = placeholder!.querySelector<HTMLElement>(
        "[data-runtime-sequencing-handle]",
      );
      expect(placeholderHandle).not.toBeNull();
      expect(harness.ownerWindow.getComputedStyle(placeholderHandle!).visibility).toBe("visible");

      const overlay = requiredOverlay(harness);
      expect(overlay.hasAttribute("inert")).toBe(true);
      expect(overlay.getAttribute("aria-hidden")).not.toBeNull();
      expect(overlay.querySelector("button, [data-runtime-sequencing-handle]")).toBeNull();
      const overlayRect = overlay.getBoundingClientRect();
      expectClose(overlayRect.width, sourceRect.width, 1);
      expectClose(overlayRect.height, sourceRect.height, 1);
      expectClose(overlayRect.left, sourceRect.left, 2);
      const expectedOverlayTop = drag.pointer.y - (drag.start.y - sourceRect.top);
      expectClose(overlayRect.top, expectedOverlayTop, 3);

      const siblingClientDisplacement =
        targets[1]!.getBoundingClientRect().top -
        list.getBoundingClientRect().top -
        siblingListOffset;
      const siblingLocalDisplacement = localTranslateY(targets[1]!);
      const renderedLocalDisplacement = renderedTranslateY(harness, targets[1]!);
      const normalizedRowPitch = (siblingRect.top - sourceRect.top) / clientScale;
      expect(Math.abs(siblingClientDisplacement)).toBeGreaterThan(1);
      expectClose(siblingClientDisplacement, renderedLocalDisplacement * clientScale, 1.5);
      expectClose(Math.abs(siblingLocalDisplacement), normalizedRowPitch, 2);

      const expected = [...before.slice(1), before[0]!];
      await finishPointerDrag(harness, drag.pointer, drag.pointerType);
      await harness.waitForResponse(expected, 1);
      await harness.waitForIdle();
      expect(harness.getResponseOrder()).toEqual(expected);
      expect(harness.getResponseRevision()).toBe(1);
      expect(harness.getPlaceholder()).toBeNull();
    },
  );

  it("reorders by keyboard, announces the move, restores focus, and disables motion", async () => {
    await page.viewport(1024, 768);
    restoreReducedMotion = emulateReducedMotionPreference();
    const harness = await mountRuntimeDragHarness({ surface: "page" });
    mounted.push(harness);

    const before = harness.getResponseOrder();
    const source = harness.getActivationAreas()[0]!;
    source.focus();
    fireEvent.keyDown(source, { code: "Space", key: " " });
    await animationFrames(harness, 2);
    expect(harness.getPlaceholder()).not.toBeNull();
    expect(requiredOverlay(harness)).not.toBeNull();
    expect(harness.getAnnouncements().join(" ")).toContain(
      "Drag sequencing item 1 is over Drag sequencing item 1.",
    );

    fireEvent.keyDown(source, { code: "ArrowDown", key: "ArrowDown" });
    await animationFrames(harness, 2);
    expect(harness.getAnnouncements().join(" ")).toContain(
      "Drag sequencing item 1 is over Drag sequencing item 2.",
    );
    const displaced = harness.getTargets().find((target) => localTranslateY(target) !== 0);
    expect(displaced).not.toBeUndefined();
    expect(displaced?.style.transition).toBe("");

    fireEvent.keyDown(source, { code: "Space", key: " " });
    const expected = [before[1]!, before[0]!, before[2]!];
    await harness.waitForResponse(expected, 1);
    await harness.waitForIdle();
    expect(harness.getResponseOrder()).toEqual(expected);
    expect(harness.getResponseRevision()).toBe(1);
    expect(harness.getAnnouncements().join(" ")).toContain("Dropped Drag sequencing item 1");
    expect(harness.ownerDocument.activeElement).toHaveAttribute("data-runtime-sequencing-handle");
  });

  it("cancels an active drag without a response write and restores focus", async () => {
    await page.viewport(1024, 768);
    const harness = await mountRuntimeDragHarness({ surface: "page" });
    mounted.push(harness);
    const source = harness.getActivationAreas()[0]!;
    const before = harness.getResponseOrder();
    source.focus();
    await startPointerDrag(
      harness,
      source,
      centerOf(harness.getTargets()[2]!.getBoundingClientRect()),
      "mouse",
    );
    expect(harness.getPlaceholder()).not.toBeNull();
    expect(requiredOverlay(harness)).not.toBeNull();

    fireEvent.keyDown(harness.ownerDocument, { code: "Escape", key: "Escape" });
    await harness.waitForIdle();
    expect(harness.getResponseOrder()).toEqual(before);
    expect(harness.getResponseRevision()).toBe(0);
    expect(harness.ownerDocument.activeElement).toBe(source);
    expect(harness.getAnnouncements().join(" ")).toContain(
      "Cancelled moving Drag sequencing item 1.",
    );
  });

  it("does not write when a completed drag never reaches a different target", async () => {
    await page.viewport(1024, 768);
    const harness = await mountRuntimeDragHarness({ surface: "page" });
    mounted.push(harness);
    const source = harness.getActivationAreas()[0]!;
    const sourceRect = source.getBoundingClientRect();
    const before = harness.getResponseOrder();
    const drag = await startPointerDrag(
      harness,
      source,
      { x: sourceRect.left + 2, y: sourceRect.top - 16 },
      "mouse",
    );
    expect(harness.getPlaceholder()).not.toBeNull();

    await finishPointerDrag(harness, drag.pointer, drag.pointerType);
    await harness.waitForIdle();
    expect(harness.getResponseOrder()).toEqual(before);
    expect(harness.getResponseRevision()).toBe(0);
  });

  it("fails closed for an unsupported Slideshow transform", async () => {
    await page.viewport(1024, 768);
    const harness = await mountRuntimeDragHarness({ surface: "slideshow", scale: 0.5 });
    mounted.push(harness);

    harness.setCanvasTransform("rotate(5deg)");
    await harness.waitForEnvironment("pending");
    expect(harness.getEnvironment().reason).toBe("invalid");
  });
});

function assertActivationGeometry(
  harness: RuntimeDragBrowserHarness,
  activators: readonly HTMLElement[],
  handles: readonly HTMLElement[],
  expectedClientSize: number,
) {
  expect(activators).toHaveLength(3);
  expect(handles).toHaveLength(3);
  const rects = activators.map((activator, index) => {
    expect(activator).toBe(handles[index]);
    expect(activator.tagName).toBe("BUTTON");
    const rect = activator.getBoundingClientRect();
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
    expectClose(rect.width, expectedClientSize, 0.75);
    expectClose(rect.height, expectedClientSize, 0.75);
    const hit = harness.ownerDocument.elementFromPoint(rect.left + 2, rect.top + rect.height / 2);
    expect(hit).not.toBeNull();
    expect(activator.contains(hit)).toBe(true);
    return rect;
  });
  for (let index = 1; index < rects.length; index += 1) {
    expect(rects[index - 1]!.bottom).toBeLessThanOrEqual(rects[index]!.top);
  }
}

async function startPointerDrag(
  harness: RuntimeDragBrowserHarness,
  source: HTMLElement,
  destination: Readonly<{ x: number; y: number }>,
  pointerType: "mouse" | "touch",
) {
  const sourceRect = source.getBoundingClientRect();
  const start = { x: sourceRect.left + 2, y: sourceRect.top + sourceRect.height / 2 };
  const hit = harness.ownerDocument.elementFromPoint(start.x, start.y);
  if (!(hit instanceof Element) || !source.contains(hit)) {
    throw new Error("Activation point did not hit the Sequencing activator.");
  }
  fireEvent.pointerDown(hit, {
    button: 0,
    buttons: 1,
    clientX: start.x,
    clientY: start.y,
    isPrimary: true,
    pointerId: 1,
    pointerType,
  });
  const activationDirection = destination.y >= start.y ? 1 : -1;
  fireEvent.pointerMove(harness.ownerDocument, {
    button: 0,
    buttons: 1,
    clientX: start.x,
    clientY: start.y + activationDirection * 6,
    isPrimary: true,
    pointerId: 1,
    pointerType,
  });
  await animationFrames(harness, 1);
  const pointer = { x: destination.x, y: destination.y + 2 };
  fireEvent.pointerMove(harness.ownerDocument, {
    button: 0,
    buttons: 1,
    clientX: destination.x,
    clientY: destination.y,
    isPrimary: true,
    pointerId: 1,
    pointerType,
  });
  fireEvent.pointerMove(harness.ownerDocument, {
    button: 0,
    buttons: 1,
    clientX: pointer.x,
    clientY: pointer.y,
    isPrimary: true,
    pointerId: 1,
    pointerType,
  });
  await animationFrames(harness, 2);
  return { pointer, pointerType, start };
}

async function finishPointerDrag(
  harness: RuntimeDragBrowserHarness,
  pointer: Readonly<{ x: number; y: number }>,
  pointerType: "mouse" | "touch",
) {
  fireEvent.pointerUp(harness.ownerDocument, {
    buttons: 0,
    clientX: pointer.x,
    clientY: pointer.y,
    isPrimary: true,
    pointerId: 1,
    pointerType,
  });
  await animationFrames(harness, 1);
}

function requiredOverlay(harness: RuntimeDragBrowserHarness): HTMLElement {
  const overlay = harness
    .getOverlayHost()
    ?.querySelector<HTMLElement>("[data-interaction-drag-overlay]");
  if (!overlay) throw new Error("Expected an active Sequencing drag overlay.");
  return overlay;
}

function centerOf(rect: DOMRect): Readonly<{ x: number; y: number }> {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function localTranslateY(element: HTMLElement): number {
  const match = element.style.transform.match(/translate3d\([^,]+,\s*(-?[\d.]+)px,\s*[^)]+\)/);
  return match ? Number(match[1]) : 0;
}

function renderedTranslateY(harness: RuntimeDragBrowserHarness, element: HTMLElement): number {
  const transform = harness.ownerWindow.getComputedStyle(element).transform;
  if (transform === "none") return 0;
  const values = transform
    .slice(transform.indexOf("(") + 1, -1)
    .split(",")
    .map(Number);
  return transform.startsWith("matrix3d(") ? (values[13] ?? 0) : (values[5] ?? 0);
}

function expectClose(actual: number, expected: number, tolerance: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

async function animationFrames(harness: RuntimeDragBrowserHarness, count: number) {
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>((resolve) =>
      harness.ownerWindow.requestAnimationFrame(() => resolve()),
    );
  }
}

function emulateReducedMotionPreference(): () => void {
  const original = window.matchMedia.bind(window);
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string): MediaQueryList => {
      const native = original(query);
      if (query !== "(prefers-reduced-motion: reduce)") return native;
      return new Proxy(native, {
        get(target, property) {
          if (property === "matches") return true;
          if (property === "media") return query;
          const value = Reflect.get(target, property);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    },
  });
  return () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: original,
    });
  };
}
