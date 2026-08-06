import type { EditorState } from "@tiptap/pm/state";

import { replaceNodeContentChecked } from "@/document/model/commands/checked-transactions";
import type { CopiedBlockDefinitionLookup } from "@/document/model/identity/clone-with-new-ids";
import { setTextSelectionNearInTransaction } from "@/editor/selection/selection-transactions";

import { buildCourseSectionCandidate } from "./course-section-transactions";
import { buildSurfaceCandidate } from "./surface-transactions";
import {
  directChildPositionById,
  directChildren,
  parseCourseSectionTitle,
  sameChildren,
  transactionIssue,
  type CandidateMutationResult,
  type CommandBuildContext,
} from "./transaction-helpers";
import type {
  CourseStructure,
  CourseStructureCommand,
  CourseStructureModule,
  CourseStructureTransactionIssueCode,
  CourseStructureTransactionResult,
} from "./types";

interface BuildCourseStructureTransactionInput {
  readonly blockDefinitions: CopiedBlockDefinitionLookup;
  readonly state: EditorState;
  readonly command: CourseStructureCommand;
  readonly validate: CourseStructureModule["validate"];
  readonly createId: () => string;
}

export function buildCourseStructureTransaction({
  blockDefinitions,
  state,
  command,
  validate,
  createId,
}: BuildCourseStructureTransactionInput): CourseStructureTransactionResult {
  const courseDocument = state.doc.firstChild;
  const mode = courseDocument?.attrs["mode"];
  if (mode === "page" || mode === "branching") {
    return failure("unsupported_mode", `Course Structure commands are not supported in ${mode} mode.`);
  }

  const current = validate(state.doc.toJSON());
  if (!current.ok || current.value.mode !== "slideshow" || !courseDocument) {
    return failure("invalid_source_document", "The current document has no valid Slideshow Course Structure.");
  }

  const children = directChildren(courseDocument);
  const context: CommandBuildContext = {
    blockDefinitions,
    structure: current.value,
    children,
    createId,
    schema: state.schema,
  };
  let candidate: CandidateMutationResult;
  try {
    candidate = command.type.startsWith("course-section.")
      ? buildCourseSectionCandidate(
          command as Extract<CourseStructureCommand, { type: `course-section.${string}` }>,
          context,
        )
      : buildSurfaceCandidate(
          command as Extract<CourseStructureCommand, { type: `surface.${string}` }>,
          context,
        );
  } catch (error) {
    return failure(
      "schema_rejected_transaction",
      error instanceof Error
        ? error.message
        : "The document schema rejected the Course Structure command.",
    );
  }
  if (!candidate.ok) return Object.freeze(candidate);
  if (sameChildren(children, candidate.value.children)) {
    return failure("no_change", "The Course Structure command would not change the document.");
  }

  const replaced = replaceNodeContentChecked({
    tr: state.tr,
    pos: 0,
    nodeType: "courseDocument",
    content: candidate.value.children,
  });
  if (!replaced.ok) return failure("schema_rejected_transaction", replaced.issue.message);

  try {
    replaced.tr.doc.check();
  } catch (error) {
    return failure(
      "schema_rejected_transaction",
      error instanceof Error ? error.message : "The Course Structure transaction failed schema validation.",
    );
  }

  const validated = validate(replaced.tr.doc.toJSON());
  if (!validated.ok || !postconditionHolds(command, current.value, validated.value)) {
    return failure("invalid_result", "The Course Structure command did not produce its required semantic result.");
  }

  if (candidate.value.selectionSurfaceId) {
    const pos = directChildPositionById(replaced.tr.doc.firstChild, candidate.value.selectionSurfaceId);
    if (pos !== null) setTextSelectionNearInTransaction(replaced.tr, pos + 1);
  }
  return Object.freeze({ ok: true, transaction: replaced.tr, next: validated.value });
}

function postconditionHolds(
  command: CourseStructureCommand,
  before: CourseStructure,
  after: CourseStructure,
): boolean {
  const beforeSurfaces = new Set(before.surfaceIds);
  const afterSurfaces = new Set(after.surfaceIds);
  const beforeSections = before.courseSections.map((section) => section.id);
  const afterSections = after.courseSections.map((section) => section.id);

  switch (command.type) {
    case "course-section.start":
      return after.sectioning === "course-sections" && sameOrderedIds(before.surfaceIds, after.surfaceIds);
    case "course-section.rename":
      return (
        sameOrderedIds(before.surfaceIds, after.surfaceIds) &&
        sameOrderedIds(beforeSections, afterSections) &&
        after.courseSectionById.get(command.courseSectionId)?.title ===
          parseCourseSectionTitle(command.title)
      );
    case "course-section.remove":
      return (
        sameOrderedIds(before.surfaceIds, after.surfaceIds) &&
        after.courseSections.length === before.courseSections.length - 1 &&
        !after.courseSectionById.has(command.courseSectionId)
      );
    case "course-section.move":
      return sameIdSet(beforeSurfaces, afterSurfaces) && sameIdSet(new Set(beforeSections), new Set(afterSections));
    case "course-section.duplicate": {
      const source = before.courseSectionById.get(command.courseSectionId);
      return Boolean(
        source &&
          after.courseSections.length === before.courseSections.length + 1 &&
          after.surfaceIds.length === before.surfaceIds.length + source.surfaceIds.length &&
          [...beforeSurfaces].every((id) => afterSurfaces.has(id)),
      );
    }
    case "surface.insert":
    case "surface.duplicate":
      return (
        after.surfaceIds.length === before.surfaceIds.length + 1 &&
        [...beforeSurfaces].every((id) => afterSurfaces.has(id))
      );
    case "surface.delete":
      return (
        after.surfaceIds.length === before.surfaceIds.length - 1 &&
        !afterSurfaces.has(command.surfaceId) &&
        [...afterSurfaces].every((id) => beforeSurfaces.has(id))
      );
    case "surface.move":
      return sameIdSet(beforeSurfaces, afterSurfaces);
  }
}

function sameOrderedIds(before: readonly string[], after: readonly string[]): boolean {
  return before.length === after.length && before.every((id, index) => id === after[index]);
}

function sameIdSet(before: ReadonlySet<string>, after: ReadonlySet<string>): boolean {
  return before.size === after.size && [...before].every((id) => after.has(id));
}

function failure(
  code: CourseStructureTransactionIssueCode,
  message: string,
): CourseStructureTransactionResult {
  return Object.freeze({ ok: false, issue: transactionIssue(code, message) });
}
