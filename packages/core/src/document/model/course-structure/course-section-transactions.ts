import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { cloneJsonWithNewStableIds } from "@/document/model/identity/clone-with-new-ids";

import {
  childIndexById,
  createCourseSectionBoundary,
  failureMutation,
  nextBoundaryIndex,
  parseCourseSectionTitle,
  successMutation,
  type CandidateMutationResult,
  type CommandBuildContext,
} from "./transaction-helpers";
import type { CourseSectionId, CourseStructureCommand } from "./types";

type CourseSectionCommand = Extract<CourseStructureCommand, { type: `course-section.${string}` }>;

export function buildCourseSectionCandidate(
  command: CourseSectionCommand,
  context: CommandBuildContext,
): CandidateMutationResult {
  switch (command.type) {
    case "course-section.start":
      return startCourseSection(command, context);
    case "course-section.rename":
      return renameCourseSection(command, context.children);
    case "course-section.remove":
      return removeCourseSection(command.courseSectionId, context);
    case "course-section.move":
      return moveCourseSection(command.courseSectionId, command.beforeCourseSectionId, context.children);
    case "course-section.duplicate":
      return duplicateCourseSection(command.courseSectionId, context);
  }
}

function startCourseSection(
  command: Extract<CourseSectionCommand, { type: "course-section.start" }>,
  { structure, children, createId, schema }: CommandBuildContext,
): CandidateMutationResult {
  const title = parseCourseSectionTitle(command.title);
  if (title === null) return failureMutation("invalid_title", "Course Section title is invalid.");
  const targetIndex = childIndexById(children, "surface", command.atSurfaceId);
  if (targetIndex < 0) {
    return failureMutation("target_not_found", "The target Surface does not exist.", command.atSurfaceId);
  }

  if (structure.sectioning === "none") {
    if (command.atSurfaceId === structure.surfaceIds[0]) {
      return successMutation([
        createCourseSectionBoundary(schema, createId(), title),
        ...children,
      ]);
    }
    const leadingTitle = parseCourseSectionTitle(command.leadingTitle);
    if (leadingTitle === null) {
      return failureMutation(
        "leading_section_title_required",
        "A leading Course Section title is required when starting after the first Surface.",
        command.atSurfaceId,
      );
    }
    return successMutation([
      createCourseSectionBoundary(schema, createId(), leadingTitle),
      ...children.slice(0, targetIndex),
      createCourseSectionBoundary(schema, createId(), title),
      ...children.slice(targetIndex),
    ]);
  }

  const membership = structure.surfaceById.get(command.atSurfaceId)?.courseSectionId;
  const owningSection = membership ? structure.courseSectionById.get(membership) : undefined;
  if (owningSection?.firstSurfaceId === command.atSurfaceId) {
    return failureMutation(
      "section_already_starts_at_surface",
      "A Course Section already starts at the target Surface.",
      command.atSurfaceId,
    );
  }
  return successMutation([
    ...children.slice(0, targetIndex),
    createCourseSectionBoundary(schema, createId(), title),
    ...children.slice(targetIndex),
  ]);
}

function renameCourseSection(
  command: Extract<CourseSectionCommand, { type: "course-section.rename" }>,
  children: readonly ProseMirrorNode[],
): CandidateMutationResult {
  const title = parseCourseSectionTitle(command.title);
  if (title === null) return failureMutation("invalid_title", "Course Section title is invalid.");
  const index = childIndexById(children, "courseSection", command.courseSectionId);
  if (index < 0) {
    return failureMutation("target_not_found", "The Course Section does not exist.", command.courseSectionId);
  }
  const source = children[index]!;
  if (source.attrs["title"] === title) {
    return failureMutation("no_change", "The Course Section already has that title.", command.courseSectionId);
  }
  const next = [...children];
  next[index] = source.type.createChecked({ ...source.attrs, title });
  return successMutation(next);
}

function removeCourseSection(
  courseSectionId: CourseSectionId,
  { structure, children }: CommandBuildContext,
): CandidateMutationResult {
  const childIndex = childIndexById(children, "courseSection", courseSectionId);
  const sectionIndex = structure.courseSections.findIndex((section) => section.id === courseSectionId);
  const removed = structure.courseSections[sectionIndex];
  if (childIndex < 0 || !removed) {
    return failureMutation("target_not_found", "The Course Section does not exist.", courseSectionId);
  }

  const next = [...children];
  if (structure.courseSections.length === 1 || sectionIndex > 0) {
    next.splice(childIndex, 1);
  } else {
    const followingIndex = next.findIndex(
      (node, index) => index > childIndex && node.type.name === "courseSection",
    );
    if (followingIndex < 0) {
      return failureMutation("invalid_result", "The following Course Section boundary is missing.");
    }
    const [following] = next.splice(followingIndex, 1);
    next.splice(childIndex, 1, following!);
  }
  return successMutation(next, removed.firstSurfaceId);
}

function moveCourseSection(
  courseSectionId: CourseSectionId,
  beforeCourseSectionId: CourseSectionId | null,
  children: readonly ProseMirrorNode[],
): CandidateMutationResult {
  const sourceIndex = childIndexById(children, "courseSection", courseSectionId);
  if (sourceIndex < 0) {
    return failureMutation("target_not_found", "The Course Section does not exist.", courseSectionId);
  }
  if (beforeCourseSectionId === courseSectionId) {
    return failureMutation("invalid_destination", "A Course Section cannot move before itself.", courseSectionId);
  }

  const sourceEnd = nextBoundaryIndex(children, sourceIndex);
  const range = children.slice(sourceIndex, sourceEnd);
  const remaining = [...children.slice(0, sourceIndex), ...children.slice(sourceEnd)];
  const destinationIndex =
    beforeCourseSectionId === null
      ? remaining.length
      : childIndexById(remaining, "courseSection", beforeCourseSectionId);
  if (destinationIndex < 0) {
    return failureMutation(
      "invalid_destination",
      "The destination Course Section does not exist.",
      beforeCourseSectionId ?? undefined,
    );
  }
  return successMutation([
    ...remaining.slice(0, destinationIndex),
    ...range,
    ...remaining.slice(destinationIndex),
  ]);
}

function duplicateCourseSection(
  courseSectionId: CourseSectionId,
  { blockDefinitions, children, createId, schema }: CommandBuildContext,
): CandidateMutationResult {
  const sourceIndex = childIndexById(children, "courseSection", courseSectionId);
  if (sourceIndex < 0) {
    return failureMutation("target_not_found", "The Course Section does not exist.", courseSectionId);
  }
  const sourceEnd = nextBoundaryIndex(children, sourceIndex);
  const sourceJson = children.slice(sourceIndex, sourceEnd).map((node) => node.toJSON());
  const cloned = cloneJsonWithNewStableIds(sourceJson, {
    blockDefinitions,
    createId,
  }).map((node) => schema.nodeFromJSON(node));
  return successMutation([
    ...children.slice(0, sourceEnd),
    ...cloned,
    ...children.slice(sourceEnd),
  ]);
}
