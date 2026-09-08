import type {
  EmbeddedNodeId,
  PresentationConfigurationV1,
  SurfacePresentationTimelineV1,
} from "@scaffold/contracts";
import { Result, type Result as ResultType } from "better-result";

export interface PresentationSurfaceCoverageError {
  readonly reason: "surface-coverage-stale";
  readonly configuredSurfaceIds: readonly EmbeddedNodeId[];
  readonly currentSurfaceIds: readonly EmbeddedNodeId[];
}

export type PreparePresentationConfigurationResult = ResultType<
  PresentationConfigurationV1,
  PresentationSurfaceCoverageError
>;

/**
 * Purely prepares current Presentation configuration. It never reads editor
 * state or dispatches, so a structural command can include the result in its
 * own transaction.
 */
export function preparePresentationConfiguration(
  configuration: PresentationConfigurationV1 | null,
  currentSurfaceIds: readonly EmbeddedNodeId[],
): PreparePresentationConfigurationResult {
  if (configuration === null) {
    return Result.ok({
      schemaVersion: 1,
      autoAdvance: false,
      allowPrevious: true,
      surfaces: currentSurfaceIds.map(createEmptyPresentationTimeline),
    });
  }
  const coverage = validatePresentationSurfaceCoverage(configuration, currentSurfaceIds);
  return coverage.isErr() ? Result.err(coverage.error) : Result.ok(configuration);
}

export function validatePresentationSurfaceCoverage(
  configuration: PresentationConfigurationV1,
  currentSurfaceIds: readonly EmbeddedNodeId[],
): ResultType<void, PresentationSurfaceCoverageError> {
  const configuredSurfaceIds = configuration.surfaces.map(({ surfaceId }) => surfaceId);
  const configuredIds = new Set(configuredSurfaceIds);
  if (
    configuredSurfaceIds.length === currentSurfaceIds.length &&
    currentSurfaceIds.every((surfaceId) => configuredIds.has(surfaceId))
  ) {
    return Result.ok();
  }
  return Result.err(
    Object.freeze({
      reason: "surface-coverage-stale" as const,
      configuredSurfaceIds: Object.freeze(configuredSurfaceIds),
      currentSurfaceIds: Object.freeze([...currentSurfaceIds]),
    }),
  );
}

export function createEmptyPresentationTimeline(
  surfaceId: EmbeddedNodeId,
): SurfacePresentationTimelineV1 {
  return {
    surfaceId,
    durationMs: 0,
    layerTracks: [],
    actions: [],
  };
}
