import type { EmbeddedDataId, EmbeddedNodeId } from "@scaffold/contracts";

import type {
  CompiledOwnerLayerTrack,
  CompiledSurfacePresentationVisualProgram,
  CompiledVisualIntent,
  CompiledVisualSegment,
  PresentationMotionMode,
} from "./compiled-presentation-program";
import {
  comparePresentationPlaybackPositions,
  createPresentationPlaybackPosition,
  presentationActionStartPosition,
  type PresentationPlaybackPosition,
} from "./presentation-playback-position";

export type PresentationTargetPaintState =
  | { readonly kind: "none" }
  | { readonly kind: "settled" }
  | {
      readonly kind: "transition";
      readonly segmentId: EmbeddedDataId;
      readonly progress: number;
      readonly visual: CompiledVisualIntent;
    };

export interface PresentationTargetSceneState {
  readonly targetId: EmbeddedNodeId;
  readonly availability: "available" | "withheld";
  readonly paint: PresentationTargetPaintState;
}

export interface PresentationVisualScene {
  readonly surfaceId: EmbeddedNodeId;
  readonly position: PresentationPlaybackPosition;
  readonly selectedLayerByOwnerId: ReadonlyMap<EmbeddedNodeId, EmbeddedNodeId>;
  readonly targetStates: ReadonlyMap<EmbeddedNodeId, PresentationTargetSceneState>;
}

interface MutableTargetState {
  availability: PresentationTargetSceneState["availability"];
  paint: PresentationTargetPaintState;
}

export function sceneAt(
  program: CompiledSurfacePresentationVisualProgram,
  layerTracks: readonly CompiledOwnerLayerTrack[],
  position: PresentationPlaybackPosition,
  motionMode: PresentationMotionMode,
): PresentationVisualScene {
  assertProgram(program);
  const resolvedPosition = createPresentationPlaybackPosition(position.timeMs, position.side);
  if (resolvedPosition.timeMs > program.durationMs) {
    throw new Error(
      `Presentation scene time must be between 0 and ${program.durationMs} milliseconds.`,
    );
  }

  const mutableByTargetId = new Map<EmbeddedNodeId, MutableTargetState>();
  for (const target of program.targetById.values()) {
    mutableByTargetId.set(target.targetId, {
      availability: target.initialVisibility === "visible" ? "available" : "withheld",
      paint: target.initialVisibility === "visible" ? settledPaint() : nonePaint(),
    });
  }

  for (const segment of program.segments) {
    if (
      comparePresentationPlaybackPositions(
        presentationActionStartPosition(segment.startMs),
        resolvedPosition,
      ) > 0
    ) {
      continue;
    }
    applySegment(
      mutableByTargetId.get(segment.targetId)!,
      segment,
      resolvedPosition.timeMs,
      motionMode,
    );
  }

  const targetStates = new Map<EmbeddedNodeId, PresentationTargetSceneState>();
  for (const target of program.targetById.values()) {
    const state = mutableByTargetId.get(target.targetId)!;
    targetStates.set(
      target.targetId,
      Object.freeze({
        targetId: target.targetId,
        availability: state.availability,
        paint: state.paint,
      }),
    );
  }

  return Object.freeze({
    surfaceId: program.surfaceId,
    position: resolvedPosition,
    selectedLayerByOwnerId: selectedLayersAt(layerTracks, resolvedPosition),
    targetStates,
  });
}

function selectedLayersAt(
  tracks: readonly CompiledOwnerLayerTrack[],
  position: PresentationPlaybackPosition,
): ReadonlyMap<EmbeddedNodeId, EmbeddedNodeId> {
  const selectedLayerByOwnerId = new Map<EmbeddedNodeId, EmbeddedNodeId>();
  for (const track of tracks) {
    let selectedLayerId = track.initialLayerId;
    for (const entry of track.switches) {
      if (
        comparePresentationPlaybackPositions(
          presentationActionStartPosition(entry.atMs),
          position,
        ) > 0
      ) {
        break;
      }
      selectedLayerId = entry.layerId;
    }
    selectedLayerByOwnerId.set(track.ownerId, selectedLayerId);
  }
  return selectedLayerByOwnerId;
}

function applySegment(
  state: MutableTargetState,
  segment: CompiledVisualSegment,
  timeMs: number,
  motionMode: PresentationMotionMode,
): void {
  const durationMs = segment.endMs - segment.startMs;
  const reduced = motionMode === "reduced-motion";
  const active = durationMs > 0 && timeMs < segment.endMs;
  const progress = active ? clampProgress((timeMs - segment.startMs) / durationMs) : 1;
  const transitionPaint = (
    visual: CompiledVisualIntent = segment.visual,
  ): PresentationTargetPaintState =>
    Object.freeze({ kind: "transition", segmentId: segment.id, progress, visual });

  switch (segment.visual.kind) {
    case "reveal":
      state.availability = "available";
      state.paint = active && !reduced ? transitionPaint() : settledPaint();
      return;
    case "hide":
      state.availability = "withheld";
      state.paint = active && !reduced ? transitionPaint() : nonePaint();
      return;
    case "emphasize":
      if (state.availability === "withheld") {
        state.paint = nonePaint();
        return;
      }
      state.paint = active
        ? transitionPaint(
            reduced && segment.visual.effect === "pulse"
              ? Object.freeze({ ...segment.visual, effect: "outline" })
              : segment.visual,
          )
        : settledPaint();
      return;
  }
}

function assertProgram(program: CompiledSurfacePresentationVisualProgram): void {
  if (!Number.isSafeInteger(program.durationMs) || program.durationMs < 0) {
    throw new Error("Presentation visual program duration is invalid.");
  }
  const timedSegmentByTargetId = new Map<EmbeddedNodeId, CompiledVisualSegment>();
  for (const segment of program.segments) {
    if (!program.targetById.has(segment.targetId)) {
      throw new Error(
        `Presentation visual segment references unknown target "${segment.targetId}".`,
      );
    }
    if (
      !Number.isSafeInteger(segment.startMs) ||
      !Number.isSafeInteger(segment.endMs) ||
      segment.startMs < 0 ||
      segment.endMs < segment.startMs ||
      segment.endMs > program.durationMs
    ) {
      throw new Error(`Presentation visual segment "${segment.id}" has invalid time bounds.`);
    }
    if (segment.endMs === segment.startMs) continue;
    const prior = timedSegmentByTargetId.get(segment.targetId);
    if (prior && segment.startMs < prior.endMs) {
      throw new Error(
        `Presentation visual segments "${prior.id}" and "${segment.id}" overlap on target "${segment.targetId}".`,
      );
    }
    timedSegmentByTargetId.set(segment.targetId, segment);
  }
}

function clampProgress(progress: number): number {
  return Math.min(1, Math.max(0, progress));
}

function nonePaint(): PresentationTargetPaintState {
  return Object.freeze({ kind: "none" });
}

function settledPaint(): PresentationTargetPaintState {
  return Object.freeze({ kind: "settled" });
}
