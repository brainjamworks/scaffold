import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";

import { OverlayBoundary } from "@/ui/components/OverlayBoundary/OverlayBoundary";

import { EditorFloatingLayer, type EditorFloatingLayerEditor } from "./EditorFloatingLayer";

let root: Root | null = null;
let host: HTMLElement | null = null;
let mountNode: HTMLElement | null = null;

afterEach(() => {
  root?.unmount();
  host?.remove();
  root = null;
  host = null;
  mountNode = null;
});

describe("EditorFloatingLayer pointer contract", () => {
  it("keeps the full-surface floating root click-through while floating content stays interactive", async () => {
    await page.viewport(640, 480);

    host = document.createElement("section");
    host.style.cssText =
      "position: fixed; inset: 0; width: 640px; height: 480px; background: white;";

    const canvasTarget = document.createElement("button");
    canvasTarget.textContent = "Canvas target";
    canvasTarget.style.cssText =
      "position: absolute; left: 80px; top: 80px; width: 160px; height: 80px;";

    mountNode = document.createElement("div");
    host.append(canvasTarget, mountNode);
    document.body.append(host);

    const editor: EditorFloatingLayerEditor = { view: { dom: host } };
    root = createRoot(mountNode);
    root.render(
      <OverlayBoundary container={host} kind="viewport">
        <EditorFloatingLayer editor={editor}>
          <span>mounted editor child</span>
        </EditorFloatingLayer>
      </OverlayBoundary>,
    );

    const layer = await waitForElement<HTMLElement>(host, "[data-scaffold-editor-floating-layer]");

    expect(layer.dataset.scaffoldOverlayClickThroughRoot).toBe("");
    expect(getComputedStyle(layer).pointerEvents).toBe("none");
    expect(document.elementFromPoint(100, 100)).toBe(canvasTarget);

    const floatingControl = document.createElement("button");
    floatingControl.className = "sc-editor-floating-content";
    floatingControl.textContent = "Floating control";
    floatingControl.style.cssText =
      "position: absolute; left: 80px; top: 80px; width: 160px; height: 80px;";
    layer.append(floatingControl);

    expect(getComputedStyle(floatingControl).pointerEvents).toBe("auto");
    expect(document.elementFromPoint(100, 100)).toBe(floatingControl);
  });
});

async function waitForElement<T extends Element>(rootElement: ParentNode, selector: string) {
  const deadline = performance.now() + 5_000;
  while (performance.now() < deadline) {
    const element = rootElement.querySelector<T>(selector);
    if (element) return element;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  throw new Error(`Timed out waiting for ${selector}`);
}
