// @vitest-environment happy-dom

import { describe, expect, it } from "vite-plus/test";

import { applyNodeViewFrameStyle } from "./node-view-frame-style";

describe("applyNodeViewFrameStyle", () => {
  it("keeps responsive block content fluid", () => {
    const input = createFrameFixture({
      frame: {
        widthMode: "percent",
        widthPercent: 50,
      },
    });
    input.blockElement.style.height = "300px";
    input.blockElement.style.overflow = "hidden";
    input.blockElement.style.transform = "scale(0.5)";

    applyNodeViewFrameStyle({
      ...input,
      definition: { resizable: true, resizeMode: "responsive" },
      liveSize: null,
    });

    expect(input.wrapper.style.width).toBe("50%");
    expect(input.wrapper.style.minWidth).toBe("0");
    expect(input.blockElement.style.height).toBe("");
    expect(input.blockElement.style.overflow).toBe("");
    expect(input.blockElement.style.transform).toBe("");
  });

  it("projects freeform frame height while filling the block view", () => {
    const input = createFrameFixture({
      frame: {
        heightPx: 180,
        widthMode: "percent",
        widthPercent: 60,
      },
    });

    applyNodeViewFrameStyle({
      ...input,
      definition: {
        resizable: true,
        resizeMode: "freeform",
      },
      liveSize: null,
    });

    expect(input.wrapper.style.height).toBe("180px");
    expect(input.wrapper.style.width).toBe("60%");
    expect(input.blockElement.style.height).toBe("100%");
  });
});

function createFrameFixture({ frame }: { frame: unknown }) {
  const wrapper = document.createElement("div");
  const resizableDom = document.createElement("div");
  const nodeViewElement = document.createElement("div");
  const blockElement = document.createElement("div");
  return {
    blockElement,
    frame,
    nodeViewElement,
    resizableDom,
    wrapper,
  };
}
