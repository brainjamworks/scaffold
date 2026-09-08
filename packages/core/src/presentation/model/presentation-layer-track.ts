import type {
  EmbeddedNodeId,
  OwnerLayerTrackV1,
  SurfacePresentationTimelineV1,
} from "@scaffold/contracts";

import type { DocumentTreeSnapshot, DocumentTreeItem } from "@/document/model/document-tree";

import type { CompiledOwnerLayerTrack } from "./compiled-presentation-program";
import type { PresentationCompilationDiagnostic } from "./presentation-compilation-diagnostic";

export interface CompiledLayerTracks {
  readonly tracks: readonly CompiledOwnerLayerTrack[];
  readonly trackByOwnerId: ReadonlyMap<EmbeddedNodeId, CompiledOwnerLayerTrack>;
  readonly diagnostics: readonly PresentationCompilationDiagnostic[];
}

const OWNER_KINDS = new Set<DocumentTreeItem["kind"]>(["region", "layout-section", "cell"]);

export function compilePresentationLayerTracks(
  surface: SurfacePresentationTimelineV1,
  snapshot: DocumentTreeSnapshot,
): CompiledLayerTracks {
  const diagnostics: PresentationCompilationDiagnostic[] = [];
  const sourceByOwnerId = groupTracksByOwner(surface.layerTracks);
  const duplicatedOwnerIds = new Set<EmbeddedNodeId>();
  for (const [ownerId, sources] of sourceByOwnerId) {
    if (sources.length < 2) continue;
    duplicatedOwnerIds.add(ownerId);
    diagnostics.push(
      Object.freeze({
        reason: "owner-track-duplicated",
        surfaceId: surface.surfaceId,
        ownerId,
        trackIndexes: Object.freeze(sources.map(({ index }) => index)),
      }),
    );
  }
  const owners = [...snapshot.itemById.values()].filter((item) => {
    if (!OWNER_KINDS.has(item.kind)) return false;
    const location = snapshot.locationById.get(item.id);
    if (!location || location.surfaceId === null) {
      throw new Error(`Layer owner "${item.id}" has no Surface ownership.`);
    }
    return location.surfaceId === surface.surfaceId;
  });
  const currentOwnerIds = new Set(owners.map(({ id }) => id));
  const tracks: CompiledOwnerLayerTrack[] = [];

  for (const owner of owners) {
    const sources = sourceByOwnerId.get(owner.id) ?? [];
    if (duplicatedOwnerIds.has(owner.id)) continue;
    const layerIds = immediateLayerIds(owner, snapshot);
    const source = sources[0]?.track;
    if (!source) {
      if (layerIds.length === 1) {
        tracks.push(freezeTrack({ ownerId: owner.id, initialLayerId: layerIds[0]!, switches: [] }));
      } else {
        diagnostics.push(
          Object.freeze({
            reason: "owner-track-missing",
            surfaceId: surface.surfaceId,
            ownerId: owner.id,
          }),
        );
      }
      continue;
    }

    const compiled = validateExplicitTrack(source, surface, layerIds, diagnostics);
    if (compiled) tracks.push(compiled);
  }

  for (const ownerId of sourceByOwnerId.keys()) {
    if (currentOwnerIds.has(ownerId)) continue;
    const owner = snapshot.itemById.get(ownerId);
    if (!owner) {
      diagnostics.push(
        Object.freeze({ reason: "track-owner-not-current", surfaceId: surface.surfaceId, ownerId }),
      );
      continue;
    }
    if (!OWNER_KINDS.has(owner.kind)) {
      diagnostics.push(
        Object.freeze({
          reason: "track-owner-not-layer-owner",
          surfaceId: surface.surfaceId,
          ownerId,
          actualKind: owner.kind,
        }),
      );
      continue;
    }
    const location = snapshot.locationById.get(ownerId);
    if (!location || location.surfaceId === null) {
      throw new Error(`Layer owner "${ownerId}" has no Surface ownership.`);
    }
    diagnostics.push(
      Object.freeze({
        reason: "track-owner-moved-surface",
        ownerId,
        expectedSurfaceId: surface.surfaceId,
        actualSurfaceId: location.surfaceId,
      }),
    );
  }

  const frozenTracks = Object.freeze(tracks);
  return Object.freeze({
    tracks: frozenTracks,
    trackByOwnerId: new Map(frozenTracks.map((track) => [track.ownerId, track])),
    diagnostics: Object.freeze(diagnostics),
  });
}

function groupTracksByOwner(tracks: readonly OwnerLayerTrackV1[]) {
  const grouped = new Map<
    EmbeddedNodeId,
    { readonly track: OwnerLayerTrackV1; readonly index: number }[]
  >();
  tracks.forEach((track, index) => {
    const entries = grouped.get(track.ownerId);
    const entry = Object.freeze({ track, index });
    if (entries) entries.push(entry);
    else grouped.set(track.ownerId, [entry]);
  });
  return grouped;
}

