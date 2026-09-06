// @vitest-environment happy-dom

import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import { Schema, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import { surfaceAuthoringFrameAttributes } from "@/editor/interactions/dom/authoring-frame";
import type { DocumentTreeSnapshot, DocumentItemLocation } from "@/document/model/document-tree";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createAuthoringEditorNavigationEnvironment } from "./authoring-editor-navigation-environment";

const SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00001");
const TARGET_ID = EmbeddedNodeIdSchema.parse("target000001");
const PREFIX_ID = EmbeddedNodeIdSchema.parse("prefix000001");
const blockDefinitions: BlockDefinitionLookup = { getByNodeType: () => undefined };

const schema = new Schema({
  nodes: {
    doc: { content: "(surface | unavailable_surface)+" },
    text: { group: "inline" },
    paragraph: { attrs: { id: { default: null } }, content: "text*" },
    surface: { attrs: { id: { default: null } }, content: "paragraph*" },
    unavailable_surface: { attrs: { id: { default: null } }, atom: true },
  },
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("authoring editor navigation environment", () => {
  it("resolves a Surface authoring frame through the latest snapshot without nodeDOM", async () => {
    const harness = createHarness();
    harness.replace(
      schema.node("doc", null, [schema.node("surface", { id: PREFIX_ID }), surfaceNode()]),
    );

    await expect(harness.environment.presentSurface(SURFACE_ID)).resolves.toBeUndefined();
  });

  it("preserves unavailable Surface navigation through its compatibility frame", async () => {
    const harness = createHarness({ unavailable: true });

    await expect(harness.environment.presentSurface(SURFACE_ID)).resolves.toBeUndefined();
    expect(
      harness.environment
        .createActivationTransaction(harness.snapshot.locationById.get(SURFACE_ID)!)
        ?.selection.toJSON(),
    ).toEqual({ type: "node", anchor: 0 });
  });

  it("centres a below-fold owner frame in its page window without moving focus", async () => {
    const harness = createHarness();
    harness.frame.getBoundingClientRect = () => rect({ top: 900, bottom: 960 });
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

    expect(scrollBy).toHaveBeenCalledWith({ behavior: "smooth", left: 0, top: 630 });
    expect(document.activeElement).toBe(initiatingControl);
  });

  it("centres in the contained editor shell instead of the page window", async () => {
    const shell = document.createElement("div");
    shell.className = "sc-editor-shell";
    shell.dataset["scrollModel"] = "contained";
    document.body.append(shell);
    const harness = createHarness({ parent: shell });
    harness.frame.getBoundingClientRect = () => rect({ top: 500, bottom: 560 });
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

    expect(containedScrollBy).toHaveBeenCalledWith({ behavior: "auto", left: 0, top: 280 });
    expect(pageScrollBy).not.toHaveBeenCalled();
  });

  it("centres through the nearest bounded viewport and its containing page owner", async () => {
    const shell = document.createElement("div");
    shell.className = "sc-editor-shell";
    shell.dataset["scrollModel"] = "contained";
    document.body.append(shell);
    const harness = createHarness({ parent: shell });
    const boundedViewport = document.createElement("div");
    boundedViewport.dataset["boundedScroll"] = "";
    boundedViewport.append(harness.frame);
    harness.root.append(boundedViewport);
    boundedViewport.getBoundingClientRect = () => rect({ top: 100, bottom: 250 });
    harness.frame.getBoundingClientRect = () => rect({ top: 300, bottom: 350 });
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

    expect(boundedScrollBy).toHaveBeenCalledWith({ behavior: "smooth", left: 0, top: 150 });
    expect(shellScrollBy).toHaveBeenCalledWith({ behavior: "smooth", left: 0, top: 75 });
  });

  it("centres through every bounded viewport from inner to outer using live geometry", async () => {
    const shell = document.createElement("div");
    shell.className = "sc-editor-shell";
    shell.dataset["scrollModel"] = "contained";
    document.body.append(shell);
    const harness = createHarness({ parent: shell });
    const outerViewport = document.createElement("div");
    const innerViewport = document.createElement("div");
    outerViewport.dataset["boundedScroll"] = "";
    innerViewport.dataset["boundedScroll"] = "";
    outerViewport.append(innerViewport);
    innerViewport.append(harness.frame);
    harness.root.append(outerViewport);

    let frameTop = 700;
    const order: string[] = [];
    harness.frame.getBoundingClientRect = () => rect({ top: frameTop, bottom: frameTop + 60 });
    innerViewport.getBoundingClientRect = () => rect({ top: 500, bottom: 700 });
    outerViewport.getBoundingClientRect = () => rect({ top: 100, bottom: 500 });
    shell.getBoundingClientRect = () => rect({ top: 0, bottom: 400 });
    setScrollableMetrics(innerViewport, { clientHeight: 200, scrollHeight: 300, scrollTop: 20 });
    setScrollableMetrics(outerViewport, { clientHeight: 400, scrollHeight: 700, scrollTop: 0 });
    setScrollableMetrics(shell, { clientHeight: 400, scrollHeight: 1_000, scrollTop: 0 });
    const innerScrollBy = installScrollBy(innerViewport, "inner", order, (actualTop) => {
      frameTop -= actualTop;
    });
    const outerScrollBy = installScrollBy(outerViewport, "outer", order, (actualTop) => {
      frameTop -= actualTop;
    });
    const shellScrollBy = installScrollBy(shell, "shell", order, (actualTop) => {
      frameTop -= actualTop;
    });
    const initiatingControl = document.createElement("button");
    document.body.prepend(initiatingControl);
    initiatingControl.focus();

    await harness.environment.bringIntoView(
      harness.snapshot.locationById.get(TARGET_ID)!,
      "smooth",
    );

    expect(order).toEqual(["inner", "outer", "shell"]);
    expect(innerScrollBy).toHaveBeenCalledWith({ behavior: "smooth", left: 0, top: 130 });
    expect(outerScrollBy).toHaveBeenCalledWith({ behavior: "smooth", left: 0, top: 350 });
    expect(shellScrollBy).toHaveBeenCalledWith({ behavior: "smooth", left: 0, top: 150 });
    expect(document.activeElement).toBe(initiatingControl);
  });

  it("centres an authoring frame larger than its bounded viewport by its midpoint", async () => {
    const harness = createHarness();
    const boundedViewport = document.createElement("div");
    boundedViewport.dataset["boundedScroll"] = "";
    boundedViewport.append(harness.frame);
    harness.root.append(boundedViewport);
    boundedViewport.getBoundingClientRect = () => rect({ top: 100, bottom: 300 });
    harness.frame.getBoundingClientRect = () => rect({ top: 50, bottom: 550 });
    setScrollableMetrics(boundedViewport, {
      clientHeight: 200,
      scrollHeight: 1_000,
      scrollTop: 100,
    });
    const boundedScrollBy = vi.fn(({ top = 0 }: ScrollToOptions) => {
      boundedViewport.scrollTop += top;
    });
    Object.defineProperty(boundedViewport, "scrollBy", {
      configurable: true,
      value: boundedScrollBy,
    });
    const pageScrollBy = vi.fn();
    Object.defineProperty(harness.window, "scrollBy", {
      configurable: true,
      value: pageScrollBy,
    });

    await harness.environment.bringIntoView(
      harness.snapshot.locationById.get(TARGET_ID)!,
      "instant",
    );

    expect(boundedScrollBy).toHaveBeenCalledWith({ behavior: "auto", left: 0, top: 100 });
  });

  it("rejects a target whose canonical authoring frame is unavailable", async () => {
    const harness = createHarness();
    harness.frame.remove();

    await expect(
      harness.environment.bringIntoView(harness.snapshot.locationById.get(TARGET_ID)!, "smooth"),
    ).rejects.toThrow('Editor navigation target "target000001" is not rendered');
  });
});

function createHarness(options: { parent?: HTMLElement; unavailable?: boolean } = {}) {
  const root = document.createElement("div");
  root.className = "sc-course-document-editor";
  (options.parent ?? document.body).append(root);
  const frame = document.createElement("section");
  setAttributes(frame, surfaceAuthoringFrameAttributes({ surfaceId: SURFACE_ID }));
  root.append(frame);
  let state = EditorState.create({
    doc: options.unavailable
      ? schema.node("doc", null, [schema.node("unavailable_surface", { id: SURFACE_ID })])
      : schema.node("doc", null, [surfaceNode()]),
  });
  let snapshot = semanticSnapshot(state.doc);
  const view = {
    dom: root,
    get state() {
      return state;
    },
  };
  const environment = createAuthoringEditorNavigationEnvironment({
    blockDefinitions,
    getDocumentTree: () => snapshot,
    root,
    view,
  });

  return {
    environment,
    frame,
    replace(doc: ProseMirrorNode) {
      state = EditorState.create({ doc });
      snapshot = semanticSnapshot(doc);
    },
    root,
    get snapshot() {
      return snapshot;
    },
    window: root.ownerDocument.defaultView!,
  };
}

function surfaceNode(): ProseMirrorNode {
  return schema.node("surface", { id: SURFACE_ID }, [
    schema.node("paragraph", { id: TARGET_ID }, schema.text("Target")),
  ]);
}

function semanticSnapshot(doc: ProseMirrorNode): DocumentTreeSnapshot {
  const locations: DocumentItemLocation[] = [];
  doc.descendants((node, pos) => {
    const parsed = EmbeddedNodeIdSchema.safeParse(node.attrs["id"]);
    if (!parsed.success) return true;
    locations.push(location(parsed.data, node.type.name, pos));
    return true;
  });
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

function location(id: EmbeddedNodeId, nodeType: string, from: number): DocumentItemLocation {
  return {
    activationPath: [],
    authoringAnchorId: null,
    from,
    id,
    nodeType,
    selectionTarget: { kind: "node", pos: from },
    surfaceId: nodeType === "surface" || nodeType === "unavailable_surface" ? id : SURFACE_ID,
    to: from + 2,
  };
}

function setAttributes(element: HTMLElement, attributes: Record<string, string>): void {
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
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

function setScrollableMetrics(
  element: HTMLElement,
  metrics: { clientHeight: number; scrollHeight: number; scrollTop: number },
): void {
  Object.defineProperties(element, {
    clientHeight: { configurable: true, value: metrics.clientHeight },
    scrollHeight: { configurable: true, value: metrics.scrollHeight },
    scrollTop: { configurable: true, value: metrics.scrollTop, writable: true },
  });
}

function installScrollBy(
  element: HTMLElement,
  label: string,
  order: string[],
  onScroll: (actualTop: number) => void,
) {
  const scrollBy = vi.fn(({ top = 0 }: ScrollToOptions) => {
    order.push(label);
    queueMicrotask(() => {
      const nextTop = Math.max(
        0,
        Math.min(element.scrollTop + top, element.scrollHeight - element.clientHeight),
      );
      const actualTop = nextTop - element.scrollTop;
      element.scrollTop = nextTop;
      onScroll(actualTop);
      element.dispatchEvent(new Event("scrollend"));
    });
  });
  Object.defineProperty(element, "scrollBy", { configurable: true, value: scrollBy });
  return scrollBy;
}
