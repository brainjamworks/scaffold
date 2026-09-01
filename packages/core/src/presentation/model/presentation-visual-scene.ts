import type { EmbeddedDataId, EmbeddedNodeId } from "@scaffold/contracts";

import type {
  CompiledSequenceContainer,
  CompiledSurfacePresentationVisualProgram,
  CompiledVisualIntent,
  CompiledVisualSegment,
  PresentationMotionMode,
} from "./compiled-presentation-program";

export interface PresentationMoveContribution {
  readonly segmentId: EmbeddedDataId;
  readonly progress: number;
  readonly visual: Extract<CompiledVisualIntent, { readonly kind: "move" }>;
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

export interface PresentationFlowSceneState {
  readonly boundaryId: EmbeddedNodeId;
  readonly directChildIds: readonly EmbeddedNodeId[];
  readonly withheldChildIds: readonly EmbeddedNodeId[];
  readonly transition?: {
    readonly segmentIds: readonly EmbeddedDataId[];
    readonly startMs: number;
    readonly endMs: number;
    readonly progress: number;
    readonly previousWithheldChildIds: readonly EmbeddedNodeId[];
  };
}

export interface PresentationSequenceSceneState {
  readonly boundaryId: EmbeddedNodeId;
  readonly directChildIds: readonly EmbeddedNodeId[];
  readonly activeChildId: EmbeddedNodeId | null;
  readonly transition?: {
    readonly segmentIds: readonly EmbeddedDataId[];
    readonly startMs: number;
    readonly endMs: number;
    readonly progress: number;
    readonly previousActiveChildId: EmbeddedNodeId | null;
  };
}

export interface PresentationVisualScene {
  readonly surfaceId: EmbeddedNodeId;
  readonly timeMs: number;
  readonly targetStates: ReadonlyMap<EmbeddedNodeId, PresentationTargetSceneState>;
  readonly flowStates?: readonly PresentationFlowSceneState[];
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
    applySegment(mutableByTargetId.get(segment.targetId)!, segment, timeMs, motionMode);
  }

