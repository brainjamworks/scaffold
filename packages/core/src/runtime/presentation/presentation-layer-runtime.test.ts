// @vitest-environment happy-dom

import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type {
  DocumentItemActivation,
  DocumentItemLocation,
  DocumentTreeItem,
  DocumentTreeSnapshot,
} from "@/document/model/document-tree";
import {
  createSemanticActivationRegistry,
  type SemanticActivationRequest,
} from "@/document/semantic-target-interaction";

import {
  createPresentationLayerRuntime,
  PRESENTATION_LAYER_OWNER_ID_ATTRIBUTE,
  type PresentationLayerRuntime,
} from "./presentation-layer-runtime";

const SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00001");
const OWNER_ID = EmbeddedNodeIdSchema.parse("region000001");
const OTHER_OWNER_ID = EmbeddedNodeIdSchema.parse("region000002");
const LAYER_A_ID = EmbeddedNodeIdSchema.parse("layer0000001");
const LAYER_B_ID = EmbeddedNodeIdSchema.parse("layer0000002");

afterEach(() => {
  document.body.replaceChildren();
});

describe("PresentationLayerRuntime", () => {
  it("withholds the outgoing composition before exposing the incoming composition", async () => {
    const surface = document.createElement("section");
    const layerA = layerElement(OWNER_ID, LAYER_A_ID, true);
    const layerB = layerElement(OWNER_ID, LAYER_B_ID, false);
    surface.append(layerA, layerB);
    document.body.append(surface);
    const runtime = createTestRuntime();
    const listener = vi.fn();
    runtime.subscribe(listener);
    const mutations: string[] = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.attributeName === "data-layer-state") {
          mutations.push((record.target as HTMLElement).dataset["layerId"]!);
        }
      }
    });
    observer.observe(surface, { attributes: true, subtree: true });

    runtime.createApplicationPort(surface).applySelection(scene(new Map([[OWNER_ID, LAYER_B_ID]])));
    await Promise.resolve();

    expect(mutations).toEqual([LAYER_A_ID, LAYER_B_ID]);
    expectLayerState(layerA, false);
    expectLayerState(layerB, true);
    expect(runtime.getSelectedLayerId(SURFACE_ID, OWNER_ID)).toBe(LAYER_B_ID);
    expect(listener).toHaveBeenCalledOnce();
    observer.disconnect();
  });

  it("retains a projected choice for an unmounted owner and avoids duplicate publication", () => {
    const surface = document.createElement("section");
    document.body.append(surface);
    const runtime = createTestRuntime();
    const listener = vi.fn();
    runtime.subscribe(listener);
    const application = runtime.createApplicationPort(surface);
    const selected = new Map([[OTHER_OWNER_ID, LAYER_A_ID]]);

    application.applySelection(scene(selected));
    application.applySelection(scene(selected));

    expect(runtime.getSelectedLayerId(SURFACE_ID, OTHER_OWNER_ID)).toBe(LAYER_A_ID);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("keeps an owner mismatch observable without partially changing selection", () => {
    const surface = document.createElement("section");
    const layerA = layerElement(OWNER_ID, LAYER_A_ID, true);
    surface.append(layerA);
    document.body.append(surface);
    const runtime = createTestRuntime();

    expect(() =>
      runtime
        .createApplicationPort(surface)
        .applySelection(scene(new Map([[OWNER_ID, LAYER_B_ID]]))),
    ).toThrow(/not mounted beneath runtime owner/);
    expect(runtime.getSelectedLayerId(SURFACE_ID, OWNER_ID)).toBeUndefined();
    expectLayerState(layerA, true);
  });

  it("keeps duplicate mounted Layer identities and use-after-dispose observable", () => {
    const surface = document.createElement("section");
    surface.append(
      layerElement(OWNER_ID, LAYER_A_ID, true),
      layerElement(OTHER_OWNER_ID, LAYER_A_ID, false),
    );
    document.body.append(surface);
    const runtime = createTestRuntime();
    const application = runtime.createApplicationPort(surface);

    expect(() => application.applySelection(scene(new Map([[OWNER_ID, LAYER_A_ID]])))).toThrow(
      /duplicate mounted Layer/,
    );

    runtime.dispose();
    expect(() => application.applySelection(scene(new Map()))).toThrow(/disposed/);
  });

  it("passes the selected Region relationship and refuses the hidden Layer without changing it", async () => {
    const surface = document.createElement("section");
    surface.append(
      layerElement(OWNER_ID, LAYER_A_ID, true),
      layerElement(OWNER_ID, LAYER_B_ID, false),
    );
    document.body.append(surface);
    const harness = semanticHarness(regionSemantics([LAYER_A_ID, LAYER_B_ID]), LAYER_A_ID);
    const resolution = harness.registry.resolve(OWNER_ID);
    if (resolution.kind !== "resolved") throw new Error("Expected the Region binding.");

    await expect(resolution.binding.activate(request(OWNER_ID, LAYER_A_ID))).resolves.toEqual({
      kind: "already-visible",
      ownerId: OWNER_ID,
      childId: LAYER_A_ID,
    });
    await expect(resolution.binding.activate(request(OWNER_ID, LAYER_B_ID))).resolves.toEqual({
      kind: "refused",
      ownerId: OWNER_ID,
      childId: LAYER_B_ID,
      reason: "hidden-layer-ancestor",
    });
    expect(harness.runtime.getSelectedLayerId(SURFACE_ID, OWNER_ID)).toBeUndefined();

    harness.runtime
      .createApplicationPort(surface)
      .applySelection(scene(new Map([[OWNER_ID, LAYER_B_ID]])));
    await expect(resolution.binding.activate(request(OWNER_ID, LAYER_B_ID))).resolves.toEqual({
      kind: "already-visible",
      ownerId: OWNER_ID,
      childId: LAYER_B_ID,
    });
    await expect(resolution.binding.activate(request(OWNER_ID, LAYER_A_ID))).resolves.toEqual({
      kind: "refused",
      ownerId: OWNER_ID,
      childId: LAYER_A_ID,
      reason: "hidden-layer-ancestor",
    });
    harness.runtime.dispose();
    harness.registry.dispose();
  });

  it("retains reason-specific semantic failures and observable binding invariants", async () => {
    const harness = semanticHarness(regionSemantics([LAYER_A_ID]), LAYER_A_ID);
    const resolution = harness.registry.resolve(OWNER_ID);
    if (resolution.kind !== "resolved") throw new Error("Expected the Region binding.");

    await expect(resolution.binding.activate(request(OWNER_ID, LAYER_B_ID))).resolves.toEqual({
      kind: "unavailable",
      ownerId: OWNER_ID,
      childId: LAYER_B_ID,
      reason: "child-missing",
    });
    const aborted = new AbortController();
    aborted.abort();
    await expect(
      resolution.binding.activate(request(OWNER_ID, LAYER_A_ID, aborted.signal)),
    ).resolves.toEqual({ kind: "interrupted", ownerId: OWNER_ID, childId: LAYER_A_ID });
    await expect(
      resolution.binding.activate(
        request(OWNER_ID, LAYER_A_ID, undefined, {
          ownerId: OWNER_ID,
          childId: LAYER_A_ID,
          ownerKind: "cell",
        }),
      ),
    ).rejects.toThrow(/received owner kind "cell"/);

    harness.semantics.current = emptySemantics();
    await expect(resolution.binding.activate(request(OWNER_ID, LAYER_A_ID))).resolves.toEqual({
      kind: "unavailable",
      ownerId: OWNER_ID,
      childId: LAYER_A_ID,
      reason: "owner-unmounted",
    });
    harness.runtime.reconcileSemanticOwners();
    expect(harness.registry.resolve(OWNER_ID)).toEqual({
      kind: "unavailable",
      ownerId: OWNER_ID,
      reason: "owner-unmounted",
    });
    harness.runtime.dispose();
    harness.registry.dispose();
  });
});

