import { afterEach, describe, expect, it } from "vite-plus/test";

import "@/editor/frame/view/bounded-placement.css";

import "../../view/region.css";

afterEach(() => {
  document.body.replaceChildren();
});

describe("Region vertical content geometry", () => {
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
