import {
  EmbeddedNodeIdSchema,
  LearnerInteractionConfigurationV1Schema,
  PresentationConfigurationV1Schema,
  type SurfaceLearnerInteractionRulesV1,
  type SurfacePresentationTimelineV1,
} from "@scaffold/contracts";
import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";

import type { BlockDuplicationLookup } from "@/document/model/identity/clone-with-new-ids";
import { isNodeSelection } from "@/editor/selection/selection-facts";
import {
  setNodeSelectionInTransaction,
  setTextSelectionInTransaction,
  setTextSelectionNearInTransaction,
} from "@/editor/selection/selection-transactions";

import {
  buildCourseSectionCandidate,
  buildCourseSectionDuplicateCandidate,
} from "./course-section-transactions";
import { buildSurfaceCandidate, buildSurfaceDuplicateCandidate } from "./surface-transactions";
import {
  directChildren,
  isCourseSurfaceRoot,
  isCourseSurfaceRootType,
  parseCourseSectionTitle,
  sameChildren,
  type CandidateMutation,
  type CommandBuildContext,
} from "./transaction-helpers";
import type { CourseSectionId, CourseStructureCommand, SurfaceId } from "./types";

interface ApplyCourseStructureCommandInput {
  readonly blockDuplications?: BlockDuplicationLookup;
  readonly state: EditorState;
  readonly tr: Transaction;
  readonly command: CourseStructureCommand;
  readonly createId: () => string;
}

interface DirectChildRef {
  readonly node: ProseMirrorNode;
  readonly index: number;
  readonly pos: number;
  readonly end: number;
}

type LogicalSelection =
  | {
      readonly kind: "node";
      readonly type: "courseSection" | "surface" | "unavailable_surface";
      readonly id: string;
    }
  | {
      readonly kind: "text";
      readonly type: "courseSection" | "surface" | "unavailable_surface";
      readonly id: string;
      readonly anchorOffset: number;
      readonly headOffset: number;
    };

export function applyCourseStructureCommandToTransaction({
  blockDuplications,
  state,
  tr,
  command,
  createId,
}: ApplyCourseStructureCommandInput): boolean {
  const courseDocument = state.doc.firstChild;
  const mode = courseDocument?.attrs["mode"];
  if (mode !== "slideshow" || !courseDocument) return false;

  const children = directChildren(courseDocument);
  const context: CommandBuildContext = {
    children,
    createId,
    schema: state.schema,
  };
  const logicalSelection = captureLogicalSelection(state);
  const candidate = buildCandidate(command, context, blockDuplications);
  if (!candidate || sameChildren(children, candidate.children)) return false;

  applyLocalChange({
    tr,
    command,
    beforeChildren: children,
    candidate,
  });
  reconcilePresentationSurfaceTimelines(tr);
  reconcileLearnerInteractionSurfaceGroups(tr);

  restoreLogicalSelection(
    tr,
    candidate.selectionSurfaceId
      ? { kind: "surface", id: candidate.selectionSurfaceId }
      : logicalSelection,
  );
  return true;
}

function reconcileLearnerInteractionSurfaceGroups(tr: Transaction): void {
  const courseDocument = tr.doc.firstChild;
  if (!courseDocument || courseDocument.type.name !== "courseDocument") {
    throw new Error("The Course Document is missing after a Course Structure mutation.");
  }
  const value = courseDocument.attrs["learnerInteractions"];
  if (value === null || value === undefined) return;

  const configuration = LearnerInteractionConfigurationV1Schema.parse(value);
  const groupBySurfaceId = new Map(
    configuration.surfaces.map((group) => [group.surfaceId, group]),
  );
  const surfaces: SurfaceLearnerInteractionRulesV1[] = [];
  for (let index = 0; index < courseDocument.childCount; index += 1) {
    const child = courseDocument.child(index);
    if (!isCourseSurfaceRoot(child)) continue;
    const surfaceId = EmbeddedNodeIdSchema.parse(child.attrs["id"]);
    const group = groupBySurfaceId.get(surfaceId);
    if (group) surfaces.push(group);
  }
  if (
    configuration.surfaces.length === surfaces.length &&
    configuration.surfaces.every(({ surfaceId }, index) => surfaceId === surfaces[index]?.surfaceId)
  ) {
    return;
  }

  const learnerInteractions =
    surfaces.length === 0
      ? null
      : LearnerInteractionConfigurationV1Schema.parse({ ...configuration, surfaces });
  tr.setNodeMarkup(0, undefined, { ...courseDocument.attrs, learnerInteractions });
  tr.doc.check();
}

