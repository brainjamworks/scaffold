import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { cloneJsonWithNewStableIds } from "@/document/model/identity/clone-with-new-ids";
import type { CopiedBlockDefinitionLookup } from "@/document/model/identity/clone-with-new-ids";

import {
  childIndexById,
  removeVacatedBoundary,
  resolveSurfaceDestination,
  type CandidateMutation,
  type CommandBuildContext,
} from "./transaction-helpers";
import type { CourseStructureCommand, SurfaceDestination, SurfaceId } from "./types";

type SurfaceCommand = Extract<CourseStructureCommand, { type: `surface.${string}` }>;
type NonDuplicateSurfaceCommand = Exclude<SurfaceCommand, { type: "surface.duplicate" }>;

export function buildSurfaceCandidate(
  command: NonDuplicateSurfaceCommand,
  context: CommandBuildContext,
): CandidateMutation | null {
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
): CandidateMutation | null {
  return duplicateSurface(command.surfaceId, context, blockDefinitions);
}

function insertSurface(
  surface: ProseMirrorNode,
  destination: SurfaceDestination,
  children: readonly ProseMirrorNode[],
): CandidateMutation | null {
  if (surface.type.name !== "surface") return null;
  const destinationIndex = resolveSurfaceDestination(children, destination);
  if (destinationIndex < 0) return null;
  return {
    children: [
      ...children.slice(0, destinationIndex),
      surface,
      ...children.slice(destinationIndex),
    ],
  };
}

function duplicateSurface(
  surfaceId: SurfaceId,
  { children, createId, schema }: CommandBuildContext,
  blockDefinitions: CopiedBlockDefinitionLookup,
): CandidateMutation | null {
  const sourceIndex = childIndexById(children, "surface", surfaceId);
  if (sourceIndex < 0) return null;
  const json = cloneJsonWithNewStableIds(children[sourceIndex]!.toJSON(), {
    blockDefinitions,
    createId,
  });
  const clone = schema.nodeFromJSON(json);
  return {
    children: [
      ...children.slice(0, sourceIndex + 1),
      clone,
      ...children.slice(sourceIndex + 1),
    ],
  };
}

function deleteSurface(
  surfaceId: SurfaceId,
  { children }: CommandBuildContext,
): CandidateMutation | null {
  const sourceIndex = childIndexById(children, "surface", surfaceId);
  if (sourceIndex < 0) return null;
  const surfaceIds = children.flatMap((node) =>
    node.type.name === "surface" && typeof node.attrs["id"] === "string"
      ? [node.attrs["id"] as SurfaceId]
      : [],
  );
  if (surfaceIds.length === 1) return null;

  const surfaceIndex = surfaceIds.indexOf(surfaceId);
  const selectionSurfaceId = surfaceIds[surfaceIndex + 1] ?? surfaceIds[surfaceIndex - 1];
  const next = [...children];
  removeVacatedBoundary(next, sourceIndex);
  const adjustedSourceIndex = childIndexById(next, "surface", surfaceId);
  if (adjustedSourceIndex < 0) return null;
  next.splice(adjustedSourceIndex, 1);
  return { children: next, ...(selectionSurfaceId ? { selectionSurfaceId } : {}) };
}

function moveSurface(
  surfaceId: SurfaceId,
  destination: SurfaceDestination,
  { children }: CommandBuildContext,
): CandidateMutation | null {
  const sourceIndex = childIndexById(children, "surface", surfaceId);
  if (sourceIndex < 0) return null;
  const destinationSurfaceId =
    "beforeSurfaceId" in destination ? destination.beforeSurfaceId : destination.afterSurfaceId;
  if (destinationSurfaceId === surfaceId) return null;
  if (childIndexById(children, "surface", destinationSurfaceId) < 0) return null;

  const next = [...children];
  const source = next[sourceIndex];
  removeVacatedBoundary(next, sourceIndex);
  const adjustedSourceIndex = childIndexById(next, "surface", surfaceId);
  if (!source || adjustedSourceIndex < 0) return null;
  next.splice(adjustedSourceIndex, 1);
  const destinationIndex = resolveSurfaceDestination(next, destination);
  if (destinationIndex < 0) return null;
  next.splice(destinationIndex, 0, source!);
  return { children: next };
}
