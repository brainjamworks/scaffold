// @vitest-environment happy-dom

import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import type {
  SemanticDocumentSnapshot,
  SemanticLocation,
} from "@/document/model/semantic-document";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createAuthoringSemanticNavigationEnvironment } from "./authoring-semantic-navigation-environment";

const SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00001");
const TARGET_ID = EmbeddedNodeIdSchema.parse("target000001");

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("authoring semantic navigation environment", () => {
  it("locates a Surface through its latest snapshot position", async () => {
    const harness = createHarness([
      location(SURFACE_ID, "surface", 2),
      location(TARGET_ID, "paragraph", 4, SURFACE_ID),
    ]);
    const replacementSurface = document.createElement("section");
    harness.root.append(replacementSurface);

    harness.replace([
      location(SURFACE_ID, "surface", 8),
      location(TARGET_ID, "paragraph", 10, SURFACE_ID),
    ]);
    harness.nodes.set(8, replacementSurface);

    await harness.environment.presentSurface(SURFACE_ID);

    expect(harness.nodeDOM).toHaveBeenLastCalledWith(8);
  });

  it("scrolls a below-fold target in its page window without moving focus", async () => {
    const harness = createHarness([
      location(SURFACE_ID, "surface", 2),
      location(TARGET_ID, "paragraph", 4, SURFACE_ID),
    ]);
    const target = harness.nodes.get(4) as HTMLElement;
    target.getBoundingClientRect = () => rect({ top: 900, bottom: 960 });
    Object.defineProperty(harness.window, "innerHeight", { configurable: true, value: 600 });
    const scrollBy = vi.fn();
    Object.defineProperty(harness.window, "scrollBy", { configurable: true, value: scrollBy });
    const initiatingControl = document.createElement("button");
    document.body.prepend(initiatingControl);
    initiatingControl.focus();

    await harness.environment.bringIntoView(
      harness.snapshot.locationById.get(TARGET_ID)!,
      "smooth",
    );

    expect(scrollBy).toHaveBeenCalledWith({ behavior: "smooth", left: 0, top: 360 });
    expect(document.activeElement).toBe(initiatingControl);
  });

  it("uses the contained editor shell instead of the page window", async () => {
    const shell = document.createElement("div");
    shell.className = "sc-editor-shell";
    shell.dataset["scrollModel"] = "contained";
    document.body.append(shell);
    const harness = createHarness(
      [location(SURFACE_ID, "surface", 2), location(TARGET_ID, "paragraph", 4, SURFACE_ID)],
      shell,
    );
    const target = harness.nodes.get(4) as HTMLElement;
    target.getBoundingClientRect = () => rect({ top: 500, bottom: 560 });
    shell.getBoundingClientRect = () => rect({ top: 100, bottom: 400 });
    const containedScrollBy = vi.fn();
    Object.defineProperty(shell, "scrollBy", { configurable: true, value: containedScrollBy });
    const pageScrollBy = vi.fn();
    Object.defineProperty(harness.window, "scrollBy", {
      configurable: true,
      value: pageScrollBy,
    });

    await harness.environment.bringIntoView(
      harness.snapshot.locationById.get(TARGET_ID)!,
      "instant",
    );

    expect(containedScrollBy).toHaveBeenCalledWith({ behavior: "auto", left: 0, top: 160 });
    expect(pageScrollBy).not.toHaveBeenCalled();
  });

  it("reveals a target through its nearest bounded scroll viewport first", async () => {
    const shell = document.createElement("div");
    shell.className = "sc-editor-shell";
    shell.dataset["scrollModel"] = "contained";
    document.body.append(shell);
    const harness = createHarness(
      [location(SURFACE_ID, "surface", 2), location(TARGET_ID, "paragraph", 4, SURFACE_ID)],
      shell,
    );
    const boundedViewport = document.createElement("div");
    boundedViewport.dataset["boundedScroll"] = "";
    const target = harness.nodes.get(4) as HTMLElement;
    boundedViewport.append(target);
    harness.root.append(boundedViewport);
    boundedViewport.getBoundingClientRect = () => rect({ top: 100, bottom: 250 });
    target.getBoundingClientRect = () => rect({ top: 300, bottom: 350 });
    shell.getBoundingClientRect = () => rect({ top: 0, bottom: 500 });
    const boundedScrollBy = vi.fn();
    Object.defineProperty(boundedViewport, "scrollBy", {
      configurable: true,
      value: boundedScrollBy,
    });
    const shellScrollBy = vi.fn();
    Object.defineProperty(shell, "scrollBy", { configurable: true, value: shellScrollBy });

    await harness.environment.bringIntoView(
      harness.snapshot.locationById.get(TARGET_ID)!,
      "smooth",
    );

    expect(boundedScrollBy).toHaveBeenCalledWith({ behavior: "smooth", left: 0, top: 100 });
    expect(shellScrollBy).not.toHaveBeenCalled();
  });

  it("rejects a target whose current ProseMirror DOM mapping is unavailable", async () => {
    const harness = createHarness([
      location(SURFACE_ID, "surface", 2),
      location(TARGET_ID, "paragraph", 4, SURFACE_ID),
    ]);
    harness.nodes.delete(4);

    await expect(
      harness.environment.bringIntoView(harness.snapshot.locationById.get(TARGET_ID)!, "smooth"),
    ).rejects.toThrow('Semantic navigation target "target000001" is not rendered');
  });
});

function createHarness(
  locations: readonly SemanticLocation[],
  parent: HTMLElement = document.body,
) {
  const root = document.createElement("div");
  root.className = "sc-course-document-editor";
  parent.append(root);
  const nodes = new Map<number, Node>();
  for (const current of locations) {
    const element = document.createElement("div");
    root.append(element);
    nodes.set(current.from, element);
  }
  let snapshot = semanticSnapshot(locations);
  const nodeDOM = vi.fn((pos: number) => nodes.get(pos) ?? null);
  const environment = createAuthoringSemanticNavigationEnvironment({
    getSnapshot: () => snapshot,
    root,
    view: { dom: root, nodeDOM },
  });

  return {
    environment,
    nodes,
    nodeDOM,
    replace(nextLocations: readonly SemanticLocation[]) {
      snapshot = semanticSnapshot(nextLocations);
    },
    root,
    get snapshot() {
      return snapshot;
    },
    window: root.ownerDocument.defaultView!,
  };
}

function semanticSnapshot(locations: readonly SemanticLocation[]): SemanticDocumentSnapshot {
  return {
    diagnostics: [],
    itemById: new Map(),
    locationById: new Map(locations.map((current) => [current.id, current])),
    mode: "page",
    parentById: new Map(),
    revision: 0,
    roots: [],
  };
}

function location(
  id: EmbeddedNodeId,
  nodeType: string,
  from: number,
  surfaceId: EmbeddedNodeId | null = id,
): SemanticLocation {
  return {
    activationPath: [],
    from,
    id,
    nodeType,
    selectionTarget: { kind: "node", pos: from },
    surfaceId: nodeType === "surface" ? id : surfaceId,
    to: from + 2,
  };
}

function rect({ top, bottom }: { top: number; bottom: number }): DOMRect {
  return {
    bottom,
    height: bottom - top,
    left: 0,
    right: 100,
    top,
    width: 100,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}
