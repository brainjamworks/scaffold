import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { cloneJsonWithNewStableIds } from "@/document/model/identity/clone-with-new-ids";
import type { BlockDuplicationLookup } from "@/document/model/identity/clone-with-new-ids";
import { isUnavailableContentCompatibilityRootType } from "@/document/model/establishment/unavailable-content-compatibility-root";

import { resolveCourseSectionDeletion } from "./course-section-deletion";
import { createDefaultCourseSectionTitle } from "./course-section-title";
import {
  childIndexById,
  createCourseSectionBoundary,
  nextBoundaryIndex,
  parseCourseSectionTitle,
  type CandidateMutation,
  type CommandBuildContext,
} from "./transaction-helpers";
import type { CourseSectionId, CourseStructureCommand } from "./types";

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
    case "course-section.create":
      return createCourseSection(command, context);
    case "course-section.rename":
      return renameCourseSection(command, context.children);
    case "course-section.delete":
      return deleteCourseSection(command, context);
  }
}

export function buildCourseSectionDuplicateCandidate(
  command: Extract<CourseSectionCommand, { type: "course-section.duplicate" }>,
  context: CommandBuildContext,
  blockDuplications: BlockDuplicationLookup,
): CandidateMutation | null {
  return duplicateCourseSection(command.courseSectionId, context, blockDuplications);
}

function createCourseSection(
  command: Extract<CourseSectionCommand, { type: "course-section.create" }>,
  { children, createId, schema }: CommandBuildContext,
): CandidateMutation | null {
  if (command.placement !== "end") return null;
  const number = children.filter((node) => node.type.name === "courseSection").length + 1;
  const title = createDefaultCourseSectionTitle(number);
  return { children: [...children, createCourseSectionBoundary(schema, createId(), title)] };
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

function deleteCourseSection(
  command: Extract<CourseSectionCommand, { type: "course-section.delete" }>,
  { children }: CommandBuildContext,
): CandidateMutation | null {
  const deletion = resolveCourseSectionDeletion(children, command);
  if (deletion.isErr()) return null;
  return {
    children: [
      ...children.slice(0, deletion.value.fromChildIndex),
      ...children.slice(deletion.value.toChildIndex),
    ],
  };
}

function duplicateCourseSection(
  courseSectionId: CourseSectionId,
  { children, createId, schema }: CommandBuildContext,
  blockDuplications: BlockDuplicationLookup,
): CandidateMutation | null {
  const sourceIndex = childIndexById(children, "courseSection", courseSectionId);
  if (sourceIndex < 0) return null;
  const sourceEnd = nextBoundaryIndex(children, sourceIndex);
  if (children.slice(sourceIndex, sourceEnd).some(containsUnavailableCompatibilityRoot))
    return null;
  const sourceJson = children.slice(sourceIndex, sourceEnd).map((node) => node.toJSON());
  const cloned = cloneJsonWithNewStableIds(sourceJson, {
    blockDuplications,
    createId,
  }).map((node) => schema.nodeFromJSON(node));
  return {
    children: [...children.slice(0, sourceEnd), ...cloned, ...children.slice(sourceEnd)],
  };
}

function containsUnavailableCompatibilityRoot(node: ProseMirrorNode): boolean {
  if (isUnavailableContentCompatibilityRootType(node.type.name)) return true;
  let found = false;
  node.descendants((child) => {
    if (!isUnavailableContentCompatibilityRootType(child.type.name)) return !found;
    found = true;
    return false;
  });
  return found;
}