function immediateLayerIds(
  owner: DocumentTreeItem,
  snapshot: DocumentTreeSnapshot,
): readonly EmbeddedNodeId[] {
  const layerIds = owner.children.filter((child) => child.kind === "layer").map(({ id }) => id);
  for (const layerId of layerIds) {
    if (snapshot.parentById.get(layerId) !== owner.id) {
      throw new Error(`Layer "${layerId}" is not indexed beneath owner "${owner.id}".`);
    }
    const location = snapshot.locationById.get(layerId);
    const ownerLocation = snapshot.locationById.get(owner.id);
    if (!location || !ownerLocation || location.surfaceId !== ownerLocation.surfaceId) {
      throw new Error(`Layer "${layerId}" does not share owner "${owner.id}" Surface ownership.`);
    }
  }
  if (layerIds.length === 0) {
    throw new Error(`Layer owner "${owner.id}" has no immediate Layers.`);
  }
  return Object.freeze(layerIds);
}

function validateExplicitTrack(
  source: OwnerLayerTrackV1,
  surface: SurfacePresentationTimelineV1,
  layerIds: readonly EmbeddedNodeId[],
  diagnostics: PresentationCompilationDiagnostic[],
): CompiledOwnerLayerTrack | null {
  let valid = true;
  const owned = new Set(layerIds);
  if (!owned.has(source.initialLayerId)) {
    diagnostics.push(
      Object.freeze({
        reason: "initial-layer-not-owned",
        surfaceId: surface.surfaceId,
        ownerId: source.ownerId,
        layerId: source.initialLayerId,
      }),
    );
    valid = false;
  }

  const ordered = source.switches
    .map((entry, sourceOrder) => ({ entry, sourceOrder }))
    .sort(
      (left, right) => left.entry.atMs - right.entry.atMs || left.sourceOrder - right.sourceOrder,
    );
  const byTime = new Map<number, typeof ordered>();
  const conflictingTimes = new Set<number>();
  for (const candidate of ordered) {
    const entries = byTime.get(candidate.entry.atMs);
    if (entries) entries.push(candidate);
    else byTime.set(candidate.entry.atMs, [candidate]);
  }
  for (const [atMs, entries] of byTime) {
    if (entries.length < 2) continue;
    diagnostics.push(
      Object.freeze({
        reason: "conflicting-switches",
        surfaceId: surface.surfaceId,
        ownerId: source.ownerId,
        atMs,
        switchIds: Object.freeze(entries.map(({ entry }) => entry.id)),
      }),
    );
    conflictingTimes.add(atMs);
    valid = false;
  }

  let selectedLayerId: EmbeddedNodeId | null = source.initialLayerId;
  for (const { entry } of ordered) {
    if (!Number.isSafeInteger(entry.atMs) || entry.atMs < 0) {
      throw new Error(`Layer switch "${entry.id}" time must be a non-negative safe integer.`);
    }
    if (!(entry.atMs > 0 && entry.atMs < surface.durationMs)) {
      diagnostics.push(
        Object.freeze({
          reason: "layer-switch-outside-surface",
          surfaceId: surface.surfaceId,
          ownerId: source.ownerId,
          switchId: entry.id,
          atMs: entry.atMs,
          durationMs: surface.durationMs,
        }),
      );
      valid = false;
    }
    if (!owned.has(entry.layerId)) {
      diagnostics.push(
        Object.freeze({
          reason: "switch-layer-not-owned",
          surfaceId: surface.surfaceId,
          ownerId: source.ownerId,
          switchId: entry.id,
          layerId: entry.layerId,
        }),
      );
      valid = false;
    }
    if (
      !conflictingTimes.has(entry.atMs) &&
      selectedLayerId !== null &&
      entry.layerId === selectedLayerId
    ) {
      diagnostics.push(
        Object.freeze({
          reason: "redundant-layer-switch",
          surfaceId: surface.surfaceId,
          ownerId: source.ownerId,
          switchId: entry.id,
          atMs: entry.atMs,
          layerId: entry.layerId,
        }),
      );
      valid = false;
    }
    selectedLayerId = conflictingTimes.has(entry.atMs) ? null : entry.layerId;
  }

  return valid ? freezeTrack({ ...source, switches: ordered.map(({ entry }) => entry) }) : null;
}

function freezeTrack(track: OwnerLayerTrackV1): CompiledOwnerLayerTrack {
  return Object.freeze({
    ownerId: track.ownerId,
    initialLayerId: track.initialLayerId,
    switches: Object.freeze(track.switches.map((entry) => Object.freeze({ ...entry }))),
  });
}
