// @vitest-environment happy-dom

import { describe, expect, it } from "vite-plus/test";

import {
  CONTENT_LAYOUT_PROJECTION_DOM_ATTRS,
  readContentLayoutMovementState,
} from "./content-layout-projection-dom";

describe("readContentLayoutMovementState", () => {
  it.each([
    ["an unrelated element", document.createElement("div")],
    ["a Flow element", flowElement()],
  ])("keeps %s available", (_label, element) => {
    expect(readContentLayoutMovementState(element)).toEqual({ kind: "available" });
  });

  it("returns the structured Sequence shared-position reason for the exact decorated owner", () => {
    const owner = document.createElement("div");
    owner.setAttribute(CONTENT_LAYOUT_PROJECTION_DOM_ATTRS.slot, "shared");
    owner.setAttribute(CONTENT_LAYOUT_PROJECTION_DOM_ATTRS.geometry, "shared-position");

    expect(readContentLayoutMovementState(owner)).toEqual({
      kind: "unavailable",
      reason: "sequence-shared-position",
    });
  });

  it("does not infer shared position from an ancestor", () => {
    const owner = document.createElement("div");
    owner.setAttribute(CONTENT_LAYOUT_PROJECTION_DOM_ATTRS.slot, "shared");
    owner.setAttribute(CONTENT_LAYOUT_PROJECTION_DOM_ATTRS.geometry, "shared-position");
    const descendant = document.createElement("button");
    owner.append(descendant);

    expect(readContentLayoutMovementState(descendant)).toEqual({ kind: "available" });
  });
});

function flowElement(): HTMLElement {
  const element = document.createElement("p");
  element.dataset.flowOwner = "true";
  return element;
}
