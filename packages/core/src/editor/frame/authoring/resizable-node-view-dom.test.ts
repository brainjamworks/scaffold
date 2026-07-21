// @vitest-environment jsdom

import { describe, expect, it } from "vite-plus/test";

import {
  applyReactNodeViewElementDefaults,
  applyResizableNodeViewDomDefaults,
} from "./resizable-node-view-dom";

describe("resizable node view DOM defaults", () => {
  it("allows every frame shell to shrink inside grid and flex containers", () => {
    const element = document.createElement("div");
    const dom = document.createElement("div");
    const wrapper = document.createElement("div");

    applyReactNodeViewElementDefaults(element);
    applyResizableNodeViewDomDefaults({ dom, wrapper });

    expect(element.style.minWidth).toBe("0px");
    expect(dom.style.minWidth).toBe("0px");
    expect(wrapper.style.minWidth).toBe("0px");
  });
});