  const activeChildByBoundaryId = projectSequenceOwnership(program, timeMs);
  const targetStates = new Map<EmbeddedNodeId, PresentationTargetSceneState>();
  for (const target of program.targetById.values()) {
    const state = mutableByTargetId.get(target.targetId)!;
    const sequence =
      target.contentLayout?.contentLayout === "sequence" &&
      target.contentLayout.directChildId === target.targetId
        ? target.contentLayout
        : undefined;
    const activeChildId = sequence
      ? activeChildByBoundaryId.get(sequence.containerId)
      : undefined;
    const layoutParticipation = state.outgoingTransition
      ? "transition-overlay"
      : state.availability === "withheld"
        ? "none"
        : sequence
          ? activeChildId === sequence.directChildId
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
    program.sequenceContainers.map((container) => {
      const activeSegments = activeLayoutSegments(
        program,
        timeMs,
        motionMode,
        container.boundaryId,
      );
      return Object.freeze({
        boundaryId: container.boundaryId,
        directChildIds: container.directChildIds,
        activeChildId: activeChildByBoundaryId.get(container.boundaryId) ?? null,
        ...(activeSegments.length === 0
          ? {}
          : {
              transition: createSequenceTransition(
                program,
                container,
                activeSegments,
                timeMs,
              ),
            }),
      });
    }),
  );
  const flowStates = projectFlowStates(program, mutableByTargetId, timeMs, motionMode);
  return Object.freeze({
    surfaceId: program.surfaceId,
    timeMs,
    targetStates,
    ...(flowStates.length === 0 ? {} : { flowStates }),
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
  const transitionPaint = (
    visual: CompiledVisualIntent = segment.visual,
  ): PresentationTargetPaintState =>
    Object.freeze({ kind: "transition", segmentId: segment.id, progress, visual });

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
        Object.freeze({
          segmentId: segment.id,
          progress: reduced ? 1 : progress,
          visual: segment.visual,
        }),
      );
      state.paint = active && !reduced ? transitionPaint() : settledPaint();
      return;
    case "emphasize":
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

function projectFlowStates(
  program: CompiledSurfacePresentationVisualProgram,
  states: ReadonlyMap<EmbeddedNodeId, MutableTargetState>,
  timeMs: number,
  motionMode: PresentationMotionMode,
): readonly PresentationFlowSceneState[] {
  const directChildrenByContainerId = new Map<EmbeddedNodeId, readonly EmbeddedNodeId[]>();
  for (const target of program.targetById.values()) {
    const membership = target.contentLayout;
    if (membership?.contentLayout !== "flow") continue;
    const directChildIds = directChildrenByContainerId.get(membership.containerId);
    if (directChildIds && !idsEqual(directChildIds, membership.directChildIds)) {
      throw new Error(
        `Presentation Flow "${membership.containerId}" has inconsistent direct children.`,
      );
    }
    directChildrenByContainerId.set(membership.containerId, membership.directChildIds);
  }

  return Object.freeze(
    [...directChildrenByContainerId.entries()].map(([boundaryId, directChildIds]) => {
      const withheldChildIds = Object.freeze(
        directChildIds.filter((directChildId) => {
          const target = program.targetById.get(directChildId);
          return (
            target?.contentLayout?.containerId === boundaryId &&
            target.contentLayout.directChildId === target.targetId &&
            states.get(target.targetId)?.availability === "withheld"
          );
        }),
      );
      const activeSegments = activeLayoutSegments(
        program,
        timeMs,
        motionMode,
        boundaryId,
      );
      if (activeSegments.length === 0) {
        return Object.freeze({ boundaryId, directChildIds, withheldChildIds });
      }

      const previous = new Set(withheldChildIds);
      for (const segment of [...activeSegments].reverse()) {
        if (segment.visual.kind === "reveal") previous.add(segment.targetId);
        if (segment.visual.kind === "hide") previous.delete(segment.targetId);
      }
      const { startMs, endMs } = transitionBounds(activeSegments);
      return Object.freeze({
        boundaryId,
        directChildIds,
        withheldChildIds,
        transition: Object.freeze({
          segmentIds: Object.freeze(activeSegments.map(({ id }) => id)),
          startMs,
          endMs,
          progress: clampProgress((timeMs - startMs) / (endMs - startMs)),
          previousWithheldChildIds: Object.freeze(
            directChildIds.filter((childId) => previous.has(childId)),
          ),
        }),
      });
    }),
  );
}

function projectSequenceOwnership(
  program: CompiledSurfacePresentationVisualProgram,
  timeMs: number,
  includeBoundary = true,
): Map<EmbeddedNodeId, EmbeddedNodeId | null> {
  const activeByBoundaryId = new Map<EmbeddedNodeId, EmbeddedNodeId | null>();
  for (const container of program.sequenceContainers) {
    let activeChildId = container.initialActiveChildId;
    for (const segment of program.segments) {
      if (includeBoundary ? timeMs < segment.startMs : timeMs <= segment.startMs) continue;
      const target = program.targetById.get(segment.targetId)!;
      const membership = target.contentLayout;
      if (
        membership?.contentLayout !== "sequence" ||
        membership.containerId !== container.boundaryId ||
        membership.directChildId !== target.targetId
      ) {
        continue;
      }
      if (segment.visual.kind === "reveal") activeChildId = membership.directChildId;
    }
    if (activeChildId !== null && !container.directChildIds.includes(activeChildId)) {
      throw new Error(
        `Presentation Sequence "${container.boundaryId}" has an unknown active child.`,
      );
    }
    activeByBoundaryId.set(container.boundaryId, activeChildId);
  }
  return activeByBoundaryId;
}

function activeLayoutSegments(
  program: CompiledSurfacePresentationVisualProgram,
  timeMs: number,
  motionMode: PresentationMotionMode,
  containerId: EmbeddedNodeId,
): readonly CompiledVisualSegment[] {
  if (motionMode === "reduced-motion") return [];
  return program.segments.filter((segment) => {
    if (
      segment.endMs === segment.startMs ||
      timeMs < segment.startMs ||
      timeMs >= segment.endMs ||
      (segment.visual.kind !== "reveal" && segment.visual.kind !== "hide")
    ) {
      return false;
    }
    const target = program.targetById.get(segment.targetId)!;
    return (
      target.contentLayout?.containerId === containerId &&
      target.contentLayout.directChildId === target.targetId
    );
  });
}

function createSequenceTransition(
  program: CompiledSurfacePresentationVisualProgram,
  container: CompiledSequenceContainer,
  segments: readonly CompiledVisualSegment[],
  timeMs: number,
): NonNullable<PresentationSequenceSceneState["transition"]> {
  const { startMs, endMs } = transitionBounds(segments);
  return Object.freeze({
    segmentIds: Object.freeze(segments.map(({ id }) => id)),
    startMs,
    endMs,
    progress: clampProgress((timeMs - startMs) / (endMs - startMs)),
    previousActiveChildId:
      projectSequenceOwnership(program, startMs, false).get(container.boundaryId) ?? null,
  });
}

function transitionBounds(segments: readonly CompiledVisualSegment[]): {
  readonly startMs: number;
  readonly endMs: number;
} {
  return {
    startMs: Math.min(...segments.map(({ startMs }) => startMs)),
    endMs: Math.max(...segments.map(({ endMs }) => endMs)),
  };
}

function assertProgram(program: CompiledSurfacePresentationVisualProgram): void {
  if (!Number.isSafeInteger(program.durationMs) || program.durationMs < 0) {
    throw new Error("Presentation visual program duration is invalid.");
  }
  const timedSegmentByTargetId = new Map<EmbeddedNodeId, CompiledVisualSegment>();
  for (const target of program.targetById.values()) {
    const membership = target.contentLayout;
    if (membership && !membership.directChildIds.includes(membership.directChildId)) {
      throw new Error(
        `Presentation target "${target.targetId}" has invalid content-layout membership.`,
      );
    }
  }
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

function idsEqual(left: readonly EmbeddedNodeId[], right: readonly EmbeddedNodeId[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
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
