import { Result, type Result as ResultType } from "better-result";
import type {
  EmbeddedDataId,
  EmbeddedNodeId,
  PresentationConfigurationV1,
  SurfacePresentationTimelineV1,
  TimelineActionV1,
  TimelineAnimateActionV1,
} from "@scaffold/contracts";

import type { ProjectedSlideshowCourseStructure } from "@/document/model/course-structure";
import type { DocumentTreeSnapshot, DocumentTreeItem } from "@/document/model/document-tree";

import type {
  CompiledLearnerRequirement,
  CompiledPresentationCommand,
  CompiledPresentationCue,
  CompiledPresentationPlaybackProgram,
  CompiledPresentationWait,
  CompiledSurfacePresentationTimeline,
  CompiledSurfacePresentationVisualProgram,
  CompiledVisualSegment,
  CompiledVisualTarget,
} from "./compiled-presentation-program";
import type {
  PresentationCompilationDiagnostic,
  PresentationCompilationReport,
} from "./presentation-compilation-diagnostic";

export interface CompilePresentationInput {
  readonly configuration: PresentationConfigurationV1 | null | undefined;
  readonly courseStructure: ProjectedSlideshowCourseStructure;
  readonly semanticSnapshot: DocumentTreeSnapshot;
}

/**
 * Whole-program failures: the configuration no longer describes the current
 * Slideshow Surfaces, so no Surface program can be trusted. Per-action drift is
 * reported as {@link PresentationCompilationDiagnostic} instead.
 */
export type PresentationCompilationError =
  | {
      readonly reason: "surface-coverage-stale";
      readonly configuredSurfaceIds: readonly EmbeddedNodeId[];
      readonly currentSurfaceIds: readonly EmbeddedNodeId[];
    }
  | {
      readonly reason: "surface-coverage-missing";
      readonly surfaceId: EmbeddedNodeId;
    };

export type PresentationCompilationResult = ResultType<
  PresentationCompilationReport,
  PresentationCompilationError
>;

interface Scheduled<T> {
  readonly value: T;
  readonly sourceOrder: number;
}

type ActionOutcome<T> = ResultType<T, PresentationCompilationDiagnostic>;

interface CompiledSurface {
  readonly timeline: CompiledSurfacePresentationTimeline;
  readonly diagnostics: readonly PresentationCompilationDiagnostic[];
}

export function compilePresentation({
  configuration,
  courseStructure,
  semanticSnapshot,
}: CompilePresentationInput): PresentationCompilationResult {
  if (configuration === null || configuration === undefined) {
    return Result.ok(Object.freeze({ program: null, diagnostics: Object.freeze([]) }));
  }
  const coverage = validateSurfaceCoverage(configuration, courseStructure, semanticSnapshot);
  if (coverage.isErr()) return Result.err(coverage.error);

  const sourceBySurfaceId = new Map(
    configuration.surfaces.map((surface) => [surface.surfaceId, surface]),
  );
  const surfaces: CompiledSurfacePresentationTimeline[] = [];
  const diagnostics: PresentationCompilationDiagnostic[] = [];
  for (const surfaceId of courseStructure.surfaceIds) {
    const compiled = compileSurface(sourceBySurfaceId.get(surfaceId)!, semanticSnapshot);
    surfaces.push(compiled.timeline);
    diagnostics.push(...compiled.diagnostics);
  }
  const program: CompiledPresentationPlaybackProgram = Object.freeze({
    schemaVersion: configuration.schemaVersion,
    autoAdvance: configuration.autoAdvance,
    allowPrevious: configuration.allowPrevious,
    surfaces: Object.freeze(surfaces),
    surfaceById: new Map(surfaces.map((surface) => [surface.surfaceId, surface])),
  });
  return Result.ok(Object.freeze({ program, diagnostics: Object.freeze(diagnostics) }));
}

function validateSurfaceCoverage(
  configuration: PresentationConfigurationV1,
  courseStructure: ProjectedSlideshowCourseStructure,
  semanticSnapshot: DocumentTreeSnapshot,
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
  snapshot: DocumentTreeSnapshot,
): CompiledSurface {
  assertSafeTime(source.durationMs, `Surface "${source.surfaceId}" duration`);
  const enabled = source.actions
    .map((action, sourceOrder): Scheduled<TimelineActionV1> => ({ value: action, sourceOrder }))
    .filter(({ value }) => value.isEnabled);

  const cues: Scheduled<CompiledPresentationCue>[] = [];
  const waits: Scheduled<CompiledPresentationWait>[] = [];
  const animates: Scheduled<TimelineAnimateActionV1>[] = [];
  const diagnostics: Scheduled<PresentationCompilationDiagnostic>[] = [];
  const report = (diagnostic: PresentationCompilationDiagnostic, sourceOrder: number): void => {
    diagnostics.push({ value: diagnostic, sourceOrder });
  };

  for (const { value: action, sourceOrder } of enabled) {
    switch (action.kind) {
      case "trigger": {
        const cue = compileCue(action, source.surfaceId, snapshot);
        if (cue.isErr()) report(cue.error, sourceOrder);
        else cues.push({ value: cue.value, sourceOrder });
        break;
      }
      case "manual-wait":
      case "learner-wait": {
        const wait = compileWait(action, source.surfaceId, snapshot);
        if (wait.isErr()) report(wait.error, sourceOrder);
        else waits.push({ value: wait.value, sourceOrder });
        break;
      }
      case "animate":
        animates.push({ value: action, sourceOrder });
        break;
    }
  }
  const visualProgram = compileVisualProgram(source, animates, snapshot, report);

  const timeline: CompiledSurfacePresentationTimeline = Object.freeze({
    surfaceId: source.surfaceId,
    durationMs: source.durationMs,
    ...(source.narration ? { narration: source.narration } : {}),
    transition: source.transition ? Object.freeze({ ...source.transition }) : null,
    cues: sortScheduled(cues),
    waits: sortScheduled(waits),
    visualProgram,
  });
  return {
    timeline,
    diagnostics: Object.freeze(
      [...diagnostics]
        .sort((left, right) => left.sourceOrder - right.sourceOrder)
        .map(({ value }) => value),
    ),
  };
}

