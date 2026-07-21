// @vitest-environment happy-dom

import { describe, expect, it } from "vite-plus/test";

import {
  isOverlayTargetOwnedBy,
  registerOverlayHostOwner,
  subscribeOverlayHostOwner,
} from "./overlay-ownership";

describe("overlay ownership", () => {
  it("owns the editor root and its descendants", () => {
    const ownerRoot = document.createElement("div");
    const descendant = document.createElement("button");
    ownerRoot.append(descendant);

    expect(isOverlayTargetOwnedBy(ownerRoot, ownerRoot)).toBe(true);
    expect(isOverlayTargetOwnedBy(ownerRoot, descendant)).toBe(true);
  });

  it("owns descendants of a registered host", () => {
    const ownerRoot = document.createElement("div");
    const host = document.createElement("div");
    const descendant = document.createElement("button");
    host.append(descendant);

    registerOverlayHostOwner(ownerRoot, host);

    expect(isOverlayTargetOwnedBy(ownerRoot, host)).toBe(true);
    expect(isOverlayTargetOwnedBy(ownerRoot, descendant)).toBe(true);
  });

  it("does not share registered hosts between sibling editors", () => {
    const firstRoot = document.createElement("div");
    const secondRoot = document.createElement("div");
    const firstHost = document.createElement("div");
    const secondHost = document.createElement("div");
    const firstTarget = document.createElement("button");
    const secondTarget = document.createElement("button");
    firstHost.append(firstTarget);
    secondHost.append(secondTarget);

    registerOverlayHostOwner(firstRoot, firstHost);
    registerOverlayHostOwner(secondRoot, secondHost);

    expect(isOverlayTargetOwnedBy(firstRoot, firstTarget)).toBe(true);
    expect(isOverlayTargetOwnedBy(firstRoot, secondTarget)).toBe(false);
    expect(isOverlayTargetOwnedBy(secondRoot, firstTarget)).toBe(false);
    expect(isOverlayTargetOwnedBy(secondRoot, secondTarget)).toBe(true);
  });

  it("recognises a nested host for its nearest owner and the containing owner", () => {
    const outerRoot = document.createElement("div");
    const innerRoot = document.createElement("div");
    const innerHost = document.createElement("div");
    const target = document.createElement("button");
    outerRoot.append(innerRoot);
    innerRoot.append(innerHost);
    innerHost.append(target);

    registerOverlayHostOwner(innerRoot, innerHost);

    expect(isOverlayTargetOwnedBy(innerRoot, target)).toBe(true);
    expect(isOverlayTargetOwnedBy(outerRoot, target)).toBe(true);
  });

  it("removes host membership with idempotent cleanup", () => {
    const ownerRoot = document.createElement("div");
    const host = document.createElement("div");
    const target = document.createElement("button");
    host.append(target);
    const unregister = registerOverlayHostOwner(ownerRoot, host);

    unregister();
    unregister();

    expect(isOverlayTargetOwnedBy(ownerRoot, target)).toBe(false);
  });

  it("publishes current host registration and later teardown to local subscribers", () => {
    const ownerRoot = document.createElement("div");
    const firstHost = document.createElement("div");
    const secondHost = document.createElement("div");
    const unregisterFirstHost = registerOverlayHostOwner(ownerRoot, firstHost);
    const changes: Array<[HTMLElement, boolean]> = [];
    const unsubscribe = subscribeOverlayHostOwner(ownerRoot, (host, registered) => {
      changes.push([host, registered]);
    });

    const unregisterSecondHost = registerOverlayHostOwner(ownerRoot, secondHost);
    unregisterFirstHost();
    unregisterSecondHost();
    unsubscribe();

    expect(changes).toEqual([
      [firstHost, true],
      [secondHost, true],
      [firstHost, false],
      [secondHost, false],
    ]);
  });

  it("rejects null and non-Node event targets", () => {
    const ownerRoot = document.createElement("div");

    expect(isOverlayTargetOwnedBy(ownerRoot, null)).toBe(false);
    expect(isOverlayTargetOwnedBy(ownerRoot, new EventTarget())).toBe(false);
  });
});
