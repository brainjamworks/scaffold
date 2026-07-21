// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vite-plus/test";

import { AUTHORING_CHROME_ATTR } from "./authoring-chrome";
import { registerOverlayHostOwner } from "./overlay-ownership";
import {
  isUnconsumedOverlayDismissKey,
  shouldDismissEphemeralInteractionTarget,
} from "./interaction-dismissal";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("shouldDismissEphemeralInteractionTarget", () => {
  it("dismisses for targets outside preserved chrome", () => {
    const editorRoot = document.createElement("div");
    const outside = document.createElement("div");
    document.body.append(editorRoot, outside);

    expect(shouldDismissEphemeralInteractionTarget(editorRoot, outside)).toBe(true);
    expect(shouldDismissEphemeralInteractionTarget(editorRoot, null)).toBe(true);
  });

  it("preserves for targets inside the editor and its registered host", () => {
    const editorRoot = document.createElement("div");
    const editorButton = document.createElement("button");
    editorRoot.append(editorButton);
    const host = document.createElement("div");
    const inner = document.createElement("button");
    host.appendChild(inner);
    document.body.append(editorRoot, host);
    const unregister = registerOverlayHostOwner(editorRoot, host);

    expect(shouldDismissEphemeralInteractionTarget(editorRoot, editorButton)).toBe(false);
    expect(shouldDismissEphemeralInteractionTarget(editorRoot, inner)).toBe(false);

    unregister();
  });

  it("dismisses for an unowned marked chrome or dialog lookalike", () => {
    const editorRoot = document.createElement("div");
    const chrome = document.createElement("div");
    chrome.setAttribute(AUTHORING_CHROME_ATTR, "popover");
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const dialogChild = document.createElement("input");
    dialog.appendChild(dialogChild);
    document.body.append(editorRoot, chrome, dialog);

    expect(shouldDismissEphemeralInteractionTarget(editorRoot, chrome)).toBe(true);
    expect(shouldDismissEphemeralInteractionTarget(editorRoot, dialogChild)).toBe(true);
  });
});

describe("isUnconsumedOverlayDismissKey", () => {
  it("accepts Escape only", () => {
    expect(isUnconsumedOverlayDismissKey({ defaultPrevented: false, key: "Escape" })).toBe(true);
    expect(isUnconsumedOverlayDismissKey({ defaultPrevented: false, key: "Enter" })).toBe(false);
    expect(isUnconsumedOverlayDismissKey({ defaultPrevented: false, key: "a" })).toBe(false);
    expect(isUnconsumedOverlayDismissKey(null)).toBe(false);
    expect(isUnconsumedOverlayDismissKey(undefined)).toBe(false);
  });

  it("rejects an Escape already consumed by a child overlay", () => {
    expect(isUnconsumedOverlayDismissKey({ defaultPrevented: true, key: "Escape" })).toBe(false);
  });
});
