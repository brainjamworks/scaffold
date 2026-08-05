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

describe("Sequencing shared drag runtime", () => {
  it("reorders a Page sequence with one activation handle per row", async () => {
    await page.viewport(1024, 768);
    const harness = await mountRuntimeDragHarness({ surface: "page" });
    mounted.push(harness);

    expect(harness.getEnvironment().status).toBe("ready");
    expect(harness.getActivationAreas()).toHaveLength(3);
    const before = harness.getResponseOrder();
    expect(before).toHaveLength(3);
    const source = harness.getSource()!;
    const target = harness.getTargets()[1]!;
    await dragPointer(harness, source, target, false);
    expect(harness.getPlaceholder()).not.toBeNull();
    const overlay = harness.getOverlayHost()?.querySelector<HTMLElement>(
      "[data-interaction-drag-overlay]",
    );
    expect(overlay).not.toBeNull();
    expect(overlay?.querySelector("[data-runtime-sequencing-handle]")).toBeNull();
    await finishPointerDrag(harness, target);
    await harness.waitForResult("dropped");

    expect(harness.getResponseOrder()).not.toEqual(before);
    expect(harness.getPlaceholder()).toBeNull();
  });

  it.each([0.5, 0.83, 1, 2])(
    "keeps Sequencing overlay and local displacement aligned at Slideshow scale %s",
    async (scale) => {
      await page.viewport(Math.max(1024, Math.ceil(scale * 1024 + 100)), 900);
      const harness = await mountRuntimeDragHarness({ surface: "slideshow", scale });
      mounted.push(harness);

      expect(harness.getCanvasRect().width / 1024).toBeCloseTo(scale, 1);
      expect(harness.getEnvironment().status).toBe("ready");
      const source = harness.getSource()!;
      const target = harness.getTargets()[2]!;
      await dragPointer(harness, source, target, false);

      const overlay = harness.getOverlayHost()?.querySelector<HTMLElement>(
        "[data-interaction-drag-overlay]",
      );
      if (overlay) {
        expect(overlay.querySelector("[data-runtime-sequencing-handle]")).toBeNull();
        expect(overlay.querySelector("button")).toBeNull();
      }
      expect(harness.getActivationAreas()).toHaveLength(3);

      await finishPointerDrag(harness, target);
      await harness.waitForResult("dropped");
      expect(harness.getResponseOrder()).toHaveLength(3);
    },
  );

  it("cancels without a response write and restores focus", async () => {
    await page.viewport(1024, 768);
    const harness = await mountRuntimeDragHarness({ surface: "page" });
    mounted.push(harness);
    const source = harness.getSource()!;
    const before = harness.getResponseOrder();
    source.focus();
    fireEvent.keyDown(harness.ownerDocument, { key: "Escape" });

    await new Promise<void>((resolve) => harness.ownerWindow.requestAnimationFrame(() => resolve()));
    expect(harness.getPlaceholder()).toBeNull();
    expect(harness.getResponseOrder()).toEqual(before);
    expect(harness.ownerDocument.activeElement).toBe(source);
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
  finish = true,
): Promise<void> {
  const sourceRect = source.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  fireEvent.pointerDown(source, {
    button: 0,
    buttons: 1,
    clientX: sourceRect.left + sourceRect.width / 2,
    clientY: sourceRect.top + sourceRect.height / 2,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  fireEvent.pointerMove(harness.ownerDocument, {
    button: 0,
    buttons: 1,
    clientX: targetRect.left + targetRect.width / 2,
    clientY: targetRect.top + targetRect.height / 2,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  fireEvent.pointerMove(harness.ownerDocument, {
    button: 0,
    buttons: 1,
    clientX: targetRect.left + targetRect.width / 2 + 2,
    clientY: targetRect.top + targetRect.height / 2 + 2,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  await new Promise<void>((resolve) => harness.ownerWindow.requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => harness.ownerWindow.requestAnimationFrame(() => resolve()));
  if (finish) await finishPointerDrag(harness, target);
}

async function finishPointerDrag(harness: RuntimeDragBrowserHarness, target: HTMLElement) {
  const targetRect = target.getBoundingClientRect();
  fireEvent.pointerUp(harness.ownerDocument, {
    buttons: 0,
    clientX: targetRect.left + targetRect.width / 2,
    clientY: targetRect.top + targetRect.height / 2,
    isPrimary: true,
    pointerId: 1,
  });
  await new Promise<void>((resolve) => harness.ownerWindow.requestAnimationFrame(() => resolve()));
}
