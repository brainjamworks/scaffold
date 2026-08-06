import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { cloneJsonWithNewStableIds } from "@/document/model/identity/clone-with-new-ids";
import type { CopiedBlockDefinitionLookup } from "@/document/model/identity/clone-with-new-ids";

import {
  childIndexById,
  failureMutation,
  removeVacatedBoundary,
  resolveSurfaceDestination,
  successMutation,
  type CandidateMutationResult,
  type CommandBuildContext,
} from "./transaction-helpers";
import type { CourseStructureCommand, SurfaceDestination, SurfaceId } from "./types";

type SurfaceCommand = Extract<CourseStructureCommand, { type: `surface.${string}` }>;
type NonDuplicateSurfaceCommand = Exclude<SurfaceCommand, { type: "surface.duplicate" }>;

export function buildSurfaceCandidate(
  command: NonDuplicateSurfaceCommand,
  context: CommandBuildContext,
): CandidateMutationResult {
  switch (command.type) {
    case "surface.insert":
      return insertSurface(command.surface, command.destination, context.children);
    case "surface.delete":
      return deleteSurface(command.surfaceId, context);
    case "surface.move":
      return moveSurface(command.surfaceId, command.destination, context);
  }
}

export function buildSurfaceDuplicateCandidate(
  command: Extract<SurfaceCommand, { type: "surface.duplicate" }>,
  context: CommandBuildContext,
  blockDefinitions: CopiedBlockDefinitionLookup,
): CandidateMutationResult {
  return duplicateSurface(command.surfaceId, context, blockDefinitions);
}

function insertSurface(
  surface: ProseMirrorNode,
  destination: SurfaceDestination,
  children: readonly ProseMirrorNode[],
): CandidateMutationResult {
  if (surface.type.name !== "surface") {
    return failureMutation("invalid_destination", "Only a Surface node can be inserted.");
  }
  const destinationIndex = resolveSurfaceDestination(children, destination);
  if (destinationIndex < 0) {
    return failureMutation("invalid_destination", "The destination Surface does not exist.");
  }
  return successMutation([
    ...children.slice(0, destinationIndex),
    surface,
    ...children.slice(destinationIndex),
  ]);
}

function duplicateSurface(
  surfaceId: SurfaceId,
  { children, createId, schema }: CommandBuildContext,
  blockDefinitions: CopiedBlockDefinitionLookup,
): CandidateMutationResult {
  const sourceIndex = childIndexById(children, "surface", surfaceId);
  if (sourceIndex < 0) {
    return failureMutation("target_not_found", "The Surface does not exist.", surfaceId);
  }
  const json = cloneJsonWithNewStableIds(children[sourceIndex]!.toJSON(), {
    blockDefinitions,
    createId,
  });
  const clone = schema.nodeFromJSON(json);
  return successMutation([
    ...children.slice(0, sourceIndex + 1),
    clone,
    ...children.slice(sourceIndex + 1),
  ]);
}

function deleteSurface(
  surfaceId: SurfaceId,
  { structure, children }: CommandBuildContext,
): CandidateMutationResult {
  const sourceIndex = childIndexById(children, "surface", surfaceId);
  if (sourceIndex < 0) {
    return failureMutation("target_not_found", "The Surface does not exist.", surfaceId);
  }
  if (structure.surfaceIds.length === 1) {
    return failureMutation(
      "cannot_delete_last_surface",
      "The final Slideshow Surface cannot be deleted.",
      surfaceId,
    );
  }

  const surfaceIndex = structure.surfaceIds.indexOf(surfaceId);
  const selectionSurfaceId =
    structure.surfaceIds[surfaceIndex + 1] ?? structure.surfaceIds[surfaceIndex - 1];
  const next = [...children];
  next.splice(sourceIndex, 1);
  removeVacatedBoundary(next, structure, surfaceId);
  return successMutation(next, selectionSurfaceId);
}

function moveSurface(
  surfaceId: SurfaceId,
  destination: SurfaceDestination,
  { structure, children }: CommandBuildContext,
): CandidateMutationResult {
  const sourceIndex = childIndexById(children, "surface", surfaceId);
  if (sourceIndex < 0) {
    return failureMutation("target_not_found", "The Surface does not exist.", surfaceId);
  }
  const destinationSurfaceId =
    "beforeSurfaceId" in destination ? destination.beforeSurfaceId : destination.afterSurfaceId;
  if (destinationSurfaceId === surfaceId) {
    return failureMutation(
      "invalid_destination",
      "A Surface cannot move relative to itself.",
      surfaceId,
    );
  }
  if (childIndexById(children, "surface", destinationSurfaceId) < 0) {
    return failureMutation(
      "invalid_destination",
      "The destination Surface does not exist.",
      destinationSurfaceId,
    );
  }

  const next = [...children];
  const [source] = next.splice(sourceIndex, 1);
  removeVacatedBoundary(next, structure, surfaceId);
  const destinationIndex = resolveSurfaceDestination(next, destination);
  if (destinationIndex < 0) {
    return failureMutation(
      "invalid_destination",
      "The destination Surface does not exist.",
      destinationSurfaceId,
    );
  }
  next.splice(destinationIndex, 0, source!);
  return successMutation(next);
}
