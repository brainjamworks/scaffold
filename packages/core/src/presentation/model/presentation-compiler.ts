import type {
  EmbeddedNodeId,
  PresentationConfigurationV1,
  SurfacePresentationTimelineV1,
  TimelineActionV1,
  TimelineAnimateActionV1,
} from "@scaffold/contracts";

import type { ProjectedSlideshowCourseStructure } from "@/document/model/course-structure";
import {
  resolveSemanticPresentationContainer,
  type SemanticDocumentSnapshot,
  type SemanticItem,
} from "@/document/model/semantic-document";

import type {
  CompiledLearnerRequirement,
  CompiledPresentationCommand,
  CompiledPresentationCue,
  CompiledPresentationPlaybackProgram,
  CompiledPresentationWait,
  CompiledSequenceContainer,
  CompiledSurfacePresentationTimeline,
  CompiledSurfacePresentationVisualProgram,
  CompiledVisualSegment,
  CompiledVisualTarget,
} from "./compiled-presentation-program";

export interface CompilePresentationInput {
  readonly configuration: PresentationConfigurationV1 | null | undefined;
  readonly courseStructure: ProjectedSlideshowCourseStructure;
  readonly semanticSnapshot: SemanticDocumentSnapshot;
}

export function compilePresentation({
  configuration,
  courseStructure,
  semanticSnapshot,
}: CompilePresentationInput): CompiledPresentationPlaybackProgram | null {
  if (configuration === null || configuration === undefined) return null;
  assertSurfaceCoverage(configuration, courseStructure, semanticSnapshot);

  const sourceBySurfaceId = new Map(
    configuration.surfaces.map((surface) => [surface.surfaceId, surface]),
  );
  const surfaces = courseStructure.surfaceIds.map((surfaceId) =>
    compileSurface(sourceBySurfaceId.get(surfaceId)!, semanticSnapshot),
  );
  const program: CompiledPresentationPlaybackProgram = {
    schemaVersion: configuration.schemaVersion,
    autoAdvance: configuration.autoAdvance,
    allowPrevious: configuration.allowPrevious,
    surfaces: Object.freeze(surfaces),
    surfaceById: new Map(surfaces.map((surface) => [surface.surfaceId, surface])),
  };
  return Object.freeze(program);
}

function assertSurfaceCoverage(
  configuration: PresentationConfigurationV1,
  courseStructure: ProjectedSlideshowCourseStructure,
  semanticSnapshot: SemanticDocumentSnapshot,
): void {
  if (configuration.surfaces.length !== courseStructure.surfaceIds.length) {
    throw new Error("Presentation Surface coverage does not match the current Slideshow.");
  }
  const configuredIds = new Set(configuration.surfaces.map(({ surfaceId }) => surfaceId));
  for (const surfaceId of courseStructure.surfaceIds) {
    if (!configuredIds.has(surfaceId)) {
      throw new Error(`Presentation Surface coverage is missing "${surfaceId}".`);
    }
    const item = semanticSnapshot.itemById.get(surfaceId);
    if (!item || item.kind !== "surface") {
      throw new Error(`Presentation Surface "${surfaceId}" is not a current semantic Surface.`);
    }
  }
}

function compileSurface(
  source: SurfacePresentationTimelineV1,
  snapshot: SemanticDocumentSnapshot,
): CompiledSurfacePresentationTimeline {
  assertSafeTime(source.durationMs, `Surface "${source.surfaceId}" duration`);
  const scheduled = source.actions
    .map((action, sourceOrder) => ({ action, sourceOrder }))
    .filter(({ action }) => action.isEnabled);

  const cues = scheduled
    .filter(
      (entry): entry is { action: Extract<TimelineActionV1, { kind: "trigger" }>; sourceOrder: number } =>
        entry.action.kind === "trigger",
    )
    .map(({ action, sourceOrder }) => {
      const command = compileCommand(action.command, source.surfaceId, snapshot);
      return {
        value: Object.freeze({
          id: action.id,
          atMs: action.atMs,
          command,
          seekBehavior: classifyCueSeekBehavior(command, snapshot),
        }) satisfies CompiledPresentationCue,
        sourceOrder,
      };
    });
  const waits = scheduled
    .filter(
      (entry): entry is {
        action: Extract<TimelineActionV1, { kind: "manual-wait" | "learner-wait" }>;
        sourceOrder: number;
      } => entry.action.kind === "manual-wait" || entry.action.kind === "learner-wait",
    )
    .map(({ action, sourceOrder }) => ({
      value: compileWait(action, source.surfaceId, snapshot),
      sourceOrder,
    }));
  const animateEntries = scheduled.filter(
    (entry): entry is { action: TimelineAnimateActionV1; sourceOrder: number } =>
      entry.action.kind === "animate",
  );
  const visualProgram = compileVisualProgram(source, animateEntries, snapshot);

  const timeline: CompiledSurfacePresentationTimeline = {
    surfaceId: source.surfaceId,
    durationMs: source.durationMs,
    ...(source.narration ? { narration: source.narration } : {}),
    ...(source.transition ? { transition: source.transition } : {}),
    cues: sortScheduled(cues),
    waits: sortScheduled(waits),
    visualProgram,
  };
  return Object.freeze(timeline);
}

