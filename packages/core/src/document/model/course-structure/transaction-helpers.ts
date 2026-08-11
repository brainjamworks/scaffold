import { CourseSectionTitleSchema } from "@scaffold/contracts";
import type { Node as ProseMirrorNode, Schema } from "@tiptap/pm/model";

import type { SurfaceDestination, SurfaceId } from "./types";

export interface CommandBuildContext {
  readonly children: readonly ProseMirrorNode[];
  readonly createId: () => string;
  readonly schema: Schema;
}

export interface CandidateMutation {
  readonly children: readonly ProseMirrorNode[];
  readonly selectionSurfaceId?: SurfaceId;
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
  if ("intoCourseSectionId" in destination) {
    const boundaryIndex = childIndexById(
      children,
      "courseSection",
      destination.intoCourseSectionId,
    );
    if (boundaryIndex < 0) return -1;
    return destination.edge === "start"
      ? boundaryIndex + 1
      : nextBoundaryIndex(children, boundaryIndex);
  }
  const index = childIndexById(children, "surface", destination.afterSurfaceId);
  return index < 0 ? -1 : index + 1;
}

export function sameChildren(
  before: readonly ProseMirrorNode[],
  after: readonly ProseMirrorNode[],
): boolean {
  return before.length === after.length && before.every((node, index) => node.eq(after[index]!));
}
