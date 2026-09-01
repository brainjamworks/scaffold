// @vitest-environment happy-dom

import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { PRESENTATION_VISUAL_TARGET_ID_ATTRIBUTE } from "./presentation-visual-target-attributes";
import { createVisualTargetResolver } from "./visual-target-resolver";

const TARGET_ID = EmbeddedNodeIdSchema.parse("target000001");

afterEach(() => {
  document.body.replaceChildren();
});

describe("VisualTargetResolver", () => {
  it("resolves only an exact anchor beneath the active Surface root", () => {
    const outside = targetElement(TARGET_ID);
    const surfaceRoot = document.createElement("section");
    const inside = targetElement(TARGET_ID);
    surfaceRoot.append(inside);
    document.body.append(outside, surfaceRoot);

    expect(createVisualTargetResolver(surfaceRoot).resolve(TARGET_ID)).toEqual({
      kind: "resolved",
      targetId: TARGET_ID,
      element: inside,
    });
  });

  it("reports ordinary unmount and resolves a later remount", () => {
    const surfaceRoot = document.createElement("section");
    const first = targetElement(TARGET_ID);
    surfaceRoot.append(first);
    document.body.append(surfaceRoot);
    const resolver = createVisualTargetResolver(surfaceRoot);

    expect(resolver.resolve(TARGET_ID)).toMatchObject({ kind: "resolved", element: first });
    first.remove();
    expect(resolver.resolve(TARGET_ID)).toEqual({
      kind: "unavailable",
      targetId: TARGET_ID,
      reason: "target-unmounted",
    });

    const replacement = targetElement(TARGET_ID);
    surfaceRoot.append(replacement);
    expect(resolver.resolve(TARGET_ID)).toMatchObject({ kind: "resolved", element: replacement });
  });

  it("reuses only a connected in-Surface cache and clears idempotently", () => {
    const surfaceRoot = document.createElement("section");
    surfaceRoot.append(targetElement(TARGET_ID));
    document.body.append(surfaceRoot);
    const query = vi.spyOn(surfaceRoot, "querySelectorAll");
    const resolver = createVisualTargetResolver(surfaceRoot);

    resolver.resolve(TARGET_ID);
    resolver.resolve(TARGET_ID);
    expect(query).toHaveBeenCalledTimes(1);

    resolver.clear();
    resolver.clear();
    resolver.resolve(TARGET_ID);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("ignores duplicate IDs mounted in another Surface", () => {
    const activeSurface = document.createElement("section");
    const inactiveSurface = document.createElement("section");
    const activeTarget = targetElement(TARGET_ID);
    activeSurface.append(activeTarget);
    inactiveSurface.append(targetElement(TARGET_ID));
    document.body.append(activeSurface, inactiveSurface);

    expect(createVisualTargetResolver(activeSurface).resolve(TARGET_ID)).toMatchObject({
      kind: "resolved",
      element: activeTarget,
    });
  });

  it("throws when one active Surface contains duplicate anchors", () => {
    const surfaceRoot = document.createElement("section");
    surfaceRoot.append(targetElement(TARGET_ID), targetElement(TARGET_ID));
    document.body.append(surfaceRoot);

    expect(() => createVisualTargetResolver(surfaceRoot).resolve(TARGET_ID)).toThrow(
      /duplicate.*anchor/i,
    );
  });
});

function targetElement(targetId: string): HTMLElement {
  const element = document.createElement("div");
  element.setAttribute(PRESENTATION_VISUAL_TARGET_ID_ATTRIBUTE, targetId);
  return element;
}
