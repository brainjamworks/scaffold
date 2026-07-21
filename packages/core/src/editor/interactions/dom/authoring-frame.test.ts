// @vitest-environment happy-dom

import { describe, expect, it } from "vite-plus/test";

import {
  AUTHORING_CHROME_ACTIVE_ATTR,
  AUTHORING_FRAME_ATTR,
  authoringChromeActiveAttributes,
  authoringFrameSelector,
  cellAuthoringFrameAttributes,
  closestAuthoringFrameElement,
  courseBlockAuthoringFrameAttributes,
  gridAuthoringFrameAttributes,
  layoutAuthoringFrameAttributes,
  readAuthoringFrameDescriptor,
  resolveAuthoringFrameElement,
  sectionAuthoringFrameAttributes,
  structuralAuthoringFrameAttributes,
  surfaceAuthoringFrameAttributes,
} from "./authoring-frame";

describe("neutral authoring frame markers", () => {
  it("creates block frame attrs from node, definition, and stable id", () => {
    expect(
      courseBlockAuthoringFrameAttributes({
        blockId: "block-a",
        nodeType: "callout",
      }),
    ).toEqual({
      "data-authoring-frame": "block",
      "data-definition": "callout",
      "data-id": "block-a",
      "data-node": "callout",
    });

    expect(
      courseBlockAuthoringFrameAttributes({
        blockId: "",
        nodeType: "callout",
      }),
    ).toEqual({});
  });

  it("creates structural frame attrs from a neutral frame kind", () => {
    expect(
      structuralAuthoringFrameAttributes({
        definition: "tabs",
        frameKind: "layout",
        id: "layout-a",
        nodeType: "layout",
      }),
    ).toEqual({
      "data-authoring-frame": "layout",
      "data-definition": "tabs",
      "data-id": "layout-a",
      "data-node": "layout",
    });
  });

  it("creates named structural frame attrs for built-in structural kinds", () => {
    expect(gridAuthoringFrameAttributes({ gridId: "grid-a" })).toEqual({
      "data-authoring-frame": "grid",
      "data-definition": "grid",
      "data-id": "grid-a",
      "data-node": "grid",
    });
    expect(cellAuthoringFrameAttributes({ cellId: "cell-a" })).toEqual({
      "data-authoring-frame": "cell",
      "data-definition": "cell",
      "data-id": "cell-a",
      "data-node": "cell",
    });
    expect(layoutAuthoringFrameAttributes({ layoutId: "layout-a" })).toEqual({
      "data-authoring-frame": "layout",
      "data-definition": "layout",
      "data-id": "layout-a",
      "data-node": "layout",
    });
    expect(sectionAuthoringFrameAttributes({ sectionId: "section-a" })).toEqual({
      "data-authoring-frame": "section",
      "data-definition": "section",
      "data-id": "section-a",
      "data-node": "section",
    });
    expect(
      surfaceAuthoringFrameAttributes({
        definition: "page",
        surfaceId: "surface-a",
      }),
    ).toEqual({
      "data-authoring-frame": "surface",
      "data-definition": "page",
      "data-id": "surface-a",
      "data-node": "surface",
    });
  });

  it("builds selectors and resolves frames from frame-kind locators", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <section data-authoring-frame="block" data-node="callout" data-definition="callout" data-id="block-a"></section>
      <section data-authoring-frame="layout" data-node="layout" data-definition="tabs" data-id="layout-a"></section>
    `;

    expect(authoringFrameSelector({ frameKind: "block", id: "block-a" })).toBe(
      '[data-authoring-frame="block"][data-id="block-a"]',
    );
    expect(resolveAuthoringFrameElement(root, { frameKind: "block", id: "block-a" })).toBe(
      root.firstElementChild,
    );
    expect(
      resolveAuthoringFrameElement(root, {
        frameKind: "layout",
        id: "layout-a",
      }),
    ).toBe(root.lastElementChild);
  });

  it("resolves the root element itself when it is the frame", () => {
    const root = document.createElement("section");
    root.setAttribute(AUTHORING_FRAME_ATTR, "grid");
    root.setAttribute("data-id", "grid-a");

    expect(resolveAuthoringFrameElement(root, { frameKind: "grid", id: "grid-a" })).toBe(root);
  });

  it("does not resolve locators without stable ids", () => {
    expect(authoringFrameSelector({ frameKind: "grid", id: "" })).toBe("");
    expect(
      resolveAuthoringFrameElement(document.body, {
        frameKind: "grid",
        id: "",
      }),
    ).toBeNull();
    expect(resolveAuthoringFrameElement(null, null)).toBeNull();
  });

  it("finds the closest containing frame from an event target", () => {
    const frame = document.createElement("section");
    frame.setAttribute(AUTHORING_FRAME_ATTR, "cell");
    frame.setAttribute("data-id", "cell-a");
    const inner = document.createElement("span");
    frame.appendChild(inner);

    expect(closestAuthoringFrameElement(inner)).toBe(frame);
    expect(closestAuthoringFrameElement(null)).toBeNull();
    expect(closestAuthoringFrameElement(document.createTextNode("x"))).toBe(null);
  });

  it("reads neutral frame descriptors without old target vocabulary", () => {
    const element = document.createElement("section");
    element.setAttribute(AUTHORING_FRAME_ATTR, "block");
    element.setAttribute("data-node", "gallery");
    element.setAttribute("data-definition", "gallery");
    element.setAttribute("data-id", "block-gallery");

    expect(readAuthoringFrameDescriptor(element)).toEqual({
      definition: "gallery",
      frameKind: "block",
      id: "block-gallery",
      nodeType: "gallery",
    });
  });

  it("rejects descriptors with unknown kinds or missing ids", () => {
    const unknownKind = document.createElement("section");
    unknownKind.setAttribute(AUTHORING_FRAME_ATTR, "field");
    unknownKind.setAttribute("data-id", "field-a");
    expect(readAuthoringFrameDescriptor(unknownKind)).toBeNull();

    const missingId = document.createElement("section");
    missingId.setAttribute(AUTHORING_FRAME_ATTR, "block");
    expect(readAuthoringFrameDescriptor(missingId)).toBeNull();
  });

  it("reflects chrome-active as a boolean authoring attr", () => {
    expect(authoringChromeActiveAttributes(true)).toEqual({
      [AUTHORING_CHROME_ACTIVE_ATTR]: "",
    });
    expect(authoringChromeActiveAttributes(false)).toEqual({});
    expect(authoringChromeActiveAttributes(null)).toEqual({});
  });
});
