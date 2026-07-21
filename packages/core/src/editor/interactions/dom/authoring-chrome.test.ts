// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  AUTHORING_CHROME_ATTR,
  authoringChromeAttributes,
  AuthoringChromeKind,
  isAuthoringChromeSessionActive,
  isAuthoringChromeTarget,
  shouldRenderAuthoringChrome,
} from "./authoring-chrome";
import { registerOverlayHostOwner } from "./overlay-ownership";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("neutral authoring chrome markers", () => {
  it("creates the chrome marker attribute for a chrome kind", () => {
    expect(authoringChromeAttributes(AuthoringChromeKind.Menu)).toEqual({
      [AUTHORING_CHROME_ATTR]: "menu",
    });
    expect(authoringChromeAttributes(AuthoringChromeKind.Resize)).toEqual({
      [AUTHORING_CHROME_ATTR]: "resize",
    });
  });

  it("detects targets inside marked authoring chrome", () => {
    const chrome = document.createElement("div");
    chrome.setAttribute(AUTHORING_CHROME_ATTR, "bubble");
    const inner = document.createElement("button");
    chrome.appendChild(inner);
    document.body.appendChild(chrome);

    expect(isAuthoringChromeTarget(inner)).toBe(true);
    expect(isAuthoringChromeTarget(document.body)).toBe(false);
    expect(isAuthoringChromeTarget(null)).toBe(false);
  });

  it("does not classify unowned dialog and popper lookalikes as authoring chrome", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const dialogChild = document.createElement("input");
    dialog.appendChild(dialogChild);
    document.body.appendChild(dialog);

    const popper = document.createElement("div");
    popper.setAttribute("data-radix-popper-content-wrapper", "");
    const popperChild = document.createElement("button");
    popper.appendChild(popperChild);
    document.body.appendChild(popper);

    expect(isAuthoringChromeTarget(dialogChild)).toBe(false);
    expect(isAuthoringChromeTarget(popperChild)).toBe(false);
  });

  it("treats focus inside the editor root as an active chrome session", () => {
    const editorRoot = document.createElement("div");
    const field = document.createElement("input");
    editorRoot.appendChild(field);
    document.body.appendChild(editorRoot);
    field.focus();

    expect(isAuthoringChromeSessionActive(editorRoot)).toBe(true);
    expect(shouldRenderAuthoringChrome(editorRoot, true)).toBe(true);
    expect(shouldRenderAuthoringChrome(editorRoot, false)).toBe(false);
  });

  it("treats focus inside a registered editor host as active", () => {
    const editorRoot = document.createElement("div");
    document.body.appendChild(editorRoot);

    const portalHost = document.createElement("div");
    const portalButton = document.createElement("button");
    portalHost.appendChild(portalButton);
    document.body.appendChild(portalHost);
    const unregister = registerOverlayHostOwner(editorRoot, portalHost);
    portalButton.focus();

    expect(isAuthoringChromeSessionActive(editorRoot)).toBe(true);
    expect(shouldRenderAuthoringChrome(editorRoot, true)).toBe(true);

    unregister();
  });

  it("does not share focused host membership with a sibling editor", () => {
    const firstRoot = document.createElement("div");
    const secondRoot = document.createElement("div");
    const firstHost = document.createElement("div");
    const secondHost = document.createElement("div");
    const secondButton = document.createElement("button");
    secondHost.append(secondButton);
    document.body.append(firstRoot, secondRoot, firstHost, secondHost);
    const unregisterFirst = registerOverlayHostOwner(firstRoot, firstHost);
    const unregisterSecond = registerOverlayHostOwner(secondRoot, secondHost);
    secondButton.focus();

    expect(isAuthoringChromeSessionActive(firstRoot)).toBe(false);
    expect(isAuthoringChromeSessionActive(secondRoot)).toBe(true);

    unregisterFirst();
    unregisterSecond();
  });

  it("treats focus outside the editor and chrome as inactive", () => {
    const editorRoot = document.createElement("div");
    document.body.appendChild(editorRoot);

    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();

    expect(isAuthoringChromeSessionActive(editorRoot)).toBe(false);
    expect(shouldRenderAuthoringChrome(editorRoot, true)).toBe(false);
  });
});