function createTestRuntime(): PresentationLayerRuntime {
  return semanticHarness(emptySemantics(), undefined).runtime;
}

function semanticHarness(
  initialSemantics: DocumentTreeSnapshot,
  initialLayerId: EmbeddedNodeId | undefined,
) {
  const registry = createSemanticActivationRegistry();
  const semantics = { current: initialSemantics };
  const runtime = createPresentationLayerRuntime({
    activationRegistry: registry,
    getSemantics: () => semantics.current,
    getInitialLayerId: () => initialLayerId,
  });
  return { registry, runtime, semantics };
}

function regionSemantics(layerIds: readonly EmbeddedNodeId[]): DocumentTreeSnapshot {
  const children = Object.freeze(layerIds.map((id) => treeItem(id, "layer", [])));
  const region = treeItem(OWNER_ID, "region", children);
  return Object.freeze({
    revision: 0,
    mode: "slideshow",
    roots: Object.freeze([region]),
    itemById: new Map<EmbeddedNodeId, DocumentTreeItem>([
      [OWNER_ID, region],
      ...children.map((item) => [item.id, item] as const),
    ]),
    parentById: new Map<EmbeddedNodeId, EmbeddedNodeId | null>([
      [OWNER_ID, null],
      ...children.map((item) => [item.id, OWNER_ID] as const),
    ]),
    locationById: new Map<EmbeddedNodeId, DocumentItemLocation>([
      [
        OWNER_ID,
        {
          id: OWNER_ID,
          nodeType: "region",
          from: 0,
          to: 10,
          selectionTarget: { kind: "node", pos: 0 },
          surfaceId: SURFACE_ID,
          authoringAnchorId: OWNER_ID,
          activationPath: Object.freeze([]),
        },
      ],
    ]),
    diagnostics: Object.freeze([]),
  });
}

