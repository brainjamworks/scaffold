import {
  EmbeddedDataIdSchema,
  EmbeddedNodeIdSchema,
  type OwnerLayerTrackV1,
  type SurfacePresentationTimelineV1,
} from "@scaffold/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { DocumentTreeItem, DocumentTreeSnapshot } from "@/document/model/document-tree";

import { preparePresentationConfiguration } from "./presentation-configuration";
import { compilePresentationLayerTracks } from "./presentation-layer-track";

const SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00001");
const OTHER_SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00002");
const OWNER_ID = EmbeddedNodeIdSchema.parse("region000001");
const OTHER_OWNER_ID = EmbeddedNodeIdSchema.parse("region000002");
const LAYER_A = EmbeddedNodeIdSchema.parse("layer0000001");
const LAYER_B = EmbeddedNodeIdSchema.parse("layer0000002");

describe("compilePresentationLayerTracks", () => {
  it("derives a sole immediate Layer without persisting a track", () => {
    const compiled = compilePresentationLayerTracks(timeline(), snapshot([LAYER_A]));

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.tracks).toEqual([{ ownerId: OWNER_ID, initialLayerId: LAYER_A, switches: [] }]);
    expect(compiled.trackByOwnerId.get(OWNER_ID)).toBe(compiled.tracks[0]);
  });

  it("requires an explicit initial choice for a multiple-Layer owner", () => {
    expect(
      compilePresentationLayerTracks(timeline(), snapshot([LAYER_A, LAYER_B])).diagnostics,
    ).toEqual([{ reason: "owner-track-missing", surfaceId: SURFACE_ID, ownerId: OWNER_ID }]);
  });

  it("always validates a broken explicit track for a sole-Layer owner", () => {
    const missingLayerId = EmbeddedNodeIdSchema.parse("gone00000001");
    const compiled = compilePresentationLayerTracks(
      timeline([track(missingLayerId)]),
      snapshot([LAYER_A]),
    );
    expect(compiled.tracks).toEqual([]);
    expect(compiled.diagnostics).toEqual([
      {
        reason: "initial-layer-not-owned",
        surfaceId: SURFACE_ID,
        ownerId: OWNER_ID,
        layerId: missingLayerId,
      },
    ]);
  });

  it("compiles an explicit track by time rather than structural sibling order", () => {
    const source = track(LAYER_B, [
      layerSwitch("switch000002", 800, LAYER_B),
      layerSwitch("switch000001", 200, LAYER_A),
    ]);
    const compiled = compilePresentationLayerTracks(
      timeline([source]),
      snapshot([LAYER_A, LAYER_B]),
    );

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.tracks[0]).toEqual({
      ownerId: OWNER_ID,
      initialLayerId: LAYER_B,
      switches: [
        { id: "switch000001", atMs: 200, layerId: LAYER_A },
        { id: "switch000002", atMs: 800, layerId: LAYER_B },
      ],
    });
  });

  it.each([
    [
      "duplicate owner tracks",
      [track(LAYER_A), track(LAYER_B)],
      { reason: "owner-track-duplicated", trackIndexes: [0, 1] },
    ],
    [
      "broken explicit initial reference",
      [track(EmbeddedNodeIdSchema.parse("gone00000001"))],
      { reason: "initial-layer-not-owned", layerId: "gone00000001" },
    ],
    [
      "switch to a nonmember",
      [
        track(LAYER_A, [
          layerSwitch("switch000001", 200, EmbeddedNodeIdSchema.parse("gone00000001")),
        ]),
      ],
      { reason: "switch-layer-not-owned", switchId: "switch000001", layerId: "gone00000001" },
    ],
    [
      "same-time switches",
      [
        track(LAYER_A, [
          layerSwitch("switch000001", 200, LAYER_B),
          layerSwitch("switch000002", 200, LAYER_A),
        ]),
      ],
      { reason: "conflicting-switches", atMs: 200, switchIds: ["switch000001", "switch000002"] },
    ],
    [
      "redundant adjacent selection",
      [track(LAYER_A, [layerSwitch("switch000001", 200, LAYER_A)])],
      { reason: "redundant-layer-switch", switchId: "switch000001", layerId: LAYER_A },
    ],
    [
      "switch at zero",
      [track(LAYER_A, [layerSwitch("switch000001", 0, LAYER_B)])],
      { reason: "layer-switch-outside-surface", atMs: 0, durationMs: 1_000 },
    ],
    [
      "switch at endpoint",
      [track(LAYER_A, [layerSwitch("switch000001", 1_000, LAYER_B)])],
      { reason: "layer-switch-outside-surface", atMs: 1_000, durationMs: 1_000 },
    ],
  ] as const)("blocks %s with reason-specific facts", (_name, tracks, expected) => {
    const diagnostics = compilePresentationLayerTracks(
      timeline(tracks as readonly OwnerLayerTrackV1[]),
      snapshot([LAYER_A, LAYER_B]),
    ).diagnostics;

    expect(diagnostics).toEqual(expect.arrayContaining([expect.objectContaining(expected)]));
    expect(Object.isFrozen(diagnostics)).toBe(true);
    expect(Object.isFrozen(diagnostics[0])).toBe(true);
  });

  it("allows only initial state on a zero-duration Surface", () => {
    const compiled = compilePresentationLayerTracks(
      timeline([track(LAYER_A)], 0),
      snapshot([LAYER_A]),
    );
    expect(compiled.diagnostics).toEqual([]);
  });

  it("reports a track whose owner moved to another Surface", () => {
    const compiled = compilePresentationLayerTracks(
      timeline([track(LAYER_A, [], OTHER_OWNER_ID)]),
      snapshot([LAYER_A], { otherOwnerSurfaceId: OTHER_SURFACE_ID }),
    );
    expect(compiled.diagnostics).toContainEqual({
      reason: "track-owner-moved-surface",
      ownerId: OTHER_OWNER_ID,
      expectedSurfaceId: SURFACE_ID,
      actualSurfaceId: OTHER_SURFACE_ID,
    });
  });

  it.each([
    [
      "missing owner",
      EmbeddedNodeIdSchema.parse("gone00000001"),
      { reason: "track-owner-not-current" },
    ],
    [
      "non-owner item",
      SURFACE_ID,
      { reason: "track-owner-not-layer-owner", actualKind: "surface" },
    ],
  ] as const)("reports an explicit track for a %s", (_name, ownerId, expected) => {
    const compiled = compilePresentationLayerTracks(
      timeline([track(LAYER_A, [], ownerId)]),
      snapshot([LAYER_A]),
    );
    expect(compiled.diagnostics).toContainEqual(
      expect.objectContaining({ ...expected, surfaceId: SURFACE_ID, ownerId }),
    );
  });

  it("keeps an impossible owner invariant observable", () => {
    expect(() => compilePresentationLayerTracks(timeline(), snapshot([]))).toThrow(
      /has no immediate Layers/,
    );
  });
});

