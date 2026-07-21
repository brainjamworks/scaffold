// @vitest-environment happy-dom

import { describe, expect, it } from "vite-plus/test";

import { zIndex } from "@/ui/overlays/z-index";

import { syncBubbleFloatingRoot, syncBubbleFloatingRootAtZIndex } from "./bubble-anchor";

describe("syncBubbleFloatingRoot", () => {
  it("styles the bubble and floating wrapper without promoting editor content", () => {
    const prose = document.createElement("div");
    const floating = document.createElement("div");
    const wrapper = document.createElement("div");
    const bubble = document.createElement("div");

    prose.className = "prose";
    floating.style.position = "fixed";

    wrapper.append(bubble);
    floating.append(wrapper);
    prose.append(floating);
    document.body.append(prose);

    syncBubbleFloatingRoot(bubble);

    expect(bubble.style.zIndex).toBe(String(zIndex.editorBubble));
    expect(floating.style.zIndex).toBe(String(zIndex.editorBubble));
    expect(prose.style.zIndex).toBe("");
    expect(prose.style.overflow).toBe("");
  });

  it("allows callers to use a distinct bubble layer", () => {
    const floating = document.createElement("div");
    const bubble = document.createElement("div");

    floating.style.position = "fixed";
    floating.append(bubble);
    document.body.append(floating);

    syncBubbleFloatingRootAtZIndex(bubble, zIndex.editorTextBubble);

    expect(bubble.style.zIndex).toBe(String(zIndex.editorTextBubble));
    expect(floating.style.zIndex).toBe(String(zIndex.editorTextBubble));
  });

  it("preserves the owner host clipping and neutral layer while styling a floating root", () => {
    const host = document.createElement("div");
    const floating = document.createElement("div");
    const bubble = document.createElement("div");

    host.dataset.scaffoldOverlayHost = "";
    host.style.overflow = "clip";
    host.style.position = "absolute";
    floating.style.position = "absolute";
    floating.append(bubble);
    host.append(floating);
    document.body.append(host);

    syncBubbleFloatingRoot(floating);

    expect(floating.style.overflow).toBe("visible");
    expect(floating.style.zIndex).toBe(String(zIndex.editorBubble));
    expect(host.style.overflow).toBe("clip");
    expect(host.style.zIndex).toBe("");
  });
});
