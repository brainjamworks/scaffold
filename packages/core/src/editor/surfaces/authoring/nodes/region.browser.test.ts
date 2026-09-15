import { afterEach, describe, expect, it } from "vite-plus/test";

import "@/editor/frame/view/bounded-placement.css";
import "@/editor/bounded-containers/view/bounded-container.css";
import "@/editor/layers/layer.css";

import "../../view/region.css";

const mountedStyles: HTMLStyleElement[] = [];

afterEach(() => {
  for (const style of mountedStyles.splice(0)) style.remove();
  document.body.replaceChildren();
});

describe("Region vertical content geometry", () => {
  it("allows adapter-layer overrides without losing Region geometry", () => {
    const adapterStyles = document.createElement("style");
    adapterStyles.textContent = `
      @layer sc-adapters {
        .sc-region {
          gap: 1px;
        }
      }
    `;
    document.head.append(adapterStyles);
    mountedStyles.push(adapterStyles);

    const region = document.createElement("div");
    region.className = "sc-region";
    document.body.append(region);

    const style = getComputedStyle(region);
    expect(style.display).toBe("grid");
    expect(style.containerType).toBe("size");
    expect(style.gap).toBe("1px");
  });

  it.each([
    ["top", 0],
    ["middle", 80],
    ["bottom", 160],
  ] as const)("positions %s content in the available Region height", (position, expectedTop) => {
    const region = document.createElement("div");
    region.className = "sc-region";
    region.dataset.verticalContentPosition = position;
    region.style.cssText =
      "--sc-region-inset: 0; --sc-region-flow-gap: 0; width: 200px; height: 200px;";

    const content = document.createElement("div");
    content.style.height = "40px";
    region.append(content);
    document.body.append(region);

    expect(content.getBoundingClientRect().top - region.getBoundingClientRect().top).toBeCloseTo(
      expectedTop,
      0,
    );
  });

  it("fills through the active authoring content wrapper shape", () => {
    const region = document.createElement("div");
    region.className = "sc-region";
    region.style.cssText =
      "--sc-region-inset: 4px; --sc-region-flow-gap: 0; width: 200px; height: 200px;";

    const scrollFrame = document.createElement("div");
    scrollFrame.dataset.boundedScrollFrame = "";

    const nodeViewContent = document.createElement("div");
    nodeViewContent.className = "sc-region__content";
    nodeViewContent.dataset.nodeViewContent = "";
    nodeViewContent.dataset.boundedScroll = "";

    const nodeViewContentReact = document.createElement("div");
    nodeViewContentReact.dataset.nodeViewContentReact = "";

    const layerRenderer = document.createElement("div");
    layerRenderer.className = "react-renderer";
    const layer = document.createElement("div");
    layer.className = "sc-layer";
    layer.dataset.layerState = "active";
    layer.dataset.layerComposition = "fill";
    const layerContent = document.createElement("div");
    layerContent.dataset.nodeViewContent = "";
    const layerContentReact = document.createElement("div");
    layerContentReact.dataset.nodeViewContentReact = "";
    const blockRenderer = document.createElement("div");
    blockRenderer.className = "react-renderer";
    const resizeContainer = document.createElement("div");
    resizeContainer.dataset.boundedPlacement = "fill";
    resizeContainer.dataset.resizeContainer = "";

    const intrinsicContent = document.createElement("div");
    intrinsicContent.style.height = "40px";

    resizeContainer.append(intrinsicContent);
    blockRenderer.append(resizeContainer);
    layerContentReact.append(blockRenderer);
    layerContent.append(layerContentReact);
    layer.append(layerContent);
    layerRenderer.append(layer);
    nodeViewContentReact.append(layerRenderer);
    nodeViewContent.append(nodeViewContentReact);
    scrollFrame.append(nodeViewContent);
    region.append(scrollFrame);
    document.body.append(region);

    expect(getComputedStyle(region).alignContent).toBe("stretch");
    expect(resizeContainer.getBoundingClientRect().height).toBeCloseTo(192, 0);
  });

  it("top-aligns overflowing content that would otherwise be vertically centred", () => {
    const region = document.createElement("div");
    region.className = "sc-region";
    region.dataset.verticalContentPosition = "middle";
    region.style.cssText =
      "--sc-region-inset: 0; --sc-region-flow-gap: 0; width: 200px; height: 200px;";

    const content = document.createElement("div");
    content.className = "sc-region__content";
    content.dataset.boundedScroll = "";
    content.dataset.boundedScrollOverflow = "";
    content.style.height = "100%";

    const oversizedContent = document.createElement("div");
    oversizedContent.style.height = "240px";
    content.append(oversizedContent);
    region.append(content);
    document.body.append(region);

    expect(getComputedStyle(content).alignContent).toBe("safe center");
    expect(oversizedContent.getBoundingClientRect().top).toBeCloseTo(
      region.getBoundingClientRect().top,
      0,
    );
  });
});
