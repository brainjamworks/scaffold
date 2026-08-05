import { afterEach, describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";
import { fireEvent } from "@testing-library/react";

import "@/styles/globals.css";

import {
  mountRuntimeDragHarness,
  type RuntimeDragBrowserHarness,
} from "./runtime-drag-browser-harness";

const mounted: RuntimeDragBrowserHarness[] = [];

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.dispose();
});

describe("runtime drag browser harness", () => {
  it("performs a Page drag through the published environment", async () => {
    await page.viewport(1024, 768);
    const harness = await mountRuntimeDragHarness({ surface: "page" });
    mounted.push(harness);

    expect(harness.player.dataset.runtimePlayer).toBe("page");
    expect(harness.player.ownerDocument).toBe(harness.ownerDocument);
    expect(harness.getEnvironment().status).toBe("ready");
    expect(harness.getEnvironment().ownerDocument).toBe(harness.ownerDocument);
    expect(harness.getEnvironment().ownerWindow).toBe(harness.ownerWindow);
    expect(harness.getEnvironment().positionStrategy).toBe("fixed");
    const source = harness.getSource();
    const target = harness.getTargets()[0];
    expect(source).not.toBeNull();
    expect(target).not.toBeNull();
    await dragPointer(harness, source!, target!);
    await harness.waitForResult("dropped");
    expect(harness.getResult()).toBe("dropped");
    expect(harness.getPlaceholder()).toBeNull();
    expect(harness.getOverlayHost()).not.toBeNull();
    expect(harness.getCanvas()).toBeNull();
  });

  it.each([0.5, 0.83, 1, 2])("performs a transformed Slideshow drag at scale %s", async (scale) => {
    await page.viewport(Math.max(1024, Math.ceil(scale * 1024 + 100)), 900);
    const harness = await mountRuntimeDragHarness({ surface: "slideshow", scale });
    mounted.push(harness);

    const canvas = harness.getCanvas();
    expect(canvas).not.toBeNull();
    expect(harness.getCanvasRect().width).toBeGreaterThan(0);
    expect(harness.getCanvasRect().height).toBeGreaterThan(0);
    expect(harness.getEnvironment().reason).toBeUndefined();
    expect(harness.getEnvironment().status).toBe("ready");
    expect(harness.getEnvironment().ownerDocument).toBe(harness.ownerDocument);
    expect(harness.getEnvironment().ownerWindow).toBe(harness.ownerWindow);
    expect(harness.getCanvasRect().width / 1024).toBeCloseTo(scale, 1);
    expect(harness.getCanvasRect().height / 576).toBeCloseTo(scale, 1);
    await dragPointer(harness, harness.getSource()!, harness.getTargets()[0]!);
    await harness.waitForResult("dropped");
    expect(harness.getResult()).toBe("dropped");
    expect(harness.getPlaceholder()).toBeNull();
  });

  it("keeps two harnesses scoped to their own environments", async () => {
    await page.viewport(1024, 768);
    const first = await mountRuntimeDragHarness({ surface: "page" });
    const second = await mountRuntimeDragHarness({ surface: "page" });
    mounted.push(first, second);

    expect(first.getOverlayHost()).not.toBe(second.getOverlayHost());
    expect(first.getSource()).not.toBe(second.getSource());
    expect(first.getTargets()[0]).not.toBe(second.getTargets()[0]);
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

async function dragPointer(
  harness: RuntimeDragBrowserHarness,
  source: HTMLElement,
  target: HTMLElement,
): Promise<void> {
  const sourceRect = source.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  fireEvent.pointerDown(source, {
    buttons: 1,
    clientX: sourceRect.left + 10,
    clientY: sourceRect.top + 10,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  fireEvent.pointerMove(harness.ownerDocument, {
    buttons: 1,
    clientX: targetRect.left + 10,
    clientY: targetRect.top + 10,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  await new Promise<void>((resolve) => harness.ownerWindow.requestAnimationFrame(() => resolve()));
  fireEvent.pointerUp(harness.ownerDocument, {
    buttons: 0,
    clientX: targetRect.left + 10,
    clientY: targetRect.top + 10,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
}