function compileCommand(
  command: Extract<TimelineActionV1, { kind: "trigger" }>["command"],
  surfaceId: EmbeddedNodeId,
  snapshot: SemanticDocumentSnapshot,
): CompiledPresentationCommand {
  if (command.kind === "navigate-surface") {
    const destination = snapshot.itemById.get(command.surfaceId);
    if (!destination || destination.kind !== "surface") {
      throw new Error(`Presentation navigation destination "${command.surfaceId}" is not current.`);
    }
    return Object.freeze(command);
  }
  assertTargetOnSurface(snapshot, command.targetId, surfaceId);
  return Object.freeze({
    ...command,
    ownerId: resolveOwnerId(snapshot, command.targetId),
  });
}

function classifyCueSeekBehavior(
  command: CompiledPresentationCommand,
  snapshot: SemanticDocumentSnapshot,
): CompiledPresentationCue["seekBehavior"] {
  if (command.kind === "navigate-surface") return "consume";
  const target = snapshot.itemById.get(command.targetId);
  if (!target) throw new Error(`Presentation target "${command.targetId}" is not current.`);
  return target.presentation.reconstructableCommandTypes?.includes(command.type)
    ? "reconstruct-state"
    : "consume";
}

function compileWait(
  action: Extract<TimelineActionV1, { kind: "manual-wait" | "learner-wait" }>,
  surfaceId: EmbeddedNodeId,
  snapshot: SemanticDocumentSnapshot,
): CompiledPresentationWait {
  if (action.kind === "manual-wait") {
    return Object.freeze({ kind: action.kind, id: action.id, atMs: action.atMs });
  }
  const { requirement } = action;
  assertTargetOnSurface(snapshot, requirement.targetId, surfaceId);
  const compiledRequirement: CompiledLearnerRequirement = Object.freeze({
    ...requirement,
    ownerId: resolveOwnerId(snapshot, requirement.targetId),
  });
  return Object.freeze({
    kind: action.kind,
    id: action.id,
    atMs: action.atMs,
    requirement: compiledRequirement,
  });
}

function compileVisualProgram(
  source: SurfacePresentationTimelineV1,
  entries: readonly { readonly action: TimelineAnimateActionV1; readonly sourceOrder: number }[],
  snapshot: SemanticDocumentSnapshot,
): CompiledSurfacePresentationVisualProgram {
  const scheduled = entries
    .map(({ action, sourceOrder }) => {
      const target = assertVisualTarget(action, source.surfaceId, snapshot);
      const segment: CompiledVisualSegment = Object.freeze({
        id: action.id,
        targetId: action.targetId,
        startMs: action.atMs,
        endMs: action.atMs + visualDuration(action),
        visual: action.visual,
      });
      return { value: segment, sourceOrder, target };
    })
    .sort(compareScheduled);
  assertNoTimedOverlap(scheduled.map(({ value }) => value));

  const actionTargetIds = new Set(scheduled.map(({ value }) => value.targetId));
  const targetById = new Map<EmbeddedNodeId, CompiledVisualTarget>();
  const sequenceByBoundaryId = new Map<EmbeddedNodeId, CompiledSequenceContainer>();
  for (const targetId of actionTargetIds) {
    const target = snapshot.itemById.get(targetId)!;
    const firstVisibility = scheduled.find(
      ({ value }) =>
        value.targetId === targetId &&
        (value.visual.kind === "reveal" || value.visual.kind === "hide"),
    );
    const container = resolveSemanticPresentationContainer(snapshot, targetId);
    const sequence = container?.contentLayout === "sequence" ? container : null;
    const compiledTarget: CompiledVisualTarget = Object.freeze({
      targetId,
      initialVisibility: firstVisibility?.value.visual.kind === "reveal" ? "withheld" : "visible",
      ...(sequence
        ? {
            sequence: Object.freeze({
              boundaryId: sequence.boundaryId,
              directChildId: sequence.directChildId,
            }),
          }
        : {}),
    });
    targetById.set(targetId, compiledTarget);
    if (sequence && !sequenceByBoundaryId.has(sequence.boundaryId)) {
      const boundary = snapshot.itemById.get(sequence.boundaryId)!;
      const directChildIds = Object.freeze(boundary.children.map(({ id }) => id));
      sequenceByBoundaryId.set(
        sequence.boundaryId,
        Object.freeze({
          boundaryId: sequence.boundaryId,
          directChildIds,
          initialActiveChildId: directChildIds[0] ?? null,
        }),
      );
    }
    void target;
  }

  return Object.freeze({
    surfaceId: source.surfaceId,
    durationMs: source.durationMs,
    targetById,
    segments: Object.freeze(scheduled.map(({ value }) => value)),
    sequenceContainers: Object.freeze([...sequenceByBoundaryId.values()]),
  });
}