function reconcilePresentationSurfaceTimelines(tr: Transaction): void {
  const courseDocument = tr.doc.firstChild;
  if (!courseDocument || courseDocument.type.name !== "courseDocument") {
    throw new Error("The Course Document is missing after a Course Structure mutation.");
  }
  const value = courseDocument.attrs["presentation"];
  if (value === null || value === undefined) return;

  const courseDocumentId = EmbeddedNodeIdSchema.parse(courseDocument.attrs["id"]);
  const configuration = PresentationConfigurationV1Schema.parse(value);
  const timelineBySurfaceId = new Map(
    configuration.surfaces.map((timeline) => [timeline.surfaceId, timeline]),
  );
  const seenIds = new Set([courseDocumentId]);
  const surfaces: SurfacePresentationTimelineV1[] = [];
  for (let index = 0; index < courseDocument.childCount; index += 1) {
    const child = courseDocument.child(index);
    if (!isCourseSurfaceRoot(child)) continue;
    const surfaceId = EmbeddedNodeIdSchema.parse(child.attrs["id"]);
    if (seenIds.has(surfaceId)) {
      throw new Error(`Course Structure identity "${surfaceId}" is duplicated.`);
    }
    seenIds.add(surfaceId);
    surfaces.push(
      timelineBySurfaceId.get(surfaceId) ?? {
        surfaceId,
        durationMs: 0,
        actions: [],
      },
    );
  }
  if (
    configuration.surfaces.length === surfaces.length &&
    configuration.surfaces.every(({ surfaceId }, index) => surfaceId === surfaces[index]?.surfaceId)
  ) {
    return;
  }

  const presentation = PresentationConfigurationV1Schema.parse({ ...configuration, surfaces });
  tr.setNodeMarkup(0, undefined, { ...courseDocument.attrs, presentation });
  tr.doc.check();
}

function buildCandidate(
  command: CourseStructureCommand,
  context: CommandBuildContext,
  blockDuplications: BlockDuplicationLookup | undefined,
): CandidateMutation | null {
  if (command.type === "course-section.duplicate") {
    if (!blockDuplications) {
      throw new Error("Course Section duplication requires the mounted Block duplication lookup.");
    }
    return buildCourseSectionDuplicateCandidate(command, context, blockDuplications);
  }
  if (command.type === "surface.duplicate") {
    if (!blockDuplications) {
      throw new Error("Surface duplication requires the mounted Block duplication lookup.");
    }
    return buildSurfaceDuplicateCandidate(command, context, blockDuplications);
  }
  return command.type.startsWith("course-section.")
    ? buildCourseSectionCandidate(
        command as Exclude<
          Extract<CourseStructureCommand, { type: `course-section.${string}` }>,
          { type: "course-section.duplicate" }
        >,
        context,
      )
    : buildSurfaceCandidate(
        command as Exclude<
          Extract<CourseStructureCommand, { type: `surface.${string}` }>,
          { type: "surface.duplicate" }
        >,
        context,
      );
}

