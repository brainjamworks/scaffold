import { CourseSectionTitleSchema } from "@scaffold/contracts";
import type { Node as ProseMirrorNode, Schema } from "@tiptap/pm/model";

import type { CopiedBlockDefinitionLookup } from "@/document/model/identity/clone-with-new-ids";

import type {
  CourseSectionId,
  CourseStructure,
  CourseStructureTransactionIssue,
  CourseStructureTransactionIssueCode,
  SurfaceDestination,
  SurfaceId,
} from "./types";

export interface CommandBuildContext {
  readonly blockDefinitions: CopiedBlockDefinitionLookup;
  readonly structure: CourseStructure;
  readonly children: readonly ProseMirrorNode[];
  readonly createId: () => string;
  readonly schema: Schema;
}

export interface CandidateMutation {
  readonly children: readonly ProseMirrorNode[];
  readonly selectionSurfaceId?: SurfaceId;
}

export type CandidateMutationResult =
  | { readonly ok: true; readonly value: CandidateMutation }
  | { readonly ok: false; readonly issue: CourseStructureTransactionIssue };

export function successMutation(
  children: readonly ProseMirrorNode[],
  selectionSurfaceId?: SurfaceId,
): CandidateMutationResult {
  return {
    ok: true,
    value: { children, ...(selectionSurfaceId ? { selectionSurfaceId } : {}) },
  };
}

export function failureMutation(
  code: CourseStructureTransactionIssueCode,
  message: string,
  targetId?: CourseSectionId,
): CandidateMutationResult {
  return { ok: false, issue: transactionIssue(code, message, targetId) };
}

export function transactionIssue(
  code: CourseStructureTransactionIssueCode,
  message: string,
  targetId?: CourseSectionId,
): CourseStructureTransactionIssue {
  return Object.freeze({ code, message, ...(targetId ? { targetId } : {}) });
}

export function parseCourseSectionTitle(value: unknown): string | null {
  const parsed = CourseSectionTitleSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function createCourseSectionBoundary(
  schema: Schema,
  id: string,
  title: string,
): ProseMirrorNode {
  const type = schema.nodes["courseSection"];
  if (!type) throw new Error("The editor schema has no courseSection node.");
  return type.createChecked({ id, title });
}

export function directChildren(courseDocument: ProseMirrorNode): ProseMirrorNode[] {
  const children: ProseMirrorNode[] = [];
  courseDocument.forEach((child) => children.push(child));
  return children;
}

export function childIndexById(
  children: readonly ProseMirrorNode[],
  type: "courseSection" | "surface",
  id: string,
): number {
  return children.findIndex((node) => node.type.name === type && node.attrs["id"] === id);
}

export function nextBoundaryIndex(
  children: readonly ProseMirrorNode[],
  sourceIndex: number,
): number {
  const next = children.findIndex(
    (node, index) => index > sourceIndex && node.type.name === "courseSection",
  );
  return next < 0 ? children.length : next;
}

export function resolveSurfaceDestination(
  children: readonly ProseMirrorNode[],
  destination: SurfaceDestination,
): number {
  if ("beforeSurfaceId" in destination) {
    return childIndexById(children, "surface", destination.beforeSurfaceId);
  }
  const index = childIndexById(children, "surface", destination.afterSurfaceId);
  return index < 0 ? -1 : index + 1;
}

export function removeVacatedBoundary(
  children: ProseMirrorNode[],
  structure: CourseStructure,
  removedSurfaceId: SurfaceId,
) {
  const surface = structure.surfaceById.get(removedSurfaceId);
  if (!surface?.courseSectionId || structure.sectioning !== "course-sections") return;
  const section = structure.courseSectionById.get(surface.courseSectionId);
  if (section?.surfaceIds.length !== 1) return;
  const boundaryIndex = childIndexById(children, "courseSection", surface.courseSectionId);
  if (boundaryIndex >= 0) children.splice(boundaryIndex, 1);
}

export function sameChildren(
  before: readonly ProseMirrorNode[],
  after: readonly ProseMirrorNode[],
): boolean {
  return before.length === after.length && before.every((node, index) => node.eq(after[index]!));
}

export function directChildPositionById(
  courseDocument: ProseMirrorNode | null,
  id: SurfaceId,
): number | null {
  if (!courseDocument) return null;
  let position = 1;
  for (let index = 0; index < courseDocument.childCount; index += 1) {
    const child = courseDocument.child(index);
    if (child.type.name === "surface" && child.attrs["id"] === id) return position;
    position += child.nodeSize;
  }
  return null;
}