describe("preparePresentationConfiguration", () => {
  it("purely constructs required current Surface coverage with empty Layer tracks", () => {
    const prepared = preparePresentationConfiguration(null, [SURFACE_ID, OTHER_SURFACE_ID]);
    expect(prepared.isOk()).toBe(true);
    if (prepared.isErr()) throw new Error("Expected default Presentation configuration.");
    expect(prepared.value.surfaces).toEqual([
      { surfaceId: SURFACE_ID, durationMs: 0, layerTracks: [], actions: [] },
      { surfaceId: OTHER_SURFACE_ID, durationMs: 0, layerTracks: [], actions: [] },
    ]);
  });

  it("returns typed coverage facts without dispatching or repairing stale configuration", () => {
    const current = timeline();
    const prepared = preparePresentationConfiguration(
      {
        schemaVersion: 1,
        autoAdvance: false,
        allowPrevious: true,
        surfaces: [current],
      },
      [OTHER_SURFACE_ID],
    );
    expect(prepared).toMatchObject({
      error: {
        reason: "surface-coverage-stale",
        configuredSurfaceIds: [SURFACE_ID],
        currentSurfaceIds: [OTHER_SURFACE_ID],
      },
    });
  });
});

function timeline(
  layerTracks: readonly OwnerLayerTrackV1[] = [],
  durationMs = 1_000,
): SurfacePresentationTimelineV1 {
  return { surfaceId: SURFACE_ID, durationMs, layerTracks: [...layerTracks], actions: [] };
}

function track(
  initialLayerId: typeof LAYER_A,
  switches: OwnerLayerTrackV1["switches"] = [],
  ownerId = OWNER_ID,
): OwnerLayerTrackV1 {
  return { ownerId, initialLayerId, switches };
}

function layerSwitch(id: string, atMs: number, layerId: typeof LAYER_A) {
  return { id: EmbeddedDataIdSchema.parse(id), atMs, layerId };
}

function snapshot(
  layerIds: readonly (typeof LAYER_A)[],
  options: { readonly otherOwnerSurfaceId?: typeof OTHER_SURFACE_ID } = {},
): DocumentTreeSnapshot {
  const layers = layerIds.map((id) => item(id, "layer", []));
  const owner = item(OWNER_ID, "region", layers);
  const surface = item(SURFACE_ID, "surface", [owner]);
  const allItems = [surface, owner, ...layers];
  const parentById = new Map<
    ReturnType<typeof EmbeddedNodeIdSchema.parse>,
    ReturnType<typeof EmbeddedNodeIdSchema.parse> | null
  >(allItems.map(({ id }) => [id, null]));
  parentById.set(owner.id, surface.id);
  layers.forEach(({ id }) => parentById.set(id, owner.id));
  if (options.otherOwnerSurfaceId) {
    const otherOwner = item(OTHER_OWNER_ID, "region", []);
    allItems.push(otherOwner);
    parentById.set(otherOwner.id, options.otherOwnerSurfaceId);
  }
  const itemById = new Map(allItems.map((entry) => [entry.id, entry] as const));
  return {
    revision: 1,
    mode: "slideshow",
    roots: [surface],
    itemById,
    parentById,
    locationById: new Map(
      allItems.map(({ id }) => [
        id,
        {
          id,
          nodeType: "fixture",
          from: 0,
          to: 1,
          selectionTarget: { kind: "node" as const, pos: 0 },
          surfaceId: id === OTHER_OWNER_ID ? options.otherOwnerSurfaceId! : SURFACE_ID,
          authoringAnchorId: null,
          activationPath: [],
        },
      ]),
    ),
    diagnostics: [],
  };
}

function item(
  id: ReturnType<typeof EmbeddedNodeIdSchema.parse>,
  kind: DocumentTreeItem["kind"],
  children: readonly DocumentTreeItem[],
): DocumentTreeItem {
  return {
    id,
    kind,
    nodeType: kind,
    definitionId: null,
    label: id,
    summary: null,
    presentation: { actionIds: [], disabledReason: null },
    children,
  };
}
