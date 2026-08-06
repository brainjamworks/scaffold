import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";

import type { CopiedBlockDefinitionLookup } from "@/document/model/identity/clone-with-new-ids";
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
  parseCourseSectionTitle,
  sameChildren,
  type CandidateMutation,
  type CommandBuildContext,
} from "./transaction-helpers";
import type {
  CourseSectionId,
  CourseStructureCommand,
  SurfaceId,
} from "./types";

interface ApplyCourseStructureCommandInput {
  readonly blockDefinitions?: CopiedBlockDefinitionLookup;
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
      readonly type: "courseSection" | "surface";
      readonly id: string;
    }
  | {
      readonly kind: "text";
      readonly type: "courseSection" | "surface";
      readonly id: string;
      readonly anchorOffset: number;
      readonly headOffset: number;
    };

export function applyCourseStructureCommandToTransaction({
  blockDefinitions,
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
  let candidate: CandidateMutation | null;
  try {
    candidate = buildCandidate(command, context, blockDefinitions);
  } catch {
    return false;
  }
  if (!candidate || sameChildren(children, candidate.children)) return false;

  try {
    applyLocalChange({
      tr,
      command,
      beforeChildren: children,
      candidate,
    });
  } catch {
    return false;
  }

  restoreLogicalSelection(
    tr,
    candidate.selectionSurfaceId
      ? { kind: "surface", id: candidate.selectionSurfaceId }
      : logicalSelection,
  );
  return true;
}

function buildCandidate(
  command: CourseStructureCommand,
  context: CommandBuildContext,
  blockDefinitions: CopiedBlockDefinitionLookup | undefined,
): CandidateMutation | null {
  if (command.type === "course-section.duplicate") {
    if (!blockDefinitions) {
      throw new Error("Course Section duplication requires the editor's Block registry.");
    }
    return buildCourseSectionDuplicateCandidate(command, context, blockDefinitions);
  }
  if (command.type === "surface.duplicate") {
    if (!blockDefinitions) {
      throw new Error("Surface duplication requires the editor's Block registry.");
    }
    return buildSurfaceDuplicateCandidate(command, context, blockDefinitions);
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
    case "course-section.start":
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
    case "course-section.remove":
      removeCourseSection(tr, command.courseSectionId);
      return;
    case "course-section.move":
      moveCourseSection(tr, command.courseSectionId, command.beforeCourseSectionId);
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

function removeCourseSection(
  tr: Transaction,
  courseSectionId: CourseSectionId,
) {
  const source = requireDirectChildRef(tr.doc.firstChild, "courseSection", courseSectionId);
  const sectionRefs = directChildRefs(tr.doc.firstChild).filter(
    (ref) => ref.node.type.name === "courseSection",
  );
  const sectionIndex = sectionRefs.findIndex((ref) => ref.node.attrs["id"] === courseSectionId);
  if (sectionRefs.length === 1 || sectionIndex > 0) {
    tr.delete(source.pos, source.end);
    return;
  }
  const following = directChildRefs(tr.doc.firstChild).find(
    (ref) => ref.index > source.index && ref.node.type.name === "courseSection",
  );
  if (!following) throw new Error("The following Course Section boundary is missing.");
  tr.replaceWith(source.pos, source.end, following.node);
  tr.delete(following.pos, following.end);
}

function moveCourseSection(
  tr: Transaction,
  courseSectionId: CourseSectionId,
  beforeCourseSectionId: CourseSectionId | null,
) {
  const refs = directChildRefs(tr.doc.firstChild);
  const source = requireRef(refs, "courseSection", courseSectionId);
  const following = refs.find(
    (ref) => ref.index > source.index && ref.node.type.name === "courseSection",
  );
  const sourceEnd = following?.pos ?? requireCourseDocument(tr).nodeSize - 1;
  const destination =
    beforeCourseSectionId === null
      ? requireCourseDocument(tr).nodeSize - 1
      : requireRef(refs, "courseSection", beforeCourseSectionId).pos;
  const moved = tr.doc.slice(source.pos, sourceEnd).content;
  const mappingStart = tr.mapping.maps.length;
  tr.delete(source.pos, sourceEnd);
  tr.insert(tr.mapping.slice(mappingStart).map(destination), moved);
}

function deleteSurface(tr: Transaction, surfaceId: SurfaceId) {
  const refs = directChildRefs(tr.doc.firstChild);
  const source = requireRef(refs, "surface", surfaceId);
  const boundary = loneSurfaceBoundary(refs, source);
  tr.delete(boundary?.pos ?? source.pos, source.end);
}

function moveSurface(
  tr: Transaction,
  surfaceId: SurfaceId,
  destination: Extract<CourseStructureCommand, { type: "surface.move" }>["destination"],
) {
  const refs = directChildRefs(tr.doc.firstChild);
  const source = requireRef(refs, "surface", surfaceId);
  const destinationId =
    "beforeSurfaceId" in destination ? destination.beforeSurfaceId : destination.afterSurfaceId;
  const destinationRef = requireRef(refs, "surface", destinationId);
  const destinationPos = "beforeSurfaceId" in destination ? destinationRef.pos : destinationRef.end;
  const boundary = loneSurfaceBoundary(refs, source);
  const mappingStart = tr.mapping.maps.length;
  tr.delete(boundary?.pos ?? source.pos, source.end);
  tr.insert(tr.mapping.slice(mappingStart).map(destinationPos), source.node);
}

function loneSurfaceBoundary(
  refs: readonly DirectChildRef[],
  surface: DirectChildRef,
): DirectChildRef | undefined {
  const boundary = [...refs]
    .reverse()
    .find((ref) => ref.index < surface.index && ref.node.type.name === "courseSection");
  if (!boundary) return undefined;
  const nextBoundary = refs.find(
    (ref) => ref.index > boundary.index && ref.node.type.name === "courseSection",
  );
  const sectionEnd = nextBoundary?.index ?? Number.POSITIVE_INFINITY;
  const surfaces = refs.filter(
    (ref) =>
      ref.index > boundary.index &&
      ref.index < sectionEnd &&
      ref.node.type.name === "surface",
  );
  return surfaces.length === 1 ? boundary : undefined;
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
  type: "courseSection" | "surface",
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

function requireCourseDocument(tr: Transaction): ProseMirrorNode {
  const courseDocument = tr.doc.firstChild;
  if (!courseDocument) throw new Error("The Course Document is missing.");
  return courseDocument;
}

function captureLogicalSelection(state: EditorState): LogicalSelection | null {
  const refs = directChildRefs(state.doc.firstChild);
  const { selection } = state;
  if (isNodeSelection(selection)) {
    const selectedRef = refs.find((ref) => ref.pos === selection.from);
    if (
      selectedRef &&
      (selectedRef.node.type.name === "courseSection" || selectedRef.node.type.name === "surface")
    ) {
      const id = selectedRef.node.attrs["id"];
      if (typeof id === "string") {
        return { kind: "node", type: selectedRef.node.type.name, id };
      }
    }
    return null;
  }
  const anchorRef = refs.find((ref) => selection.anchor >= ref.pos && selection.anchor < ref.end);
  const headRef = refs.find((ref) => selection.head >= ref.pos && selection.head < ref.end);
  if (!anchorRef || anchorRef !== headRef) return null;
  if (anchorRef.node.type.name !== "courseSection" && anchorRef.node.type.name !== "surface") {
    return null;
  }
  const type = anchorRef.node.type.name;
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
      (item) => item.node.type.name === "surface" && item.node.attrs["id"] === selection.id,
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
