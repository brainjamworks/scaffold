import { Result, type Result as ResultType } from "better-result";
import type {
  EmbeddedDataId,
  EmbeddedNodeId,
  PresentationConfigurationV1,
  PresentationVisualCapabilityId,
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

export type PresentationCompilationError =
  | {
      readonly reason: "surface-coverage-stale";
      readonly configuredSurfaceIds: readonly EmbeddedNodeId[];
      readonly currentSurfaceIds: readonly EmbeddedNodeId[];
    }
  | {
      readonly reason: "surface-coverage-missing";
      readonly surfaceId: EmbeddedNodeId;
    }
  | {
      readonly reason: "navigation-destination-not-current";
      readonly surfaceId: EmbeddedNodeId;
      readonly actionId: EmbeddedDataId;
      readonly destinationSurfaceId: EmbeddedNodeId;
    }
  | {
      readonly reason: "target-not-current";
      readonly surfaceId: EmbeddedNodeId;
      readonly actionId: EmbeddedDataId;
      readonly targetId: EmbeddedNodeId;
    }
  | {
      readonly reason: "target-moved-to-another-surface";
      readonly surfaceId: EmbeddedNodeId;
      readonly currentSurfaceId: EmbeddedNodeId;
      readonly actionId: EmbeddedDataId;
      readonly targetId: EmbeddedNodeId;
    }
  | {
      readonly reason: "visual-capability-unavailable";
      readonly surfaceId: EmbeddedNodeId;
      readonly actionId: EmbeddedDataId;
      readonly targetId: EmbeddedNodeId;
      readonly capability: PresentationVisualCapabilityId;
    }
  | {
      readonly reason: "same-target-timed-overlap";
      readonly surfaceId: EmbeddedNodeId;
      readonly targetId: EmbeddedNodeId;
      readonly earlierActionId: EmbeddedDataId;
      readonly laterActionId: EmbeddedDataId;
    }
  | {
      readonly reason: "surface-timed-layout-overlap";
      readonly surfaceId: EmbeddedNodeId;
      readonly earlierActionId: EmbeddedDataId;
      readonly earlierTargetId: EmbeddedNodeId;
      readonly laterActionId: EmbeddedDataId;
      readonly laterTargetId: EmbeddedNodeId;
    };

export type PresentationCompilationResult = ResultType<
  CompiledPresentationPlaybackProgram | null,
  PresentationCompilationError
>;

export function compilePresentation({
  configuration,
  courseStructure,
  semanticSnapshot,
}: CompilePresentationInput): PresentationCompilationResult {
  if (configuration === null || configuration === undefined) return Result.ok(null);
  const coverage = validateSurfaceCoverage(configuration, courseStructure, semanticSnapshot);
  if (coverage.isErr()) return Result.err(coverage.error);

  const sourceBySurfaceId = new Map(
    configuration.surfaces.map((surface) => [surface.surfaceId, surface]),
  );
  const surfaces: CompiledSurfacePresentationTimeline[] = [];
  for (const surfaceId of courseStructure.surfaceIds) {
    const compiled = compileSurface(sourceBySurfaceId.get(surfaceId)!, semanticSnapshot);
    if (compiled.isErr()) return Result.err(compiled.error);
    surfaces.push(compiled.value);
  }
  const program: CompiledPresentationPlaybackProgram = {
    schemaVersion: configuration.schemaVersion,
    autoAdvance: configuration.autoAdvance,
    allowPrevious: configuration.allowPrevious,
    surfaces: Object.freeze(surfaces),
    surfaceById: new Map(surfaces.map((surface) => [surface.surfaceId, surface])),
  };
  return Result.ok(Object.freeze(program));
}

function validateSurfaceCoverage(
  configuration: PresentationConfigurationV1,
  courseStructure: ProjectedSlideshowCourseStructure,
  semanticSnapshot: SemanticDocumentSnapshot,
): ResultType<void, PresentationCompilationError> {
  const configuredSurfaceIds = configuration.surfaces.map(({ surfaceId }) => surfaceId);
  const currentSurfaceIds = [...courseStructure.surfaceIds];
  const configuredIds = new Set(configuredSurfaceIds);
  if (
    configuredSurfaceIds.length !== currentSurfaceIds.length ||
    currentSurfaceIds.some((surfaceId) => !configuredIds.has(surfaceId))
  ) {
    return Result.err(
      Object.freeze({
        reason: "surface-coverage-stale" as const,
        configuredSurfaceIds: Object.freeze(configuredSurfaceIds),
        currentSurfaceIds: Object.freeze(currentSurfaceIds),
      }),
    );
  }
  for (const surfaceId of courseStructure.surfaceIds) {
    const item = semanticSnapshot.itemById.get(surfaceId);
    if (!item || item.kind !== "surface") {
      return Result.err(Object.freeze({ reason: "surface-coverage-missing" as const, surfaceId }));
    }
  }
  return Result.ok();
}

function compileSurface(
  source: SurfacePresentationTimelineV1,
  snapshot: SemanticDocumentSnapshot,
): ResultType<CompiledSurfacePresentationTimeline, PresentationCompilationError> {
  assertSafeTime(source.durationMs, `Surface "${source.surfaceId}" duration`);
  const scheduled = source.actions
    .map((action, sourceOrder) => ({ action, sourceOrder }))
    .filter(({ action }) => action.isEnabled);

  const cues: Array<{ readonly value: CompiledPresentationCue; readonly sourceOrder: number }> = [];
  const waits: Array<{ readonly value: CompiledPresentationWait; readonly sourceOrder: number }> =
    [];
  for (const { action, sourceOrder } of scheduled) {
    if (action.kind === "trigger") {
      const command = compileCommand(action, source.surfaceId, snapshot);
      if (command.isErr()) return Result.err(command.error);
      cues.push({
        value: Object.freeze({
          id: action.id,
          atMs: action.atMs,
          command: command.value,
          seekBehavior: classifyCueSeekBehavior(command.value, snapshot),
        }) satisfies CompiledPresentationCue,
        sourceOrder,
      });
    } else if (action.kind === "manual-wait" || action.kind === "learner-wait") {
      const wait = compileWait(action, source.surfaceId, snapshot);
      if (wait.isErr()) return Result.err(wait.error);
      waits.push({ value: wait.value, sourceOrder });
    }
  }
  const animateEntries = scheduled.filter(
    (entry): entry is { action: TimelineAnimateActionV1; sourceOrder: number } =>
      entry.action.kind === "animate",
  );
  const visualProgram = compileVisualProgram(source, animateEntries, snapshot);
  if (visualProgram.isErr()) return Result.err(visualProgram.error);

  const timeline: CompiledSurfacePresentationTimeline = {
    surfaceId: source.surfaceId,
    durationMs: source.durationMs,
    ...(source.narration ? { narration: source.narration } : {}),
    ...(source.transition ? { transition: source.transition } : {}),
    cues: sortScheduled(cues),
    waits: sortScheduled(waits),
    visualProgram: visualProgram.value,
  };
  return Result.ok(Object.freeze(timeline));
}

function compileCommand(
  action: Extract<TimelineActionV1, { kind: "trigger" }>,
  surfaceId: EmbeddedNodeId,
  snapshot: SemanticDocumentSnapshot,
): ResultType<CompiledPresentationCommand, PresentationCompilationError> {
  const { command } = action;
  if (command.kind === "navigate-surface") {
    const destination = snapshot.itemById.get(command.surfaceId);
    if (!destination || destination.kind !== "surface") {
      return Result.err(
        Object.freeze({
          reason: "navigation-destination-not-current" as const,
          surfaceId,
          actionId: action.id,
          destinationSurfaceId: command.surfaceId,
        }),
      );
    }
    return Result.ok(Object.freeze(command));
  }
  const target = resolveTargetOnSurface(snapshot, command.targetId, surfaceId, action.id);
  if (target.isErr()) return Result.err(target.error);
  const compiledCommand: CompiledPresentationCommand = {
    kind: "target-command",
    ownerId: resolveOwnerId(snapshot, command.targetId),
    targetId: command.targetId,
    type: command.type,
    ...(command.input === undefined ? {} : { input: command.input }),
  };
  return Result.ok(Object.freeze(compiledCommand));
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
): ResultType<CompiledPresentationWait, PresentationCompilationError> {
  if (action.kind === "manual-wait") {
    return Result.ok(Object.freeze({ kind: action.kind, id: action.id, atMs: action.atMs }));
  }
  const { requirement } = action;
  const target = resolveTargetOnSurface(snapshot, requirement.targetId, surfaceId, action.id);
  if (target.isErr()) return Result.err(target.error);
  const compiledRequirement: CompiledLearnerRequirement = Object.freeze({
    ...requirement,
    ownerId: resolveOwnerId(snapshot, requirement.targetId),
  });
  return Result.ok(
    Object.freeze({
      kind: action.kind,
      id: action.id,
      atMs: action.atMs,
      requirement: compiledRequirement,
    }),
  );
}

function compileVisualProgram(
  source: SurfacePresentationTimelineV1,
  entries: readonly { readonly action: TimelineAnimateActionV1; readonly sourceOrder: number }[],
  snapshot: SemanticDocumentSnapshot,
): ResultType<CompiledSurfacePresentationVisualProgram, PresentationCompilationError> {
  const scheduled: Array<{
    readonly value: CompiledVisualSegment;
    readonly sourceOrder: number;
  }> = [];
  for (const { action, sourceOrder } of entries) {
    const target = resolveVisualTarget(action, source.surfaceId, snapshot);
    if (target.isErr()) return Result.err(target.error);
    const segment: CompiledVisualSegment = Object.freeze({
      id: action.id,
      targetId: action.targetId,
      startMs: action.atMs,
      endMs: action.atMs + visualDuration(action),
      visual: compileVisualIntent(action.visual),
    });
    scheduled.push({ value: segment, sourceOrder });
  }
  scheduled.sort(compareScheduled);
  const overlap = validateNoTimedOverlap(
    source.surfaceId,
    scheduled.map(({ value }) => value),
  );
  if (overlap.isErr()) return Result.err(overlap.error);

  const actionTargetIds = new Set(scheduled.map(({ value }) => value.targetId));
  const targetById = new Map<EmbeddedNodeId, CompiledVisualTarget>();
  const sequenceByBoundaryId = new Map<EmbeddedNodeId, CompiledSequenceContainer>();
  for (const targetId of actionTargetIds) {
    const firstVisibility = scheduled.find(
      ({ value }) =>
        value.targetId === targetId &&
        (value.visual.kind === "reveal" || value.visual.kind === "hide"),
    );
    const container = resolveSemanticPresentationContainer(snapshot, targetId);
    const containerItem = container ? snapshot.itemById.get(container.boundaryId) : undefined;
    if (container && !containerItem) {
      throw new Error(`Presentation container "${container.boundaryId}" is not current.`);
    }
    const directChildIds = container
      ? Object.freeze(containerItem!.children.map(({ id }) => id))
      : null;
    const compiledTarget: CompiledVisualTarget = Object.freeze({
      targetId,
      initialVisibility: firstVisibility?.value.visual.kind === "reveal" ? "withheld" : "visible",
      ...(container && directChildIds
        ? {
            contentLayout: Object.freeze({
              containerId: container.boundaryId,
              contentLayout: container.contentLayout,
              directChildId: container.directChildId,
              directChildIds,
            }),
          }
        : {}),
    });
    targetById.set(targetId, compiledTarget);
    if (
      container?.contentLayout === "sequence" &&
      directChildIds &&
      !sequenceByBoundaryId.has(container.boundaryId)
    ) {
      sequenceByBoundaryId.set(
        container.boundaryId,
        Object.freeze({
          boundaryId: container.boundaryId,
          directChildIds,
          initialActiveChildId: directChildIds[0] ?? null,
        }),
      );
    }
  }
  const layoutOverlap = validateNoTimedSurfaceLayoutOverlap(
    source.surfaceId,
    scheduled.map(({ value }) => value),
    targetById,
  );
  if (layoutOverlap.isErr()) return Result.err(layoutOverlap.error);

  return Result.ok(
    Object.freeze({
      surfaceId: source.surfaceId,
      durationMs: source.durationMs,
      targetById,
      segments: Object.freeze(scheduled.map(({ value }) => value)),
      sequenceContainers: Object.freeze([...sequenceByBoundaryId.values()]),
    }),
  );
}

function compileVisualIntent(
  visual: TimelineAnimateActionV1["visual"],
): CompiledVisualSegment["visual"] {
  if (visual.kind === "reveal" || visual.kind === "hide") {
    const transition =
      visual.transition.kind === "instant"
        ? Object.freeze({ ...visual.transition })
        : Object.freeze({
            ...visual.transition,
            easing: Object.freeze({ ...visual.transition.easing }),
          });
    return Object.freeze({ ...visual, transition });
  }
  return Object.freeze({ ...visual, easing: Object.freeze({ ...visual.easing }) });
}

function resolveVisualTarget(
  action: TimelineAnimateActionV1,
  surfaceId: EmbeddedNodeId,
  snapshot: SemanticDocumentSnapshot,
): ResultType<SemanticItem, PresentationCompilationError> {
  const target = resolveTargetOnSurface(snapshot, action.targetId, surfaceId, action.id);
  if (target.isErr()) return Result.err(target.error);
  if (!target.value.presentation.actionIds.includes(action.visual.kind)) {
    return Result.err(
      Object.freeze({
        reason: "visual-capability-unavailable" as const,
        surfaceId,
        actionId: action.id,
        targetId: action.targetId,
        capability: action.visual.kind,
      }),
    );
  }
  return Result.ok(target.value);
}

function resolveTargetOnSurface(
  snapshot: SemanticDocumentSnapshot,
  targetId: EmbeddedNodeId,
  surfaceId: EmbeddedNodeId,
  actionId: EmbeddedDataId,
): ResultType<SemanticItem, PresentationCompilationError> {
  const target = snapshot.itemById.get(targetId);
  if (!target) {
    return Result.err(
      Object.freeze({ reason: "target-not-current" as const, surfaceId, actionId, targetId }),
    );
  }
  const location = snapshot.locationById.get(targetId);
  if (!location) {
    throw new Error(`Presentation target "${targetId}" has no semantic location.`);
  }
  if (location.surfaceId === null) {
    throw new Error(`Presentation target "${targetId}" has no Surface ownership.`);
  }
  if (location.surfaceId !== surfaceId) {
    return Result.err(
      Object.freeze({
        reason: "target-moved-to-another-surface" as const,
        surfaceId,
        currentSurfaceId: location.surfaceId,
        actionId,
        targetId,
      }),
    );
  }
  return Result.ok(target);
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

function validateNoTimedOverlap(
  surfaceId: EmbeddedNodeId,
  segments: readonly CompiledVisualSegment[],
): ResultType<void, PresentationCompilationError> {
  const priorByTargetId = new Map<EmbeddedNodeId, CompiledVisualSegment>();
  for (const segment of segments) {
    if (segment.endMs === segment.startMs) continue;
    const prior = priorByTargetId.get(segment.targetId);
    if (prior && segment.startMs < prior.endMs) {
      return Result.err(
        Object.freeze({
          reason: "same-target-timed-overlap" as const,
          surfaceId,
          targetId: segment.targetId,
          earlierActionId: prior.id,
          laterActionId: segment.id,
        }),
      );
    }
    priorByTargetId.set(segment.targetId, segment);
  }
  return Result.ok();
}

function validateNoTimedSurfaceLayoutOverlap(
  surfaceId: EmbeddedNodeId,
  segments: readonly CompiledVisualSegment[],
  targetById: ReadonlyMap<EmbeddedNodeId, CompiledVisualTarget>,
): ResultType<void, PresentationCompilationError> {
  let prior: CompiledVisualSegment | undefined;
  for (const segment of segments) {
    if (
      segment.endMs === segment.startMs ||
      (segment.visual.kind !== "reveal" && segment.visual.kind !== "hide")
    ) {
      continue;
    }
    const membership = targetById.get(segment.targetId)?.contentLayout;
    if (!membership || membership.directChildId !== segment.targetId) continue;
    if (prior && segment.startMs < prior.endMs) {
      return Result.err(
        Object.freeze({
          reason: "surface-timed-layout-overlap" as const,
          surfaceId,
          earlierActionId: prior.id,
          earlierTargetId: prior.targetId,
          laterActionId: segment.id,
          laterTargetId: segment.targetId,
        }),
      );
    }
    prior = segment;
  }
  return Result.ok();
}

function sortScheduled<T>(
  scheduled: readonly {
    readonly value: T & { readonly atMs: number };
    readonly sourceOrder: number;
  }[],
): readonly T[] {
  return Object.freeze([...scheduled].sort(compareScheduled).map(({ value }) => value));
}

function compareScheduled(
  left: {
    readonly value: { readonly atMs?: number; readonly startMs?: number };
    readonly sourceOrder: number;
  },
  right: {
    readonly value: { readonly atMs?: number; readonly startMs?: number };
    readonly sourceOrder: number;
  },
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