function compileCue(
  action: Extract<TimelineActionV1, { kind: "trigger" }>,
  surfaceId: EmbeddedNodeId,
  snapshot: DocumentTreeSnapshot,
): ActionOutcome<CompiledPresentationCue> {
  const { command } = action;
  let compiledCommand: CompiledPresentationCommand;
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
    compiledCommand = Object.freeze({ ...command });
  } else {
    const target = resolveTargetOnSurface(snapshot, command.targetId, surfaceId, action.id);
    if (target.isErr()) return Result.err(target.error);
    compiledCommand = Object.freeze({
      kind: "target-command",
      ownerId: resolveOwnerId(snapshot, command.targetId),
      targetId: command.targetId,
      type: command.type,
      ...(command.input === undefined ? {} : { input: command.input }),
    });
  }
  return Result.ok(
    Object.freeze({
      id: action.id,
      atMs: action.atMs,
      command: compiledCommand,
      seekBehavior: classifyCueSeekBehavior(compiledCommand, snapshot),
    }),
  );
}

function classifyCueSeekBehavior(
  command: CompiledPresentationCommand,
  snapshot: DocumentTreeSnapshot,
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
  snapshot: DocumentTreeSnapshot,
): ActionOutcome<CompiledPresentationWait> {
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
  entries: readonly Scheduled<TimelineAnimateActionV1>[],
  snapshot: DocumentTreeSnapshot,
  report: (diagnostic: PresentationCompilationDiagnostic, sourceOrder: number) => void,
): CompiledSurfacePresentationVisualProgram {
  const candidates: Scheduled<CompiledVisualSegment>[] = [];
  for (const { value: action, sourceOrder } of entries) {
    const target = resolveVisualTarget(action, source.surfaceId, snapshot);
    if (target.isErr()) {
      report(target.error, sourceOrder);
      continue;
    }
    candidates.push({
      value: Object.freeze({
        id: action.id,
        targetId: action.targetId,
        startMs: action.atMs,
        endMs: action.atMs + visualDuration(action),
        visual: compileVisualIntent(action.visual),
      }),
      sourceOrder,
    });
  }
  candidates.sort(compareScheduled);

  const segments = acceptNonOverlapping(source.surfaceId, candidates, report);

  const targetById = new Map<EmbeddedNodeId, CompiledVisualTarget>();
  for (const segment of segments) {
    if (targetById.has(segment.targetId)) continue;
    const firstVisibility = segments.find(
      (candidate) =>
        candidate.targetId === segment.targetId &&
        (candidate.visual.kind === "reveal" || candidate.visual.kind === "hide"),
    );
    targetById.set(
      segment.targetId,
      Object.freeze({
        targetId: segment.targetId,
        initialVisibility: firstVisibility?.visual.kind === "reveal" ? "withheld" : "visible",
      }),
    );
  }

  return Object.freeze({
    surfaceId: source.surfaceId,
    durationMs: source.durationMs,
    targetById,
    segments,
  });
}

/**
 * Applies the V1 overlap invariants in schedule order, keeping the earlier
 * action and omitting each later overlapping one with a diagnostic. Instant
 * segments never overlap.
 */
function acceptNonOverlapping(
  surfaceId: EmbeddedNodeId,
  candidates: readonly Scheduled<CompiledVisualSegment>[],
  report: (diagnostic: PresentationCompilationDiagnostic, sourceOrder: number) => void,
): readonly CompiledVisualSegment[] {
  const accepted: CompiledVisualSegment[] = [];
  const priorByTargetId = new Map<EmbeddedNodeId, CompiledVisualSegment>();
  for (const { value: segment, sourceOrder } of candidates) {
    if (segment.endMs > segment.startMs) {
      const prior = priorByTargetId.get(segment.targetId);
      if (prior && segment.startMs < prior.endMs) {
        report(
          Object.freeze({
            reason: "same-target-timed-overlap" as const,
            surfaceId,
            targetId: segment.targetId,
            earlierActionId: prior.id,
            laterActionId: segment.id,
          }),
          sourceOrder,
        );
        continue;
      }
      priorByTargetId.set(segment.targetId, segment);
    }
    accepted.push(segment);
  }
  return Object.freeze(accepted);
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
  snapshot: DocumentTreeSnapshot,
): ActionOutcome<DocumentTreeItem> {
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
  snapshot: DocumentTreeSnapshot,
  targetId: EmbeddedNodeId,
  surfaceId: EmbeddedNodeId,
  actionId: EmbeddedDataId,
): ActionOutcome<DocumentTreeItem> {
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
  snapshot: DocumentTreeSnapshot,
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

function sortScheduled<T extends { readonly atMs: number }>(
  scheduled: readonly Scheduled<T>[],
): readonly T[] {
  return Object.freeze([...scheduled].sort(compareScheduled).map(({ value }) => value));
}

function compareScheduled(
  left: Scheduled<{ readonly atMs?: number; readonly startMs?: number }>,
  right: Scheduled<{ readonly atMs?: number; readonly startMs?: number }>,
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
