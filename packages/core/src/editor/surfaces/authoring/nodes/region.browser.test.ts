import { afterEach, describe, expect, it } from "vite-plus/test";

import "@/editor/frame/view/bounded-placement.css";

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

  it("centres content in the available Region height", () => {
    const region = document.createElement("div");
    region.className = "sc-region";
    region.dataset.verticalContentPosition = "middle";
    region.style.cssText =
      "--sc-region-inset: 0; --sc-region-flow-gap: 0; width: 200px; height: 200px;";

    const content = document.createElement("div");
    content.style.height = "40px";
    region.append(content);
    document.body.append(region);

    expect(content.getBoundingClientRect().top - region.getBoundingClientRect().top).toBeCloseTo(
      80,
      0,
    );
  });

  it("fills through the active authoring content wrapper shape", () => {
    const region = document.createElement("div");
    region.className = "sc-region";
    region.style.cssText =
      "--sc-region-inset: 4px; --sc-region-flow-gap: 0; width: 200px; height: 200px;";

    const nodeViewContent = document.createElement("div");
    nodeViewContent.className = "sc-region__content";
    nodeViewContent.dataset.nodeViewContent = "";

    const nodeViewContentReact = document.createElement("div");
    nodeViewContentReact.dataset.nodeViewContentReact = "";

    const resizeContainer = document.createElement("div");
    resizeContainer.dataset.boundedPlacement = "fill";
    resizeContainer.dataset.resizeContainer = "";

    const intrinsicContent = document.createElement("div");
    intrinsicContent.style.height = "40px";

    resizeContainer.append(intrinsicContent);
    nodeViewContentReact.append(resizeContainer);
    nodeViewContent.append(nodeViewContentReact);
    region.append(nodeViewContent);
    document.body.append(region);

    expect(getComputedStyle(region).alignContent).toBe("stretch");
    expect(resizeContainer.getBoundingClientRect().height).toBeCloseTo(192, 0);
  });
});
