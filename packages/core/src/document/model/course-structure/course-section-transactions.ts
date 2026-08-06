import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { cloneJsonWithNewStableIds } from "@/document/model/identity/clone-with-new-ids";
import type { CopiedBlockDefinitionLookup } from "@/document/model/identity/clone-with-new-ids";

import {
  childIndexById,
  createCourseSectionBoundary,
  nextBoundaryIndex,
  parseCourseSectionTitle,
  type CandidateMutation,
  type CommandBuildContext,
} from "./transaction-helpers";
import type { CourseSectionId, CourseStructureCommand, SurfaceId } from "./types";

type CourseSectionCommand = Extract<CourseStructureCommand, { type: `course-section.${string}` }>;
type NonDuplicateCourseSectionCommand = Exclude<
  CourseSectionCommand,
  { type: "course-section.duplicate" }
>;

export function buildCourseSectionCandidate(
  command: NonDuplicateCourseSectionCommand,
  context: CommandBuildContext,
): CandidateMutation | null {
  switch (command.type) {
    case "course-section.start":
      return startCourseSection(command, context);
    case "course-section.rename":
      return renameCourseSection(command, context.children);
    case "course-section.remove":
      return removeCourseSection(command.courseSectionId, context);
    case "course-section.move":
      return moveCourseSection(
        command.courseSectionId,
        command.beforeCourseSectionId,
        context.children,
      );
  }
}

export function buildCourseSectionDuplicateCandidate(
  command: Extract<CourseSectionCommand, { type: "course-section.duplicate" }>,
  context: CommandBuildContext,
  blockDefinitions: CopiedBlockDefinitionLookup,
): CandidateMutation | null {
  return duplicateCourseSection(command.courseSectionId, context, blockDefinitions);
}

function startCourseSection(
  command: Extract<CourseSectionCommand, { type: "course-section.start" }>,
  { children, createId, schema }: CommandBuildContext,
): CandidateMutation | null {
  const title = parseCourseSectionTitle(command.title);
  if (title === null) return null;
  const targetIndex = childIndexById(children, "surface", command.atSurfaceId);
  if (targetIndex < 0) return null;

  const hasSections = children.some((node) => node.type.name === "courseSection");
  if (!hasSections) {
    const firstSurfaceIndex = children.findIndex((node) => node.type.name === "surface");
    if (targetIndex === firstSurfaceIndex) {
      return { children: [createCourseSectionBoundary(schema, createId(), title), ...children] };
    }
    const leadingTitle = parseCourseSectionTitle(command.leadingTitle);
    if (leadingTitle === null) return null;
    return {
      children: [
        createCourseSectionBoundary(schema, createId(), leadingTitle),
        ...children.slice(0, targetIndex),
        createCourseSectionBoundary(schema, createId(), title),
        ...children.slice(targetIndex),
      ],
    };
  }

  if (children[targetIndex - 1]?.type.name === "courseSection") return null;
  return {
    children: [
      ...children.slice(0, targetIndex),
      createCourseSectionBoundary(schema, createId(), title),
      ...children.slice(targetIndex),
    ],
  };
}

function renameCourseSection(
  command: Extract<CourseSectionCommand, { type: "course-section.rename" }>,
  children: readonly ProseMirrorNode[],
): CandidateMutation | null {
  const title = parseCourseSectionTitle(command.title);
  if (title === null) return null;
  const index = childIndexById(children, "courseSection", command.courseSectionId);
  if (index < 0) return null;
  const source = children[index]!;
  if (source.attrs["title"] === title) return null;
  const next = [...children];
  next[index] = source.type.createChecked({ ...source.attrs, title });
  return { children: next };
}

function removeCourseSection(
  courseSectionId: CourseSectionId,
  { children }: CommandBuildContext,
): CandidateMutation | null {
  const childIndex = childIndexById(children, "courseSection", courseSectionId);
  if (childIndex < 0) return null;
  const sectionIndices = children.flatMap((node, index) =>
    node.type.name === "courseSection" ? [index] : [],
  );
  const sectionIndex = sectionIndices.indexOf(childIndex);
  if (sectionIndex < 0) return null;
  const sectionEnd = sectionIndices[sectionIndex + 1] ?? children.length;
  const firstSurface = children
    .slice(childIndex + 1, sectionEnd)
    .find((node) => node.type.name === "surface");
  const firstSurfaceId = firstSurface?.attrs["id"];

  const next = [...children];
  if (sectionIndices.length === 1 || sectionIndex > 0) {
    next.splice(childIndex, 1);
  } else {
    const followingIndex = next.findIndex(
      (node, index) => index > childIndex && node.type.name === "courseSection",
    );
    if (followingIndex < 0) return null;
    const [following] = next.splice(followingIndex, 1);
    next.splice(childIndex, 1, following!);
  }
  return {
    children: next,
    ...(typeof firstSurfaceId === "string"
      ? { selectionSurfaceId: firstSurfaceId as SurfaceId }
      : {}),
  };
}

function moveCourseSection(
  courseSectionId: CourseSectionId,
  beforeCourseSectionId: CourseSectionId | null,
  children: readonly ProseMirrorNode[],
): CandidateMutation | null {
  const sourceIndex = childIndexById(children, "courseSection", courseSectionId);
  if (sourceIndex < 0 || beforeCourseSectionId === courseSectionId) return null;

  const sourceEnd = nextBoundaryIndex(children, sourceIndex);
  const range = children.slice(sourceIndex, sourceEnd);
  const remaining = [...children.slice(0, sourceIndex), ...children.slice(sourceEnd)];
  const destinationIndex =
    beforeCourseSectionId === null
      ? remaining.length
      : childIndexById(remaining, "courseSection", beforeCourseSectionId);
  if (destinationIndex < 0) return null;
  return {
    children: [
      ...remaining.slice(0, destinationIndex),
      ...range,
      ...remaining.slice(destinationIndex),
    ],
  };
}

function duplicateCourseSection(
  courseSectionId: CourseSectionId,
  { children, createId, schema }: CommandBuildContext,
  blockDefinitions: CopiedBlockDefinitionLookup,
): CandidateMutation | null {
  const sourceIndex = childIndexById(children, "courseSection", courseSectionId);
  if (sourceIndex < 0) return null;
  const sourceEnd = nextBoundaryIndex(children, sourceIndex);
  const sourceJson = children.slice(sourceIndex, sourceEnd).map((node) => node.toJSON());
  const cloned = cloneJsonWithNewStableIds(sourceJson, {
    blockDefinitions,
    createId,
  }).map((node) => schema.nodeFromJSON(node));
  return {
    children: [...children.slice(0, sourceEnd), ...cloned, ...children.slice(sourceEnd)],
  };
}