function assertVisualTarget(
  action: TimelineAnimateActionV1,
  surfaceId: EmbeddedNodeId,
  snapshot: SemanticDocumentSnapshot,
): SemanticItem {
  const target = assertTargetOnSurface(snapshot, action.targetId, surfaceId);
  if (!target.presentation.actionIds.includes(action.visual.kind)) {
    throw new Error(
      `Presentation target "${action.targetId}" does not declare visual capability "${action.visual.kind}".`,
    );
  }
  return target;
}

function assertTargetOnSurface(
  snapshot: SemanticDocumentSnapshot,
  targetId: EmbeddedNodeId,
  surfaceId: EmbeddedNodeId,
): SemanticItem {
  const target = snapshot.itemById.get(targetId);
  if (!target) throw new Error(`Presentation target "${targetId}" is not current.`);
  const location = snapshot.locationById.get(targetId);
  if (!location || location.surfaceId !== surfaceId) {
    throw new Error(`Presentation target "${targetId}" does not belong to Surface "${surfaceId}".`);
  }
  return target;
}

function resolveOwnerId(
  snapshot: SemanticDocumentSnapshot,
  targetId: EmbeddedNodeId,
): EmbeddedNodeId {
  const target = snapshot.itemById.get(targetId)!;
  if (target.kind === "surface" || target.kind === "layout" || target.kind === "block") {
    return targetId;
  }
  const activationPath = snapshot.locationById.get(targetId)?.activationPath;
  const ownerId = activationPath?.at(-1)?.ownerId;
  if (!ownerId) throw new Error(`Presentation target "${targetId}" has no semantic owner.`);
  return ownerId;
}

function visualDuration(action: TimelineAnimateActionV1): number {
  if (action.visual.kind === "reveal" || action.visual.kind === "hide") {
    return action.visual.transition.kind === "instant" ? 0 : action.visual.transition.durationMs;
  }
  return action.visual.durationMs;
}

function assertNoTimedOverlap(segments: readonly CompiledVisualSegment[]): void {
  const endByTargetId = new Map<EmbeddedNodeId, number>();
  for (const segment of segments) {
    if (segment.endMs === segment.startMs) continue;
    const priorEnd = endByTargetId.get(segment.targetId);
    if (priorEnd !== undefined && segment.startMs < priorEnd) {
      throw new Error(`Timed Presentation actions overlap on target "${segment.targetId}".`);
    }
    endByTargetId.set(segment.targetId, segment.endMs);
  }
}

function sortScheduled<T>(
  scheduled: readonly { readonly value: T & { readonly atMs: number }; readonly sourceOrder: number }[],
): readonly T[] {
  return Object.freeze([...scheduled].sort(compareScheduled).map(({ value }) => value));
}

function compareScheduled(
  left: { readonly value: { readonly atMs?: number; readonly startMs?: number }; readonly sourceOrder: number },
  right: { readonly value: { readonly atMs?: number; readonly startMs?: number }; readonly sourceOrder: number },
): number {
  const leftTime = left.value.atMs ?? left.value.startMs!;
  const rightTime = right.value.atMs ?? right.value.startMs!;
  return leftTime - rightTime || left.sourceOrder - right.sourceOrder;
}

function assertSafeTime(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
}
