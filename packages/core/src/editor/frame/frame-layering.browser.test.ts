import { afterEach, describe, expect, it } from "vite-plus/test";

import "@/editor/bounded-containers/view/bounded-container.css";
import "@/editor/drag/view/drop-indicator.css";
import "@/editor/drag/view/movement-handles.css";
import "./authoring/resize/resize-frame.css";
import "./view/bounded-placement.css";

const mountedStyles: HTMLStyleElement[] = [];

afterEach(() => {
  for (const style of mountedStyles.splice(0)) style.remove();
  document.body.replaceChildren();
});

describe("Frame cascade layering", () => {
  it("allows adapter overflow overrides on bounded viewports", () => {
    mountAdapterStyles(`
      [data-node="region"] [data-bounded-placement="fill"] [data-bounded-viewport] {
        overflow: visible;
      }
    `);

    const viewport = mountBoundedViewport();

    expect(getComputedStyle(viewport).overflow).toBe("visible");
  });

  it("allows adapter sizing overrides on bounded frames", () => {
    mountAdapterStyles(`
      [data-authoring-frame][data-bounded-placement="fill"] {
        max-height: none;
      }
    `);

    const frame = document.createElement("div");
    frame.dataset.authoringFrame = "block";
    frame.dataset.boundedPlacement = "fill";
    document.body.append(frame);

    expect(getComputedStyle(frame).maxHeight).toBe("none");
  });

  it("allows adapter overflow overrides on bounded resize containers", () => {
    mountAdapterStyles(`
      [data-resize-container][data-bounded-placement="fill"] {
        overflow: visible;
      }
    `);

    const container = document.createElement("div");
    container.dataset.resizeContainer = "";
    container.dataset.boundedPlacement = "fill";
    document.body.append(container);

    expect(getComputedStyle(container).overflow).toBe("visible");
  });

  it.each([
    ["[data-authoring-frame-wrapper-active]", "data-authoring-frame-wrapper-active"],
    [".sc-editor-movement-layer", "sc-editor-movement-layer"],
    [".sc-drop-indicator", "sc-drop-indicator"],
  ] as const)("allows adapter positioning overrides on %s", (selector, marker) => {
    mountAdapterStyles(`${selector} { position: static; }`);

    const chrome = document.createElement("div");
    if (marker.startsWith("data-")) {
      chrome.setAttribute(marker, "");
    } else {
      chrome.className = marker;
    }
    document.body.append(chrome);

    expect(getComputedStyle(chrome).position).toBe("static");
  });
});

function mountAdapterStyles(rules: string): void {
  const style = document.createElement("style");
  style.textContent = `@layer sc-adapters { ${rules} }`;
  document.head.append(style);
  mountedStyles.push(style);
}

function mountBoundedViewport(): HTMLDivElement {
  const region = document.createElement("div");
  region.dataset.node = "region";
  const placement = document.createElement("div");
  placement.dataset.boundedPlacement = "fill";
  const viewport = document.createElement("div");
  viewport.dataset.boundedViewport = "";
  placement.append(viewport);
  region.append(placement);
  document.body.append(region);
  return viewport;
}
