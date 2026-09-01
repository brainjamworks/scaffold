import type { EmbeddedDataId, EmbeddedNodeId } from "@scaffold/contracts";

import type {
  CompiledSurfacePresentationVisualProgram,
  CompiledVisualIntent,
  CompiledVisualSegment,
  PresentationMotionMode,
} from "./compiled-presentation-program";

export interface PresentationMoveContribution {
  readonly segmentId: EmbeddedDataId;
  readonly progress: number;
}

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
  readonly layoutParticipation: "normal" | "shared-position" | "transition-overlay" | "none";
  readonly moveContributions: readonly PresentationMoveContribution[];
  readonly paint: PresentationTargetPaintState;
}

export interface PresentationSequenceSceneState {
  readonly boundaryId: EmbeddedNodeId;
  readonly activeChildId: EmbeddedNodeId | null;
}

export interface PresentationVisualScene {
  readonly surfaceId: EmbeddedNodeId;
  readonly timeMs: number;
  readonly targetStates: ReadonlyMap<EmbeddedNodeId, PresentationTargetSceneState>;
  readonly sequenceStates: readonly PresentationSequenceSceneState[];
}

interface MutableTargetState {
  availability: PresentationTargetSceneState["availability"];
  moveContributions: PresentationMoveContribution[];
  paint: PresentationTargetPaintState;
  outgoingTransition: boolean;
}

export function sceneAt(
  program: CompiledSurfacePresentationVisualProgram,
  timeMs: number,
  motionMode: PresentationMotionMode,
): PresentationVisualScene {
  assertProgram(program);
  if (!Number.isSafeInteger(timeMs) || timeMs < 0 || timeMs > program.durationMs) {
    throw new Error(
      `Presentation scene time must be a safe integer between 0 and ${program.durationMs}.`,
    );
  }

  const mutableByTargetId = new Map<EmbeddedNodeId, MutableTargetState>();
  for (const target of program.targetById.values()) {
    mutableByTargetId.set(target.targetId, {
      availability: target.initialVisibility === "visible" ? "available" : "withheld",
      moveContributions: [],
      paint: target.initialVisibility === "visible" ? settledPaint() : nonePaint(),
      outgoingTransition: false,
    });
  }

  for (const segment of program.segments) {
    if (timeMs < segment.startMs) continue;
    const state = mutableByTargetId.get(segment.targetId)!;
    applySegment(state, segment, timeMs, motionMode);
  }

  const activeChildByBoundaryId = projectSequenceOwnership(program, mutableByTargetId);
  const targetStates = new Map<EmbeddedNodeId, PresentationTargetSceneState>();
  for (const target of program.targetById.values()) {
    const state = mutableByTargetId.get(target.targetId)!;
    const activeChildId = target.sequence
      ? activeChildByBoundaryId.get(target.sequence.boundaryId)
      : undefined;
    const layoutParticipation = state.outgoingTransition
      ? "transition-overlay"
      : state.availability === "withheld"
        ? "none"
        : target.sequence
          ? activeChildId === target.sequence.directChildId
            ? "shared-position"
            : "none"
          : "normal";
    targetStates.set(
      target.targetId,
      Object.freeze({
        targetId: target.targetId,
        availability: state.availability,
        layoutParticipation,
        moveContributions: Object.freeze(state.moveContributions),
        paint: state.paint,
      }),
    );
  }

  const sequenceStates = Object.freeze(
    program.sequenceContainers.map((container) =>
      Object.freeze({
        boundaryId: container.boundaryId,
        activeChildId: activeChildByBoundaryId.get(container.boundaryId) ?? null,
      }),
    ),
  );
  return Object.freeze({
    surfaceId: program.surfaceId,
    timeMs,
    targetStates,
    sequenceStates,
  });
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
  const transitionPaint = (): PresentationTargetPaintState =>
    Object.freeze({
      kind: "transition",
      segmentId: segment.id,
      progress,
      visual: segment.visual,
    });

  state.outgoingTransition = false;
  switch (segment.visual.kind) {
    case "reveal":
      state.availability = "available";
      state.paint = active && !reduced ? transitionPaint() : settledPaint();
      return;
    case "hide":
      state.availability = "withheld";
      state.outgoingTransition = active && !reduced;
      state.paint = state.outgoingTransition ? transitionPaint() : nonePaint();
      return;
    case "move":
      state.moveContributions.push(
        Object.freeze({ segmentId: segment.id, progress: reduced ? 1 : progress }),
      );
      state.paint = active && !reduced ? transitionPaint() : settledPaint();
      return;
    case "emphasize":
      state.paint = active && !reduced ? transitionPaint() : settledPaint();
      return;
  }
}

function projectSequenceOwnership(
  program: CompiledSurfacePresentationVisualProgram,
  states: ReadonlyMap<EmbeddedNodeId, MutableTargetState>,
): Map<EmbeddedNodeId, EmbeddedNodeId | null> {
  const activeByBoundaryId = new Map<EmbeddedNodeId, EmbeddedNodeId | null>();
  for (const container of program.sequenceContainers) {
    let activeChildId = container.initialActiveChildId;
    for (const segment of program.segments) {
      const target = program.targetById.get(segment.targetId)!;
      if (
        !target.sequence ||
        target.sequence.boundaryId !== container.boundaryId ||
        states.get(target.targetId)?.availability !== "available"
      ) {
        continue;
      }
      if (segment.visual.kind === "reveal") activeChildId = target.sequence.directChildId;
    }
    if (
      activeChildId !== null &&
      !container.directChildIds.includes(activeChildId)
    ) {
      throw new Error(
        `Presentation Sequence "${container.boundaryId}" has an unknown active child.`,
      );
    }
    activeByBoundaryId.set(container.boundaryId, activeChildId);
  }
  return activeByBoundaryId;
}

function assertProgram(program: CompiledSurfacePresentationVisualProgram): void {
  if (!Number.isSafeInteger(program.durationMs) || program.durationMs < 0) {
    throw new Error("Presentation visual program duration is invalid.");
  }
  const timedEndByTargetId = new Map<EmbeddedNodeId, number>();
  for (const segment of program.segments) {
    if (!program.targetById.has(segment.targetId)) {
      throw new Error(`Presentation visual segment references unknown target "${segment.targetId}".`);
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
    const priorEnd = timedEndByTargetId.get(segment.targetId);
    if (priorEnd !== undefined && segment.startMs < priorEnd) {
      throw new Error(`Presentation visual segments overlap on target "${segment.targetId}".`);
    }
    timedEndByTargetId.set(segment.targetId, segment.endMs);
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
