import { Result, type Result as ResultType } from "better-result";
import type {
  EmbeddedDataId,
  EmbeddedNodeId,
  PresentationConfigurationV1,
  SurfacePresentationTimelineV1,
  TimelineActionV1,
  TimelineAnimateActionV1,
} from "@scaffold/contracts";

import type { ControlCapabilityCatalogue } from "@/document/control-binding";
import {
  isControlCommandInputValid,
  isControlValueValid,
} from "@/document/control-binding/control-value-validation";
import type { ProjectedSlideshowCourseStructure } from "@/document/model/course-structure";
import type { DocumentTreeSnapshot, DocumentTreeItem } from "@/document/model/document-tree";

import type {
  CompiledLearnerRequirement,
  CompiledOwnerLayerTrack,
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
import { blocksPresentationSurface } from "./presentation-compilation-diagnostic";
import {
  type PresentationSurfaceCoverageError,
  validatePresentationSurfaceCoverage,
} from "./presentation-configuration";
import { compilePresentationLayerTracks } from "./presentation-layer-track";

export interface CompilePresentationInput {
  readonly configuration: PresentationConfigurationV1 | null | undefined;
  readonly courseStructure: ProjectedSlideshowCourseStructure;
  readonly semanticSnapshot: DocumentTreeSnapshot;
  readonly controlCapabilities: ControlCapabilityCatalogue;
}

/**
 * Whole-program failures: the configuration no longer describes the current
 * Slideshow Surfaces, so no Surface program can be trusted. Surface-local
 * authoring drift is reported as {@link PresentationCompilationDiagnostic}.
 */
export type PresentationCompilationError =
  | PresentationSurfaceCoverageError
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

type PresentationReferenceSource =
  | { readonly kind: "visual-effect"; readonly actionId: EmbeddedDataId }
  | { readonly kind: "trigger-command"; readonly actionId: EmbeddedDataId }
  | { readonly kind: "learner-wait"; readonly waitId: EmbeddedDataId };

type ActionOutcome<T> = ResultType<T, PresentationCompilationDiagnostic>;

interface CompiledSurface {
  readonly timeline: CompiledSurfacePresentationTimeline;
  readonly diagnostics: readonly PresentationCompilationDiagnostic[];
  readonly blocked: boolean;
}

export function compilePresentation({
  configuration,
  courseStructure,
  semanticSnapshot,
  controlCapabilities,
}: CompilePresentationInput): PresentationCompilationResult {
  if (configuration === null || configuration === undefined) {
    return Result.ok(
      Object.freeze({ program: null, surfaces: Object.freeze([]), diagnostics: Object.freeze([]) }),
    );
  }
  const coverage = validateSurfaceCoverage(configuration, courseStructure, semanticSnapshot);
  if (coverage.isErr()) return Result.err(coverage.error);

  const sourceBySurfaceId = new Map(
    configuration.surfaces.map((surface) => [surface.surfaceId, surface]),
  );
  const surfaces: CompiledSurfacePresentationTimeline[] = [];
  const outcomes: PresentationCompilationReport["surfaces"][number][] = [];
  const diagnostics: PresentationCompilationDiagnostic[] = [];
  for (const surfaceId of courseStructure.surfaceIds) {
    const compiled = compileSurface(
      sourceBySurfaceId.get(surfaceId)!,
      semanticSnapshot,
      controlCapabilities,
      new Set(courseStructure.surfaceIds),
    );
    if (compiled.blocked) {
      outcomes.push(
        Object.freeze({
          status: "blocked" as const,
          surfaceId,
          diagnostics: compiled.diagnostics,
        }),
      );
    } else {
      surfaces.push(compiled.timeline);
      outcomes.push(
        Object.freeze({
          status: "playable" as const,
          surfaceId,
          program: compiled.timeline,
          diagnostics: compiled.diagnostics,
        }),
      );
    }
    diagnostics.push(...compiled.diagnostics);
  }
  const program: CompiledPresentationPlaybackProgram | null = outcomes.some(
    ({ status }) => status === "blocked",
  )
    ? null
    : Object.freeze({
        schemaVersion: configuration.schemaVersion,
        autoAdvance: configuration.autoAdvance,
        allowPrevious: configuration.allowPrevious,
        surfaces: Object.freeze(surfaces),
        surfaceById: new Map(surfaces.map((surface) => [surface.surfaceId, surface])),
      });
  return Result.ok(
    Object.freeze({
      program,
      surfaces: Object.freeze(outcomes),
      diagnostics: Object.freeze(diagnostics),
    }),
  );
}

function validateSurfaceCoverage(
  configuration: PresentationConfigurationV1,
  courseStructure: ProjectedSlideshowCourseStructure,
  semanticSnapshot: DocumentTreeSnapshot,
): ResultType<void, PresentationCompilationError> {
  const currentSurfaceIds = [...courseStructure.surfaceIds];
  const coverage = validatePresentationSurfaceCoverage(configuration, currentSurfaceIds);
  if (coverage.isErr()) return Result.err(coverage.error);
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
  controlCapabilities: ControlCapabilityCatalogue,
  currentSurfaceIds: ReadonlySet<EmbeddedNodeId>,
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
  const compiledLayers = compilePresentationLayerTracks(source, snapshot);
  compiledLayers.diagnostics.forEach((diagnostic, sourceOrder) =>
    report(diagnostic, -compiledLayers.diagnostics.length + sourceOrder),
  );

  for (const { value: action, sourceOrder } of enabled) {
    switch (action.kind) {
      case "trigger": {
        const cue = compileCue(
          action,
          source.surfaceId,
          snapshot,
          controlCapabilities,
          currentSurfaceIds,
        );
        if (cue.isErr()) report(cue.error, sourceOrder);
        else cues.push({ value: cue.value, sourceOrder });
        break;
      }
      case "manual-wait":
      case "learner-wait": {
        const wait = compileWait(
          action,
          source.surfaceId,
          snapshot,
          controlCapabilities,
          compiledLayers.trackByOwnerId,
        );
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
    layerTracks: compiledLayers.tracks,
    layerTrackByOwnerId: compiledLayers.trackByOwnerId,
    visualProgram,
  });
  const frozenDiagnostics = Object.freeze(
    [...diagnostics]
      .sort((left, right) => left.sourceOrder - right.sourceOrder)
      .map(({ value }) => value),
  );
  return {
    timeline,
    diagnostics: frozenDiagnostics,
    blocked: frozenDiagnostics.some(blocksPresentationSurface),
  };
}

function compileCue(
  action: Extract<TimelineActionV1, { kind: "trigger" }>,
  surfaceId: EmbeddedNodeId,
  snapshot: DocumentTreeSnapshot,
  controlCapabilities: ControlCapabilityCatalogue,
  currentSurfaceIds: ReadonlySet<EmbeddedNodeId>,
): ActionOutcome<CompiledPresentationCue> {
  const { command } = action;
  let compiledCommand: CompiledPresentationCommand;
  if (command.kind === "navigate-surface") {
    const destination = snapshot.itemById.get(command.surfaceId);
    if (
      !currentSurfaceIds.has(command.surfaceId) ||
      !destination ||
      destination.kind !== "surface"
    ) {
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
    const target = resolveTargetOnSurface(snapshot, command.targetId, surfaceId, {
      kind: "trigger-command",
      actionId: action.id,
    });
    if (target.isErr()) return Result.err(target.error);
    const resolved = controlCapabilities.resolveCommand(command.targetId, command.type);
    if (resolved.isErr()) {
      assertCatalogueTargetRemainsPublic(resolved.error.reason, command.targetId);
      return Result.err(
        Object.freeze({
          reason: "trigger-command-unavailable" as const,
          surfaceId,
          actionId: action.id,
          targetId: command.targetId,
          type: command.type,
        }),
      );
    }
    assertResolvedControlTarget(resolved.value.targetId, command.targetId);
    const hasInput = Object.hasOwn(command, "input");
    if (!isControlCommandInputValid(command.input, resolved.value.command.input, hasInput)) {
      return Result.err(
        Object.freeze({
          reason: "trigger-command-input-invalid" as const,
          surfaceId,
          actionId: action.id,
          targetId: command.targetId,
          type: command.type,
          input: Object.freeze(
            command.input === undefined
              ? { kind: "absent" as const }
              : { kind: "value" as const, value: command.input },
          ),
        }),
      );
    }
    compiledCommand = Object.freeze({
      kind: "target-command",
      ownerId: resolved.value.ownerId,
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
  controlCapabilities: ControlCapabilityCatalogue,
  layerTrackByOwnerId: ReadonlyMap<EmbeddedNodeId, CompiledOwnerLayerTrack>,
): ActionOutcome<CompiledPresentationWait> {
  if (action.kind === "manual-wait") {
    return Result.ok(
      Object.freeze({
        kind: action.kind,
        id: action.id,
        atMs: action.atMs,
        boundary: action.boundary,
      }),
    );
  }
  const { requirement } = action;
  const target = resolveTargetOnSurface(snapshot, requirement.targetId, surfaceId, {
    kind: "learner-wait",
    waitId: action.id,
  });
  if (target.isErr()) return Result.err(target.error);
  const resolved = controlCapabilities.resolve(requirement.targetId);
  if (resolved.isErr()) {
    assertCatalogueTargetRemainsPublic(resolved.error.reason, requirement.targetId);
    return Result.err(unavailableWaitCapability(action, surfaceId));
  }
  assertResolvedControlTarget(resolved.value.targetId, requirement.targetId);
  if (requirement.kind === "event") {
    if (!resolved.value.capabilities.events?.some(({ type }) => type === requirement.type)) {
      return Result.err(unavailableWaitCapability(action, surfaceId));
    }
  } else {
    const state = resolved.value.capabilities.states?.find(({ key }) => key === requirement.key);
    if (!state) return Result.err(unavailableWaitCapability(action, surfaceId));
    if (!isControlValueValid(requirement.equals, state.valueType)) {
      return Result.err(
        Object.freeze({
          reason: "required-state-value-invalid" as const,
          surfaceId,
          waitId: action.id,
          targetId: requirement.targetId,
          key: requirement.key,
          value: requirement.equals,
        }),
      );
    }
  }
  if (requirement.kind === "event") {
    const unreachable = findUnavailableRequiredLayer(action, snapshot, layerTrackByOwnerId);
    if (unreachable) return Result.err(unreachable);
  }
  const compiledRequirement: CompiledLearnerRequirement = Object.freeze({
    ...requirement,
    ownerId: resolved.value.ownerId,
  });
  return Result.ok(
    Object.freeze({
      kind: action.kind,
      id: action.id,
      atMs: action.atMs,
      boundary: action.boundary,
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
  const target = resolveTargetOnSurface(snapshot, action.targetId, surfaceId, {
    kind: "visual-effect",
    actionId: action.id,
  });
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
  source: PresentationReferenceSource,
): ActionOutcome<DocumentTreeItem> {
  const target = snapshot.itemById.get(targetId);
  if (!target) {
    return Result.err(
      Object.freeze({
        reason: "referenced-target-missing" as const,
        surfaceId,
        source: Object.freeze(source),
        targetId,
      }),
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
        reason: "target-moved-surface" as const,
        source: Object.freeze(source),
        targetId,
        expectedSurfaceId: surfaceId,
        actualSurfaceId: location.surfaceId,
      }),
    );
  }
  return Result.ok(target);
}

function unavailableWaitCapability(
  action: Extract<TimelineActionV1, { kind: "learner-wait" }>,
  surfaceId: EmbeddedNodeId,
): Extract<PresentationCompilationDiagnostic, { reason: "unavailable-required-capability" }> {
  const capability =
    action.requirement.kind === "event"
      ? Object.freeze({ kind: "event" as const, type: action.requirement.type })
      : Object.freeze({ kind: "state" as const, key: action.requirement.key });
  return Object.freeze({
    reason: "unavailable-required-capability",
    surfaceId,
    waitId: action.id,
    targetId: action.requirement.targetId,
    capability,
  });
}

function findUnavailableRequiredLayer(
  action: Extract<TimelineActionV1, { kind: "learner-wait" }>,
  snapshot: DocumentTreeSnapshot,
  layerTrackByOwnerId: ReadonlyMap<EmbeddedNodeId, CompiledOwnerLayerTrack>,
): Extract<
  PresentationCompilationDiagnostic,
  { reason: "required-event-layer-unavailable" }
> | null {
  let currentId: EmbeddedNodeId | null = action.requirement.targetId;
  while (currentId !== null) {
    const item = snapshot.itemById.get(currentId);
    if (!item) throw new Error(`Presentation target ancestry lost current item "${currentId}".`);
    if (item.kind === "layer") {
      const ownerId = snapshot.parentById.get(item.id);
      if (ownerId === undefined || ownerId === null) {
        throw new Error(`Layer "${item.id}" has no logical owner.`);
      }
      const track = layerTrackByOwnerId.get(ownerId);
      if (track) {
        const selectedLayerId = selectedLayerAtBoundary(track, action.atMs, action.boundary);
        if (selectedLayerId !== item.id) {
          return Object.freeze({
            reason: "required-event-layer-unavailable",
            surfaceId: snapshot.locationById.get(action.requirement.targetId)!.surfaceId!,
            waitId: action.id,
            targetId: action.requirement.targetId,
            ownerId,
            requiredLayerId: item.id,
            selectedLayerId,
            atMs: action.atMs,
            boundary: action.boundary,
          });
        }
      }
    }
    currentId = snapshot.parentById.get(currentId) ?? null;
  }
  return null;
}

function selectedLayerAtBoundary(
  track: CompiledOwnerLayerTrack,
  atMs: number,
  boundary: "before-actions" | "after-actions",
): EmbeddedNodeId {
  let selected = track.initialLayerId;
  for (const entry of track.switches) {
    if (entry.atMs > atMs || (entry.atMs === atMs && boundary === "before-actions")) break;
    selected = entry.layerId;
  }
  return selected;
}

function assertCatalogueTargetRemainsPublic(reason: string, targetId: EmbeddedNodeId): void {
  if (reason === "target-not-public") {
    throw new Error(`Control capability catalogue lost public target "${targetId}".`);
  }
}

function assertResolvedControlTarget(actualId: EmbeddedNodeId, expectedId: EmbeddedNodeId): void {
  if (actualId !== expectedId) {
    throw new Error(
      `Control capability catalogue resolved target "${actualId}" instead of "${expectedId}".`,
    );
  }
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
