import { afterEach, describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";

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
  it("mounts a Page with an explicit owner-document environment host", async () => {
    await page.viewport(1024, 768);
    const harness = await mountRuntimeDragHarness({ surface: "page" });
    mounted.push(harness);

    expect(harness.player.dataset.runtimePlayer).toBe("page");
    expect(harness.player.ownerDocument).toBe(harness.ownerDocument);
    expect(harness.getOverlayHost()).not.toBeNull();
    expect(harness.getOverlayHost()?.ownerDocument).toBe(harness.ownerDocument);
    expect(harness.getCanvas()).toBeNull();
  });

  it("mounts a transformed Slideshow canvas with its physical host outside the canvas", async () => {
    await page.viewport(1024, 768);
    const harness = await mountRuntimeDragHarness({ surface: "slideshow", scale: 0.5 });
    mounted.push(harness);

    const canvas = harness.getCanvas();
    const overlayHost = harness.getOverlayHost();
    expect(canvas).not.toBeNull();
    expect(canvas?.style.width).toBe("1024px");
    expect(canvas?.style.height).toBe("576px");
    expect(canvas?.contains(overlayHost)).toBe(false);
    expect(overlayHost?.ownerDocument).toBe(harness.ownerDocument);
  });
});