function applyLocalChange({
  tr,
  command,
  beforeChildren,
  candidate,
}: {
  readonly tr: Transaction;
  readonly command: CourseStructureCommand;
  readonly beforeChildren: readonly ProseMirrorNode[];
  readonly candidate: CandidateMutation;
}) {
  switch (command.type) {
    case "course-section.create":
    case "course-section.duplicate":
    case "surface.insert":
    case "surface.duplicate":
      insertNewRuns(tr, beforeChildren, candidate.children);
      return;
    case "course-section.rename": {
      const source = requireDirectChildRef(
        tr.doc.firstChild,
        "courseSection",
        command.courseSectionId,
      );
      tr.setNodeAttribute(source.pos, "title", parseCourseSectionTitle(command.title));
      return;
    }
    case "course-section.delete":
      deleteCourseSection(tr, command.courseSectionId);
      return;
    case "surface.delete":
      deleteSurface(tr, command.surfaceId);
      return;
    case "surface.move":
      moveSurface(tr, command.surfaceId, command.destination);
      return;
  }
}

function insertNewRuns(
  tr: Transaction,
  beforeChildren: readonly ProseMirrorNode[],
  afterChildren: readonly ProseMirrorNode[],
) {
  const existing = new Set(beforeChildren);
  const refs = directChildRefs(tr.doc.firstChild);
  const refByNode = new Map(refs.map((ref) => [ref.node, ref]));
  const courseDocumentEnd = tr.doc.firstChild?.nodeSize;
  if (courseDocumentEnd === undefined) throw new Error("The Course Document is missing.");
  const insertions: Array<{ readonly pos: number; readonly nodes: readonly ProseMirrorNode[] }> =
    [];

  for (let index = 0; index < afterChildren.length; ) {
    if (existing.has(afterChildren[index]!)) {
      index += 1;
      continue;
    }
    const start = index;
    while (index < afterChildren.length && !existing.has(afterChildren[index]!)) index += 1;
    const nextExisting = afterChildren.slice(index).find((node) => existing.has(node));
    const pos = nextExisting ? refByNode.get(nextExisting)?.pos : courseDocumentEnd - 1;
    if (pos === undefined) throw new Error("A Course Structure insertion anchor is missing.");
    insertions.push({ pos, nodes: afterChildren.slice(start, index) });
  }

  const mappingStart = tr.mapping.maps.length;
  for (const insertion of insertions.sort((left, right) => left.pos - right.pos)) {
    tr.insert(
      tr.mapping.slice(mappingStart).map(insertion.pos),
      Fragment.fromArray([...insertion.nodes]),
    );
  }
}

function deleteCourseSection(tr: Transaction, courseSectionId: CourseSectionId) {
  const refs = directChildRefs(tr.doc.firstChild);
  const source = requireRef(refs, "courseSection", courseSectionId);
  const nextBoundary = refs.find(
    (ref) => ref.index > source.index && ref.node.type.name === "courseSection",
  );
  const end = nextBoundary?.pos ?? refs.at(-1)?.end ?? source.end;
  tr.delete(source.pos, end);
}

function deleteSurface(tr: Transaction, surfaceId: SurfaceId) {
  const refs = directChildRefs(tr.doc.firstChild);
  const source = requireCourseSurfaceRef(refs, surfaceId);
  tr.delete(source.pos, source.end);
}

function moveSurface(
  tr: Transaction,
  surfaceId: SurfaceId,
  destination: Extract<CourseStructureCommand, { type: "surface.move" }>["destination"],
) {
  const refs = directChildRefs(tr.doc.firstChild);
  const source = requireCourseSurfaceRef(refs, surfaceId);
  const destinationPos = resolveTransactionDestination(refs, destination);
  const mappingStart = tr.mapping.maps.length;
  tr.delete(source.pos, source.end);
  tr.insert(tr.mapping.slice(mappingStart).map(destinationPos), source.node);
}

function resolveTransactionDestination(
  refs: readonly DirectChildRef[],
  destination: Extract<CourseStructureCommand, { type: "surface.move" }>["destination"],
): number {
  if ("beforeSurfaceId" in destination)
    return requireCourseSurfaceRef(refs, destination.beforeSurfaceId).pos;
  if ("afterSurfaceId" in destination)
    return requireCourseSurfaceRef(refs, destination.afterSurfaceId).end;
  const boundary = requireRef(refs, "courseSection", destination.intoCourseSectionId);
  if (destination.edge === "start") return boundary.end;
  const nextBoundary = refs.find(
    (ref) => ref.index > boundary.index && ref.node.type.name === "courseSection",
  );
  return nextBoundary?.pos ?? refs.at(-1)?.end ?? boundary.end;
}