function emptySemantics(): DocumentTreeSnapshot {
  return Object.freeze({
    revision: 0,
    mode: "slideshow",
    roots: Object.freeze([]),
    itemById: new Map(),
    parentById: new Map(),
    locationById: new Map(),
    diagnostics: Object.freeze([]),
  });
}

function treeItem(
  id: EmbeddedNodeId,
  kind: "region" | "layer",
  children: readonly DocumentTreeItem[],
): DocumentTreeItem {
  return Object.freeze({
    id,
    kind,
    nodeType: kind,
    definitionId: null,
    label: kind,
    summary: null,
    presentation: Object.freeze({ actionIds: Object.freeze([]), disabledReason: null }),
    children,
  });
}

function request(
  ownerId: EmbeddedNodeId,
  childId: EmbeddedNodeId,
  signal = new AbortController().signal,
  relationship: DocumentItemActivation = { ownerId, childId, ownerKind: "region" },
): SemanticActivationRequest {
  return Object.freeze({
    requestedId: childId,
    relationship,
    origin: "configured-presentation",
    causationId: "presentation-layer-runtime-test",
    signal,
  });
}

function scene(selectedLayerByOwnerId: ReadonlyMap<typeof OWNER_ID, typeof LAYER_A_ID>) {
  return { surfaceId: SURFACE_ID, selectedLayerByOwnerId };
}

function layerElement(ownerId: string, layerId: string, active: boolean): HTMLElement {
  const element = document.createElement("div");
  element.dataset["node"] = "layer";
  element.dataset["layerId"] = layerId;
  element.setAttribute(PRESENTATION_LAYER_OWNER_ID_ATTRIBUTE, ownerId);
  element.dataset["layerState"] = active ? "active" : "inactive";
  element.hidden = !active;
  element.toggleAttribute("inert", !active);
  if (!active) element.setAttribute("aria-hidden", "true");
  return element;
}

function expectLayerState(element: HTMLElement, active: boolean): void {
  expect(element.dataset["layerState"]).toBe(active ? "active" : "inactive");
  expect(element.hidden).toBe(!active);
  expect(element.hasAttribute("inert")).toBe(!active);
  expect(element.getAttribute("aria-hidden")).toBe(active ? null : "true");
}
