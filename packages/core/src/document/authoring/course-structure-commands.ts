import { Extension } from "@tiptap/core";
import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";

import { getScaffoldCapabilitiesForEditor } from "@/composition/extensions/scaffold-capabilities-storage";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import type { CourseStructureCommand } from "@/document/model/course-structure";
import { applyCourseStructureCommandToTransaction } from "@/document/model/course-structure/transactions";
import { authorizeExplicitLayerStructuralSteps } from "@/document/model/layers/layer-editing-policy";

export function createCourseStructureCommandsExtension({
  createId = createEmbeddedNodeId,
}: {
  /** @internal Deterministic identity source for command-interface tests. */
  readonly createId?: () => string;
} = {}) {
  return Extension.create({
    name: "courseStructureCommands",

    addCommands() {
      return {
        applyCourseStructureCommand:
          (command: CourseStructureCommand) =>
          ({ editor, state, tr, dispatch }) => {
            if (!editor.isEditable) {
              if (dispatch !== undefined) tr.setMeta("preventDispatch", true);
              return false;
            }
            const identityRewrites =
              command.type === "course-section.duplicate" || command.type === "surface.duplicate"
                ? getScaffoldCapabilitiesForEditor(editor).contentIdentity.rewrites
                : undefined;
            const fromStep = tr.steps.length;
            const applied = applyCourseStructureCommandToTransaction({
              ...(identityRewrites ? { identityRewrites } : {}),
              state,
              tr,
              command,
              createId,
            });

            if (!applied && dispatch !== undefined) tr.setMeta("preventDispatch", true);
            if (applied && tr.steps.length > fromStep) {
              authorizeExplicitLayerStructuralSteps(tr, {
                fromStep,
                rootIds: structuralRootIds(command, tr),
              });
            }
            return applied;
          },
      };
    },
  });
}

function structuralRootIds(command: CourseStructureCommand, tr: Transaction): EmbeddedNodeId[] {
  const rootIds = new Set<EmbeddedNodeId>();
  switch (command.type) {
    case "course-section.create": {
      const beforeIds = directCourseChildIds(tr.before);
      for (const id of directCourseChildIds(tr.doc)) {
        if (!beforeIds.has(id)) rootIds.add(id);
      }
      break;
    }
    case "course-section.rename":
    case "course-section.delete":
    case "course-section.duplicate":
      rootIds.add(structuralId(command.courseSectionId));
      break;
    case "surface.insert": {
      const id = command.surface.attrs["id"];
      if (typeof id !== "string" || id.length === 0) {
        throw new Error("Inserted Surface has no stable identity.");
      }
      rootIds.add(structuralId(id));
      break;
    }
    case "surface.duplicate":
    case "surface.delete":
    case "surface.move":
      rootIds.add(structuralId(command.surfaceId));
      break;
  }
  for (const id of changedDirectCourseChildIds(tr.before, tr.doc)) rootIds.add(id);
  if (!sameCourseDocumentAttrs(tr.before, tr.doc)) {
    const courseDocumentId = tr.doc.firstChild?.attrs["id"] ?? tr.before.firstChild?.attrs["id"];
    if (typeof courseDocumentId !== "string" || courseDocumentId.length === 0) {
      throw new Error("Course Document structural operation requires a stable identity.");
    }
    rootIds.add(courseDocumentId as EmbeddedNodeId);
  }
  return [...rootIds];
}

function directCourseChildIds(doc: ProseMirrorNode): Set<EmbeddedNodeId> {
  const ids = new Set<EmbeddedNodeId>();
  doc.firstChild?.forEach((node) => {
    const id = node.attrs["id"];
    if (typeof id === "string" && id.length > 0) ids.add(id as EmbeddedNodeId);
  });
  return ids;
}

function structuralId(value: string): EmbeddedNodeId {
  if (value.length === 0) throw new Error("Structural operation identity cannot be empty.");
  return value as EmbeddedNodeId;
}

function changedDirectCourseChildIds(
  before: ProseMirrorNode,
  after: ProseMirrorNode,
): readonly EmbeddedNodeId[] {
  const beforeChildren = directCourseChildrenById(before);
  const afterChildren = directCourseChildrenById(after);
  const changed = new Set<EmbeddedNodeId>();
  for (const [id, node] of beforeChildren) {
    const next = afterChildren.get(id);
    if (!next || !next.eq(node)) changed.add(id);
  }
  for (const [id, node] of afterChildren) {
    const previous = beforeChildren.get(id);
    if (!previous || !previous.eq(node)) changed.add(id);
  }
  return [...changed];
}

function directCourseChildrenById(doc: ProseMirrorNode): Map<EmbeddedNodeId, ProseMirrorNode> {
  const children = new Map<EmbeddedNodeId, ProseMirrorNode>();
  doc.firstChild?.forEach((node) => {
    const id = node.attrs["id"];
    if (typeof id !== "string" || id.length === 0) {
      throw new Error(`Course Structure child "${node.type.name}" has no stable identity.`);
    }
    if (children.has(id as EmbeddedNodeId)) {
      throw new Error(`Duplicate Course Structure identity "${id}".`);
    }
    children.set(id as EmbeddedNodeId, node);
  });
  return children;
}

function sameCourseDocumentAttrs(before: ProseMirrorNode, after: ProseMirrorNode): boolean {
  return JSON.stringify(before.firstChild?.attrs) === JSON.stringify(after.firstChild?.attrs);
}