function directChildRefs(courseDocument: ProseMirrorNode | null): DirectChildRef[] {
  if (!courseDocument) return [];
  const refs: DirectChildRef[] = [];
  let pos = 1;
  for (let index = 0; index < courseDocument.childCount; index += 1) {
    const node = courseDocument.child(index);
    refs.push({ node, index, pos, end: pos + node.nodeSize });
    pos += node.nodeSize;
  }
  return refs;
}

function requireDirectChildRef(
  courseDocument: ProseMirrorNode | null,
  type: "courseSection",
  id: string,
): DirectChildRef {
  return requireRef(directChildRefs(courseDocument), type, id);
}

function requireRef(
  refs: readonly DirectChildRef[],
  type: "courseSection" | "surface",
  id: string,
): DirectChildRef {
  const ref = refs.find((item) => item.node.type.name === type && item.node.attrs["id"] === id);
  if (!ref) throw new Error(`The ${type} "${id}" is missing from the current document.`);
  return ref;
}

function requireCourseSurfaceRef(refs: readonly DirectChildRef[], id: string): DirectChildRef {
  const ref = refs.find((item) => isCourseSurfaceRoot(item.node) && item.node.attrs["id"] === id);
  if (!ref) throw new Error(`The Course Surface "${id}" is missing from the current document.`);
  return ref;
}

function captureLogicalSelection(state: EditorState): LogicalSelection | null {
  const refs = directChildRefs(state.doc.firstChild);
  const { selection } = state;
  if (isNodeSelection(selection)) {
    const selectedRef = refs.find((ref) => ref.pos === selection.from);
    const selectedType = selectedRef?.node.type.name;
    if (
      selectedRef &&
      selectedType &&
      (selectedType === "courseSection" || isCourseSurfaceRootType(selectedType))
    ) {
      const id = selectedRef.node.attrs["id"];
      if (typeof id === "string") {
        return { kind: "node", type: selectedType, id };
      }
    }
    return null;
  }
  const anchorRef = refs.find((ref) => selection.anchor >= ref.pos && selection.anchor < ref.end);
  const headRef = refs.find((ref) => selection.head >= ref.pos && selection.head < ref.end);
  if (!anchorRef || anchorRef !== headRef) return null;
  const type = anchorRef.node.type.name;
  if (type !== "courseSection" && !isCourseSurfaceRootType(type)) {
    return null;
  }
  const id = anchorRef.node.attrs["id"];
  if (typeof id !== "string") return null;
  return {
    kind: "text",
    type,
    id,
    anchorOffset: selection.anchor - anchorRef.pos,
    headOffset: selection.head - anchorRef.pos,
  };
}

function restoreLogicalSelection(
  tr: Transaction,
  selection: LogicalSelection | { readonly kind: "surface"; readonly id: SurfaceId } | null,
) {
  if (!selection) return;
  if (selection.kind === "surface") {
    const ref = directChildRefs(tr.doc.firstChild).find(
      (item) => isCourseSurfaceRoot(item.node) && item.node.attrs["id"] === selection.id,
    );
    if (ref) setTextSelectionNearInTransaction(tr, ref.pos + 1);
    return;
  }
  const ref = directChildRefs(tr.doc.firstChild).find(
    (item) => item.node.type.name === selection.type && item.node.attrs["id"] === selection.id,
  );
  if (!ref) return;
  if (selection.kind === "node") {
    setNodeSelectionInTransaction(tr, ref.pos);
    return;
  }
  setTextSelectionInTransaction(
    tr,
    ref.pos + selection.anchorOffset,
    ref.pos + selection.headOffset,
  );
}
